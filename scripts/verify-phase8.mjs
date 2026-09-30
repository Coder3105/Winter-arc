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

assert.equal((await fetch(`${baseUrl}/api/v1/progression`)).status, 401);
console.log("ANONYMOUS_PROGRESSION_API=401");

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "user-agent": "WinterArc-Phase8-Verification",
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
  const progression = await fetch(`${baseUrl}/api/v1/progression`, { headers });
  assert.equal(progression.status, 200);
  assert.match(progression.headers.get("cache-control") ?? "", /private/);
  const projection = (await progression.json()).data;
  console.log(
    projection.kind === "UNAVAILABLE"
      ? `PROGRESSION=BLOCKED_${projection.reason}`
      : "PROGRESSION=PASS",
  );

  const statusPage = await fetch(`${baseUrl}/status`, { headers });
  assert.equal(statusPage.status, 200);
  assert((await statusPage.text()).includes("STATUS"));
  console.log("STATUS_PAGE=PASS");

  const baselineResponse = await fetch(`${baseUrl}/api/v1/body-composition/baseline`, {
    headers,
  });
  assert.equal(baselineResponse.status, 200);
  const baseline = (await baselineResponse.json()).data.baseline;
  assert.equal(baseline.measurements.weightKg, 111.1);
  assert.equal(baseline.measurements.percentBodyFat, 45.3);
  assert.equal(baseline.measurements.bodyFatMassKg, 50.4);
  assert.equal(baseline.measurements.fatFreeMassKg, 60.7);
  assert.equal(baseline.measurements.skeletalMuscleMassKg, 34.3);
  console.log("IMMUTABLE_BASELINE=PASS");
} finally {
  const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: "POST",
    headers,
  });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/v1/progression`, { headers })).status, 401);
  console.log("VERIFICATION_SESSION_REVOKED=PASS");
}
