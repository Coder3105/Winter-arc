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

for (const endpoint of [
  "notifications",
  "notifications/unread-count",
  "notification-preferences",
]) {
  const response = await fetch(`${baseUrl}/api/v1/${endpoint}`);
  assert.equal(response.status, 401);
}
console.log("ANONYMOUS_PHASE11_APIS=401");

const scheduler = await fetch(`${baseUrl}/api/internal/notifications/evaluate`, {
  method: "POST",
});
assert.equal(scheduler.status, 401);
assert.doesNotMatch(await scheduler.text(), /CRON_SECRET|Bearer\s+[A-Za-z0-9]/);
console.log("INTERNAL_SCHEDULER_MISSING_AUTH=401");

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "user-agent": "WinterArc-Phase11-Verification",
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
  for (const endpoint of [
    "notifications",
    "notifications/unread-count",
    "notification-preferences",
  ]) {
    const response = await fetch(`${baseUrl}/api/v1/${endpoint}`, { headers });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /private/);
    console.log(`${endpoint.replaceAll("/", "_").toUpperCase()}=PASS`);
  }

  const preferences = await fetch(`${baseUrl}/api/v1/notification-preferences`, {
    headers,
  }).then((response) => response.json());
  if (preferences.data.kind === "AVAILABLE") {
    assert.equal(typeof preferences.data.preferences.enabled, "boolean");
    assert.equal(typeof preferences.data.preferences.timezone, "string");
    console.log(
      `NOTIFICATION_PREFERENCES=${preferences.data.preferences.isPersisted ? "PERSISTED" : "SAFE_DEFAULTS"}`,
    );
  } else {
    assert.equal(preferences.data.reason, "PROFILE_REQUIRED");
    console.log("NOTIFICATION_PREFERENCES=BLOCKED_PROFILE_REQUIRED");
  }

  for (const page of ["notifications", "profile/notifications"]) {
    const response = await fetch(`${baseUrl}/${page}`, { headers });
    assert.equal(response.status, 200);
    console.log(`${page.replaceAll("/", "_").toUpperCase()}_PAGE=PASS`);
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
  assert.equal((await fetch(`${baseUrl}/api/v1/notifications`, { headers })).status, 401);
  console.log("VERIFICATION_SESSION_REVOKED=PASS");
}
