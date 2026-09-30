import assert from "node:assert/strict";

const baseUrl = process.env.WINTER_ARC_VERIFY_URL ?? "http://127.0.0.1:3211";
const endpoint = new URL(baseUrl);
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname),
  "Verification must use a local server.",
);
assert(
  process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD,
  "Owner verification credentials must be configured.",
);

const health = await fetch(`${baseUrl}/api/v1/health`);
assert.equal(health.status, 200);
const healthBody = await health.json();
assert.equal(healthBody.data.database, "connected");
assert.equal(healthBody.data.databaseName, "winter_arc");
console.log("HEALTH_AND_ATLAS=PASS");
const unauthorized = await fetch(
  `${baseUrl}/api/v1/calculations/summary?userId=not-the-owner`,
);
assert.equal(unauthorized.status, 401);
console.log("UNAUTHENTICATED_SUMMARY=401");

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "user-agent": "WinterArc-Phase3-Verification",
  },
  body: JSON.stringify({
    email: process.env.OWNER_EMAIL,
    password: process.env.OWNER_PASSWORD,
  }),
});
assert.equal(login.status, 200, "Login failed; credentials were not printed.");
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
assert(cookie, "Session cookie is required.");
const headers = { cookie };
async function read(path) {
  const response = await fetch(`${baseUrl}${path}`, { headers });
  assert.equal(response.status, 200, `Request failed for ${path}`);
  return response;
}

try {
  const before = (await (await read("/api/v1/body-composition/baseline")).json()).data
    .baseline;
  assert(before, "A baseline is required for verification.");
  const summaryResponse = await read("/api/v1/calculations/summary?userId=not-the-owner");
  assert.equal(summaryResponse.headers.get("cache-control"), "private, no-store");
  const summaryText = await summaryResponse.text();
  assert(
    !/passwordHash|tokenHash|mongodb\+srv/.test(summaryText),
    "Unexpected private field in response.",
  );
  const summary = JSON.parse(summaryText).data;
  assert.equal(summary.baselineSource.assessmentId, before.id);
  assert.equal(summary.baselineSource.bodyFatMassKg, 50.4);
  assert.equal(summary.baselineSource.bmrReported, 1681);
  const near = (actual, expected) =>
    assert(
      Math.abs(actual - expected) < 1e-8,
      "Calculated result differs from expected formula.",
    );
  const source = summary.source;
  const derived = summary.calculated;
  near(derived.bmi, source.weightKg / (source.heightCm / 100) ** 2);
  near(derived.bodyFatMassDerivedKg, (source.weightKg * source.bodyFatPercent) / 100);
  near(derived.fatFreeMassDerivedKg, source.weightKg - source.bodyFatMassKg);
  near(derived.bmr.katchMcArdle.value, 370 + 21.6 * source.fatFreeMassKg);
  if (derived.bmr.mifflinStJeor) {
    const inputs = summary.inputs.mifflin;
    near(
      derived.bmr.mifflinStJeor.value,
      10 * inputs.weightKg +
        6.25 * inputs.heightCm -
        5 * inputs.ageYears +
        (inputs.sex === "male" ? 5 : -161),
    );
  } else {
    assert(
      summary.unavailable.mifflinStJeor,
      "Missing estimate must have an explicit reason.",
    );
  }
  console.log("AUTHENTICATED_SUMMARY=PASS");
  console.log(`BMI=${derived.bmi}`);
  console.log(`DERIVED_FAT_MASS_KG=${derived.bodyFatMassDerivedKg}`);
  console.log(`KATCH_BMR=${derived.bmr.katchMcArdle.value}`);
  console.log(
    `MIFFLIN_BMR=${derived.bmr.mifflinStJeor?.value ?? summary.unavailable.mifflinStJeor}`,
  );
  const markup = await (await read("/profile")).text();
  for (const label of [
    "CALCULATED METRICS",
    "BMI // CALCULATED",
    "KATCH-MCARDLE // ESTIMATE",
    "MIFFLIN-ST JEOR // ESTIMATE",
    "BASELINE ASSESSMENT",
  ])
    assert(markup.includes(label), `Profile missing ${label}`);
  const after = (await (await read("/api/v1/body-composition/baseline")).json()).data
    .baseline;
  assert.deepEqual(after, before, "Baseline changed during verification.");
  console.log("PROFILE_CALCULATED_METRICS=PASS");
  console.log("BASELINE_UNCHANGED=PASS");
} finally {
  const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: "POST",
    headers,
  });
  assert.equal(logout.status, 200, "Verification session logout failed.");
  const revoked = await fetch(`${baseUrl}/api/v1/calculations/summary`, { headers });
  assert.equal(revoked.status, 401, "Verification session was not revoked.");
  console.log("VERIFICATION_SESSION_REVOKED=PASS");
}
