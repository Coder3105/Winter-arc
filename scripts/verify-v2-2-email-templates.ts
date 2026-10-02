import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createGuildInviteEmail,
  createLoginOtpEmail,
  createRegistrationOtpEmail,
} from "../src/server/email/templates/auth-emails";
import { createDailyQuestReminderEmail } from "../src/server/email/templates/daily-quest-reminder-email";

const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function waitForEndpoint(output: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Chrome debugging endpoint timeout.")),
      10_000,
    );
    output.on("data", (chunk) => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match?.[1]) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
}

async function createCdp(endpoint: string) {
  const socket = new WebSocket(endpoint);
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let id = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(String(data));
    if (!message.id) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request?.reject(new Error(message.error.message));
    else request?.resolve(message.result);
  };
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error("Chrome websocket failed."));
  });
  return {
    send<T>(method: string, params: object = {}, sessionId?: string): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const requestId = ++id;
        pending.set(requestId, {
          resolve: (value) => resolve(value as T),
          reject,
        });
        socket.send(
          JSON.stringify({
            id: requestId,
            method,
            params,
            ...(sessionId ? { sessionId } : {}),
          }),
        );
      });
    },
    close() {
      socket.close();
    },
  };
}

const templates = [
  {
    name: "registration",
    message: createRegistrationOtpEmail({
      to: "responsive@example.test",
      otp: "012345",
      expiresInMinutes: 10,
    }),
  },
  {
    name: "login",
    message: createLoginOtpEmail({
      to: "responsive@example.test",
      otp: "012345",
      expiresInMinutes: 10,
    }),
  },
  {
    name: "guild-invite",
    message: createGuildInviteEmail({
      to: "responsive@example.test",
      inviterDisplayName: "Synthetic Hunter",
      otp: "012345",
      expiresInMinutes: 10,
    }),
  },
  {
    name: "daily-quest-reminder",
    message: createDailyQuestReminderEmail({
      to: "responsive@example.test",
      completed: 3,
      total: 5,
      applicationOrigin: "https://winter.example.test",
    }),
  },
] as const;

interface EmailLayoutResult {
  readonly ready: string;
  readonly viewportWidth: number;
  readonly documentWidth: number;
  readonly bodyWidth: number;
  readonly tables: number;
  readonly textLength: number;
}

const profile = await mkdtemp(path.join(tmpdir(), "winter-arc-email-qa-"));
const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
);

let client: Awaited<ReturnType<typeof createCdp>> | undefined;
try {
  client = await createCdp(await waitForEndpoint(chrome.stderr));
  const { targetId } = await client.send<{ targetId: string }>("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await client.send<{ sessionId: string }>(
    "Target.attachToTarget",
    {
      targetId,
      flatten: true,
    },
  );
  await client.send("Page.enable", {}, sessionId);

  for (const { name, message } of templates) {
    for (const width of [320, 600]) {
      await client.send(
        "Emulation.setDeviceMetricsOverride",
        { width, height: 900, deviceScaleFactor: 1, mobile: width === 320 },
        sessionId,
      );
      const url = `data:text/html;base64,${Buffer.from(message.html).toString("base64")}`;
      await client.send("Page.navigate", { url }, sessionId);
      let result: EmailLayoutResult | undefined;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        const evaluation = await client.send<{
          result: { value: EmailLayoutResult };
        }>(
          "Runtime.evaluate",
          {
            returnByValue: true,
            expression: `(() => ({
              ready: document.readyState,
              viewportWidth: innerWidth,
              documentWidth: document.documentElement.scrollWidth,
              bodyWidth: document.body.scrollWidth,
              tables: document.querySelectorAll("table").length,
              textLength: document.body.innerText.length
            }))()`,
          },
          sessionId,
        );
        result = evaluation.result.value;
        if (result?.ready === "complete") break;
      }
      if (
        !result ||
        result.tables < 2 ||
        result.textLength < 20 ||
        result.documentWidth > result.viewportWidth ||
        result.bodyWidth > result.viewportWidth
      ) {
        throw new Error(`Email template layout failed for ${name} at ${width}px.`);
      }
      console.log(
        JSON.stringify({ template: name, viewport: width, horizontalOverflow: false }),
      );
    }
  }
} finally {
  client?.close();
  chrome.kill();
  if (chrome.exitCode === null) {
    await Promise.race([
      once(chrome, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
