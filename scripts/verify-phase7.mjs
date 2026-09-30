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
  ["GET", "/api/v1/weights/today"],
  ["PUT", "/api/v1/weights/today"],
  ["DELETE", "/api/v1/weights/today"],
  ["GET", "/api/v1/weights?from=2026-09-01&to=2026-09-30"],
  ["GET", "/api/v1/weights/summary"],
]) {
  const response = await fetch(`${baseUrl}${path}`, { method });
  assert.equal(response.status, 401);
}
console.log("ANONYMOUS_WEIGHT_APIS=401");

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "user-agent": "WinterArc-Phase7-Verification",
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
    ["TODAY_WEIGHT", "/api/v1/weights/today"],
    ["WEIGHT_HISTORY", "/api/v1/weights?from=2026-09-01&to=2026-09-30"],
    ["WEIGHT_SUMMARY", "/api/v1/weights/summary"],
  ]) {
    const response = await fetch(`${baseUrl}${path}`, { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /private/);
    const data = (await response.json()).data;
    console.log(
      data.kind === "UNAVAILABLE" ? `${label}=BLOCKED_${data.reason}` : `${label}=PASS`,
    );
  }

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

  const progress = await fetch(`${baseUrl}/progress`, { headers });
  assert.equal(progress.status, 200);
  console.log("PROGRESS_PAGE=PASS");
} finally {
  const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: "POST",
    headers,
  });
  assert.equal(logout.status, 200);
  assert.equal(
    (await fetch(`${baseUrl}/api/v1/weights/summary`, { headers })).status,
    401,
  );
  console.log("VERIFICATION_SESSION_REVOKED=PASS");
}
