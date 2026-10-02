import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const baseUrl = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3211";
const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
if (!process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD)
  throw new Error("Responsive verification credentials are not configured.");

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function waitForEndpoint(output) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Chrome debugging endpoint timeout.")),
      10_000,
    );
    output.on("data", (chunk) => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
}

async function cdp(endpoint) {
  const socket = new WebSocket(endpoint);
  const pending = new Map();
  let id = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (!message.id) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request?.reject(new Error(message.error.message));
    else request?.resolve(message.result);
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  return {
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const requestId = ++id;
        pending.set(requestId, { resolve, reject });
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

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: process.env.OWNER_EMAIL,
    password: process.env.OWNER_PASSWORD,
  }),
});
if (login.status !== 200) throw new Error("Responsive verification login failed.");
const cookie = cookieFrom(login);
const [cookieName, cookieValue] = cookie.split("=", 2);
if (!cookieName || !cookieValue)
  throw new Error("Responsive verification session missing.");

const profile = await mkdtemp(path.join(tmpdir(), "winter-arc-responsive-"));
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

let client;
try {
  client = await cdp(await waitForEndpoint(chrome.stderr));
  const { targetId } = await client.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await client.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await client.send("Network.enable", {}, sessionId);
  const setCookie = await client.send(
    "Network.setCookie",
    {
      name: cookieName,
      value: cookieValue,
      url: baseUrl,
      httpOnly: true,
      sameSite: "Lax",
    },
    sessionId,
  );
  if (!setCookie.success) throw new Error("Responsive verification cookie rejected.");
  await client.send("Page.enable", {}, sessionId);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 900 },
  ]) {
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      { ...viewport, deviceScaleFactor: 1, mobile: viewport.width === 390 },
      sessionId,
    );
    await client.send("Page.navigate", { url: `${baseUrl}/today` }, sessionId);
    let state;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const evaluation = await client.send(
        "Runtime.evaluate",
        {
          returnByValue: true,
          expression: `(() => ({
            ready: document.readyState,
            path: location.pathname,
            viewportWidth: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            bodyWidth: document.body.scrollWidth,
            header: Boolean(document.querySelector("header")),
            main: Boolean(document.querySelector("main")),
            textLength: document.body.innerText.length
          }))()`,
        },
        sessionId,
      );
      state = evaluation.result.value;
      if (state?.ready === "complete" && state.textLength > 20) break;
    }
    if (
      !state ||
      state.path !== "/today" ||
      !state.header ||
      !state.main ||
      state.documentWidth > state.viewportWidth ||
      state.bodyWidth > state.viewportWidth
    ) {
      throw new Error(`Responsive verification failed at ${viewport.width}px.`);
    }
    console.log(
      JSON.stringify({
        viewport: viewport.width,
        path: state.path,
        horizontalOverflow: false,
        header: true,
        main: true,
      }),
    );
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
  await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: "POST",
    headers: { cookie },
  }).catch(() => undefined);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
