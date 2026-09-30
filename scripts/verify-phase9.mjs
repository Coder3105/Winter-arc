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

const endpoints = ["achievements", "rewards", "recovery"];
const health = await fetch(`${baseUrl}/api/v1/health`);
assert.equal(health.status, 200);
assert.equal((await health.json()).data.database, "connected");
console.log("HEALTH_AND_ATLAS=PASS");

for (const endpoint of endpoints)
  assert.equal((await fetch(`${baseUrl}/api/v1/${endpoint}`)).status, 401);
console.log("ANONYMOUS_PHASE9_APIS=401");

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "user-agent": "WinterArc-Phase9-Verification",
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
  for (const endpoint of endpoints) {
    const response = await fetch(`${baseUrl}/api/v1/${endpoint}`, { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /private/);
    const projection = (await response.json()).data;
    console.log(
      `${endpoint.toUpperCase()}=${projection.kind === "UNAVAILABLE" ? `BLOCKED_${projection.reason}` : "PASS"}`,
    );
  }
  const progression = await fetch(`${baseUrl}/api/v1/progression`, { headers });
  assert.equal(progression.status, 200);
  assert.match(progression.headers.get("cache-control") ?? "", /private/);
  console.log("PROGRESSION_PHASE9_PROJECTION=PASS");

  for (const page of ["status", "achievements", "rewards"]) {
    const response = await fetch(`${baseUrl}/${page}`, { headers });
    assert.equal(response.status, 200);
    console.log(`${page.toUpperCase()}_PAGE=PASS`);
  }

  const baselineResponse = await fetch(`${baseUrl}/api/v1/body-composition/baseline`, {
    headers,
  });
  assert.equal(baselineResponse.status, 200);
  const baseline = (await baselineResponse.json()).data.baseline;
  assert.deepEqual(
    [
      baseline.measurements.weightKg,
      baseline.measurements.percentBodyFat,
      baseline.measurements.bodyFatMassKg,
      baseline.measurements.fatFreeMassKg,
      baseline.measurements.skeletalMuscleMassKg,
    ],
    [111.1, 45.3, 50.4, 60.7, 34.3],
  );
  console.log("IMMUTABLE_BASELINE=PASS");
} finally {
  const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: "POST",
    headers,
  });
  assert.equal(logout.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/v1/achievements`, { headers })).status, 401);
  console.log("VERIFICATION_SESSION_REVOKED=PASS");
}
