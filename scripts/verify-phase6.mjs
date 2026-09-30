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

for (const [method, path] of [
  ["GET", "/api/v1/workouts/today"],
  ["GET", "/api/v1/workouts/week"],
  ["POST", "/api/v1/workouts"],
  ["DELETE", "/api/v1/workouts/507f1f77bcf86cd799439011"],
]) {
  const response = await fetch(`${baseUrl}${path}`, { method });
  assert.equal(response.status, 401);
}
console.log("ANONYMOUS_WORKOUT_APIS=401");

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "user-agent": "WinterArc-Phase6-Verification",
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
    ["TODAY_WORKOUTS", "/api/v1/workouts/today"],
    ["WEEKLY_MISSION", "/api/v1/workouts/week"],
  ]) {
    const response = await fetch(`${baseUrl}${path}`, { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /private/);
    const data = (await response.json()).data;
    console.log(
      data.kind === "UNAVAILABLE" ? `${label}=BLOCKED_${data.reason}` : `${label}=PASS`,
    );
  }
} finally {
  const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: "POST",
    headers,
  });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/v1/workouts/week`, { headers })).status, 401);
  console.log("VERIFICATION_SESSION_REVOKED=PASS");
}
