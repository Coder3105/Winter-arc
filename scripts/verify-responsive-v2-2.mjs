import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const baseUrl = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3211";
const chromePath =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

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
  const handlers = new Map();
  let id = 0;
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) request?.reject(new Error(message.error.message));
      else request?.resolve(message.result);
      return;
    }
    const handler = handlers.get(message.method);
    if (handler) void handler(message.params, message.sessionId);
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
    on(method, handler) {
      handlers.set(method, handler);
    },
    close() {
      socket.close();
    },
  };
}

const profile = await mkdtemp(path.join(tmpdir(), "winter-arc-v2-2-responsive-"));
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
  await client.send("Page.enable", {}, sessionId);
  await client.send("Runtime.enable", {}, sessionId);
  await client.send(
    "Fetch.enable",
    { patterns: [{ urlPattern: "*/api/v1/auth/*/request*", requestStage: "Request" }] },
    sessionId,
  );
  client.on("Fetch.requestPaused", async ({ requestId: pausedId }, eventSessionId) => {
    const body = Buffer.from(
      JSON.stringify({
        success: true,
        data: {
          requestId: "a".repeat(43),
          expiresInSeconds: 600,
          resendAvailableInSeconds: 60,
          message: "If the account is eligible, an authentication code has been sent.",
        },
      }),
    ).toString("base64");
    await client.send(
      "Fetch.fulfillRequest",
      {
        requestId: pausedId,
        responseCode: 202,
        responseHeaders: [
          { name: "content-type", value: "application/json" },
          { name: "cache-control", value: "private, no-store" },
        ],
        body,
      },
      eventSessionId,
    );
  });

  async function evaluate(expression) {
    const response = await client.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ?? "Browser evaluation failed.",
      );
    }
    return response.result.value;
  }

  async function waitUntil(expression) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (await evaluate(expression)) return;
    }
    throw new Error("Responsive state timeout.");
  }

  async function navigate(route) {
    await client.send("Page.navigate", { url: `${baseUrl}${route}` }, sessionId);
    await waitUntil(
      `document.readyState === "complete" && document.body.innerText.length > 20`,
    );
    // Navigation readiness can precede React client hydration on a fast production load.
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  async function assertLayout(label) {
    const state = await evaluate(`(() => ({
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      main: Boolean(document.querySelector("main")),
      codeInput: Boolean(document.querySelector('input[autocomplete="one-time-code"]')),
      textLength: document.body.innerText.length
    }))()`);
    if (
      !state.main ||
      state.textLength < 20 ||
      state.documentWidth > state.viewportWidth ||
      state.bodyWidth > state.viewportWidth
    ) {
      throw new Error(`Responsive verification failed for ${label}.`);
    }
    return state;
  }

  async function fill(selector, value) {
    await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
  }

  async function clickByText(text) {
    await evaluate(`(() => {
      const button = [...document.querySelectorAll("button")].find((item) => item.textContent.trim().includes(${JSON.stringify(text)}));
      if (!button) throw new Error("Button not found");
      button.click();
    })()`);
  }

  for (const width of [320, 375, 390, 393, 430, 768, 1024]) {
    await client.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 },
      sessionId,
    );

    await navigate("/login");
    await assertLayout(`login password at ${width}px`);

    await clickByText("EMAIL CODE");
    await waitUntil(
      `[...document.querySelectorAll("button")].some((item) => item.textContent.trim().includes("REQUEST ACCESS CODE"))`,
    );
    await fill('input[type="email"]', "responsive@example.test");
    await clickByText("REQUEST ACCESS CODE");
    await waitUntil(
      `Boolean(document.querySelector('input[autocomplete="one-time-code"]'))`,
    );
    const loginOtp = await assertLayout(`login OTP at ${width}px`);
    if (!loginOtp.codeInput) throw new Error(`Login OTP state missing at ${width}px.`);

    await navigate("/register");
    await assertLayout(`registration at ${width}px`);
    await fill('input[type="email"]', "responsive@example.test");
    const passwordInputs = await evaluate(
      `document.querySelectorAll('input[type="password"]').length`,
    );
    if (passwordInputs !== 2) throw new Error("Registration password controls missing.");
    await evaluate(`(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      for (const input of document.querySelectorAll('input[type="password"]')) {
        setter.call(input, "responsive-password");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await clickByText("VERIFY EMAIL");
    await waitUntil(
      `Boolean(document.querySelector('input[autocomplete="one-time-code"]'))`,
    );
    const registrationOtp = await assertLayout(`registration OTP at ${width}px`);
    if (!registrationOtp.codeInput)
      throw new Error(`Registration OTP state missing at ${width}px.`);

    console.log(
      JSON.stringify({
        viewport: width,
        login: "PASS",
        loginOtp: "PASS",
        register: "PASS",
        registerOtp: "PASS",
        horizontalOverflow: false,
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
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
