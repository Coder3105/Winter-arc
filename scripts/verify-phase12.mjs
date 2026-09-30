import assert from "node:assert/strict";

const baseUrl = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3211";
const email = process.env.OWNER_EMAIL;
const password = process.env.OWNER_PASSWORD;

function cookieFrom(response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

const manifest = await fetch(`${baseUrl}/manifest.webmanifest`);
assert.equal(manifest.status, 200);
const manifestBody = await manifest.json();
assert.equal(manifestBody.id, "/");
assert.equal(manifestBody.display, "standalone");
assert.ok(manifestBody.icons.some((icon) => icon.purpose === "maskable"));

const worker = await fetch(`${baseUrl}/sw.js`);
assert.equal(worker.status, 200);
assert.match(worker.headers.get("cache-control") ?? "", /no-cache|no-store/);
assert.equal(worker.headers.get("service-worker-allowed"), "/");

for (const path of [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/favicon.ico",
  "/offline.html",
  "/install",
]) {
  assert.equal((await fetch(`${baseUrl}${path}`)).status, 200, path);
}

assert.equal((await fetch(`${baseUrl}/api/v1/push/status`)).status, 401);
assert.equal(
  (
    await fetch(`${baseUrl}/api/v1/push/subscriptions`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: "{}",
    })
  ).status,
  401,
);
assert.equal((await fetch(`${baseUrl}/api/internal/notifications/cron`)).status, 401);

let session = "";
try {
  if (email && password) {
    const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    session = cookieFrom(login);
    assert.ok(session);
    const status = await fetch(`${baseUrl}/api/v1/push/status`, {
      headers: { cookie: session },
    });
    assert.equal(status.status, 200);
    assert.equal(status.headers.get("cache-control"), "private, no-store");
    const text = await status.text();
    assert.doesNotMatch(text, /WEB_PUSH_VAPID_PRIVATE_KEY|p256dh|"endpoint"/);
    assert.equal(
      (await fetch(`${baseUrl}/profile/notifications`, { headers: { cookie: session } }))
        .status,
      200,
    );
  }
} finally {
  if (session) {
    await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: { cookie: session },
    });
  }
}

console.log("PHASE12_MANIFEST=PASS");
console.log("PHASE12_SERVICE_WORKER=PASS");
console.log("PHASE12_AUTH_BOUNDARY=PASS");
console.log("PHASE12_LIVE_WEB_PUSH=NOT_VERIFIED_CONFIGURATION_AND_DEVICE_REQUIRED");
