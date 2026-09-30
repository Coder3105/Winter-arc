import assert from "node:assert/strict";

const baseUrl = process.env.WINTER_ARC_VERIFY_URL ?? "http://127.0.0.1:3211";
const parsed = new URL(baseUrl);
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname),
  "Verification must use a local server.",
);
assert(
  process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD,
  "Owner credentials are required.",
);

const health = await fetch(`${baseUrl}/api/v1/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).data.database, "connected");
console.log("HEALTH_AND_ATLAS=PASS");

assert.equal((await fetch(`${baseUrl}/api/v1/calendar?month=2026-10`)).status, 401);
assert.equal((await fetch(`${baseUrl}/api/v1/streaks`)).status, 401);
console.log("ANONYMOUS_HISTORY=401");

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "user-agent": "WinterArc-Phase5-Verification",
  },
  body: JSON.stringify({
    email: process.env.OWNER_EMAIL,
    password: process.env.OWNER_PASSWORD,
  }),
});
assert.equal(login.status, 200, "Login failed; credentials are not printed.");
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
assert(cookie);
const headers = { cookie };

try {
  for (const [label, path] of [
    ["CALENDAR", "/api/v1/calendar?month=2026-10"],
    ["STREAKS", "/api/v1/streaks"],
  ]) {
    const response = await fetch(`${baseUrl}${path}`, { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /private/);
    const data = (await response.json()).data;
    if (data.kind === "UNAVAILABLE") {
      console.log(`${label}=BLOCKED_${data.reason}`);
    } else {
      console.log(`${label}=PASS`);
    }
  }
} finally {
  const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: "POST",
    headers,
  });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/v1/streaks`, { headers })).status, 401);
  console.log("VERIFICATION_SESSION_REVOKED=PASS");
}
