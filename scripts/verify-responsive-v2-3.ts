import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import mongoose from "mongoose";

import { connectToDatabase } from "../src/server/db/mongoose";
import { createSession } from "../src/server/auth/auth-service";
import { hashPassword } from "../src/server/auth/password";
import { SESSION_COOKIE_NAME } from "../src/server/auth/session-token";
import { AuthSessionModel } from "../src/server/models/auth-session";
import { OnboardingDraftModel } from "../src/server/models/onboarding-draft";
import { OwnerModel } from "../src/server/models/owner";
import { UserProfileModel } from "../src/server/models/user-profile";
import { WinterArcConfigModel } from "../src/server/models/winter-arc-config";

const baseUrl = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3211";
const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function waitForEndpoint(output: NodeJS.ReadableStream) {
  return new Promise<string>((resolve, reject) => {
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

async function cdp(endpoint: string) {
  const socket = new WebSocket(endpoint);
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }
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
    socket.onerror = reject;
  });
  return {
    send(method: string, params: object = {}, sessionId?: string) {
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const requestId = ++id;
        pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
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

const fixtureKey = randomUUID();
const email = `codex-v2-3-responsive-${fixtureKey}@example.test`;
let ownerId: mongoose.Types.ObjectId | null = null;
let chrome: ReturnType<typeof spawn> | null = null;
let client: Awaited<ReturnType<typeof cdp>> | null = null;
let profileDirectory: string | null = null;
const ownerCountBefore = await (async () => {
  await connectToDatabase();
  return OwnerModel.countDocuments({});
})();

try {
  const owner = await OwnerModel.create({
    email,
    emailNormalized: email,
    emailVerifiedAt: new Date(),
    status: "ACTIVE",
    isOriginalOwner: false,
    passwordHash: await hashPassword(`responsive-${fixtureKey}`),
    displayName: "Hunter",
    isActive: true,
    lastLoginAt: new Date(),
  });
  ownerId = owner._id;
  const session = await createSession(owner._id.toString(), "v2.3-responsive-audit");

  profileDirectory = await mkdtemp(path.join(tmpdir(), "winter-arc-v2-3-responsive-"));
  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
  );
  client = await cdp(await waitForEndpoint(chrome.stderr!));
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const browserSession = String(sessionId);
  await client.send("Page.enable", {}, browserSession);
  await client.send("Runtime.enable", {}, browserSession);
  await client.send("Network.enable", {}, browserSession);
  await client.send(
    "Network.setCookie",
    {
      name: SESSION_COOKIE_NAME,
      value: session.token,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
    browserSession,
  );

  async function evaluate(expression: string) {
    const response = await client!.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      browserSession,
    );
    if (response.exceptionDetails) throw new Error("Browser evaluation failed.");
    return (response.result as { value?: unknown })?.value;
  }

  async function waitUntil(expression: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (await evaluate(expression)) return;
    }
    throw new Error("Responsive state timeout.");
  }

  async function navigate() {
    await client!.send("Page.navigate", { url: `${baseUrl}/setup` }, browserSession);
    await waitUntil(
      `document.readyState === "complete" && document.body.innerText.includes("SYSTEM CONFIGURATION")`,
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  async function fill(selector: string, value: string) {
    await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) throw new Error("Input missing");
      const prototype = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
  }

  async function clickStep(label: string) {
    await evaluate(`(() => {
      const button = [...document.querySelectorAll(".setup-progress button")].find((item) => item.textContent.includes(${JSON.stringify(label)}));
      if (!button) throw new Error("Step missing");
      button.click();
    })()`);
    await waitUntil(
      `document.querySelector(".system-panel__header")?.textContent.includes(${JSON.stringify(label)})`,
    );
  }

  async function assertLayout(label: string) {
    const state = (await evaluate(`(() => ({
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      minTouch: Math.min(...[...document.querySelectorAll(".setup-flow button")].filter((item) => getComputedStyle(item).display !== "none").map((item) => item.getBoundingClientRect().height)),
      setup: Boolean(document.querySelector(".setup-flow"))
    }))()`)) as {
      viewportWidth: number;
      documentWidth: number;
      bodyWidth: number;
      minTouch: number;
      setup: boolean;
    };
    if (
      !state.setup ||
      state.documentWidth > state.viewportWidth ||
      state.bodyWidth > state.viewportWidth ||
      state.minTouch < 44
    ) {
      throw new Error(
        `Responsive verification failed for ${label}: ${JSON.stringify(state)}.`,
      );
    }
  }

  for (const width of [320, 375, 390, 393, 430, 768, 1024]) {
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: 1_000, deviceScaleFactor: 1, mobile: width < 768 },
      browserSession,
    );
    await navigate();
    await assertLayout(`identity at ${width}px`);
    await fill('input[autocomplete="nickname"]', "Responsive Hunter");
    await clickStep("PROFILE");
    await assertLayout(`profile at ${width}px`);
    const blankMetrics = await evaluate(
      `[...document.querySelectorAll('.setup-step input[type="number"]')].every((input) => input.value === "")`,
    );
    if (!blankMetrics) throw new Error("New profile fields were not blank.");

    await clickStep("DAILY PROTOCOL");
    await assertLayout(`daily protocol at ${width}px`);
    const catalogue = (await evaluate(`(() => {
      const rows = [...document.querySelectorAll(".rule-row")];
      const noFap = rows.find((row) => row.textContent.includes("NO FAP"));
      return { count: rows.length, noFapChecked: noFap?.querySelector('input[type="checkbox"]')?.checked };
    })()`)) as { count: number; noFapChecked: boolean };
    if (catalogue.count !== 11 || catalogue.noFapChecked) {
      throw new Error("Catalogue or No Fap default is invalid.");
    }
    for (const [placeholder, value] of [
      ["7", "7"],
      ["3", "3"],
      ["10000", "10000"],
    ] as const) {
      await fill(`.rule-row input[placeholder="${placeholder}"]`, value);
    }
    await clickStep("TRAINING");
    await assertLayout(`training at ${width}px`);
    await fill('input[placeholder="Suggested: 4"]', "4");
    await clickStep("WINTER ARC");
    await assertLayout(`winter arc at ${width}px`);
    await fill('input[list="setup-timezones"]', "Asia/Kolkata");
    await fill('input[type="date"]', "2026-10-05");
    await clickStep("ACTIVATE");
    await assertLayout(`confirmation at ${width}px`);
    console.log(
      JSON.stringify({ viewport: width, onboarding: "PASS", horizontalOverflow: false }),
    );
  }
} finally {
  client?.close();
  chrome?.kill();
  if (chrome && chrome.exitCode === null) {
    await Promise.race([
      once(chrome, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  if (profileDirectory) {
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5 });
  }
  if (ownerId) {
    await Promise.all([
      AuthSessionModel.deleteMany({ userId: ownerId }),
      OnboardingDraftModel.deleteMany({ userId: ownerId }),
      UserProfileModel.deleteMany({ userId: ownerId }),
      WinterArcConfigModel.deleteMany({ userId: ownerId }),
    ]);
    await OwnerModel.deleteOne({ _id: ownerId, emailNormalized: email });
  }
  const ownerCountAfter = await OwnerModel.countDocuments({});
  if (ownerCountAfter !== ownerCountBefore) {
    process.exitCode = 1;
    console.error("V2.3 responsive fixture cleanup failed.");
  }
  await mongoose.disconnect();
}
