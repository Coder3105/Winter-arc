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

const anonymous = await fetch(`${baseUrl}/api/v1/daily-quest/today`);
assert.equal(anonymous.status, 401);
console.log("ANONYMOUS_TODAY=401");

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "user-agent": "WinterArc-Phase4-Verification",
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
  const firstResponse = await fetch(`${baseUrl}/api/v1/daily-quest/today`, { headers });
  assert.equal(firstResponse.status, 200);
  const first = (await firstResponse.json()).data;
  if (first.kind === "UNAVAILABLE") {
    console.log(`LIVE_QUEST=BLOCKED_${first.reason}`);
  } else {
    const second = (
      await (await fetch(`${baseUrl}/api/v1/daily-quest/today`, { headers })).json()
    ).data;
    assert.equal(
      second.quest.id,
      first.quest.id,
      "Repeated access returned a different quest.",
    );
    const hydration = first.quest.rules.find((rule) => rule.key === "hydration");
    assert(hydration);
    const safeValue = typeof hydration.actual === "number" ? hydration.actual : 0;
    const update = await fetch(`${baseUrl}/api/v1/daily-quest/today`, {
      method: "PATCH",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ key: "hydration", value: safeValue }),
    });
    assert.equal(update.status, 200);
    const updated = (await update.json()).data.quest;
    assert.equal(
      updated.rules.find((rule) => rule.key === "hydration").actual,
      safeValue,
    );
    const historical = await fetch(`${baseUrl}/api/v1/daily-quest/${first.quest.date}`, {
      headers,
    });
    assert.equal(historical.status, 200);
    assert.equal((await historical.json()).data.quest.id, first.quest.id);
    console.log("TODAY_CREATE_UPDATE_READ=PASS");
    console.log("IDEMPOTENT_RECORD=PASS");
  }
} finally {
  const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
    method: "POST",
    headers,
  });
  assert.equal(logout.status, 200);
  assert.equal(
    (await fetch(`${baseUrl}/api/v1/daily-quest/today`, { headers })).status,
    401,
  );
  console.log("VERIFICATION_SESSION_REVOKED=PASS");
}
