const baseUrl = process.env.WINTER_ARC_VERIFY_URL ?? "http://127.0.0.1:3211";

if (!process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD) {
  throw new Error("Owner verification credentials are not configured.");
}

const invalidLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: process.env.OWNER_EMAIL,
    password: "definitely-not-the-owner-password",
  }),
});

const login = await fetch(`${baseUrl}/api/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: process.env.OWNER_EMAIL,
    password: process.env.OWNER_PASSWORD,
  }),
});

const loginText = await login.text();
const setCookie = login.headers.get("set-cookie") ?? "";
const cookie = setCookie.split(";", 1)[0] ?? "";
const authenticatedHeaders = { cookie };

async function get(path) {
  return fetch(`${baseUrl}${path}`, { headers: authenticatedHeaders });
}

const me = await get("/api/v1/auth/me");
const meText = await me.text();
const baseline = await get("/api/v1/body-composition/baseline");
const baselineBody = await baseline.json();
const assessments = await get("/api/v1/body-composition");
const assessmentsBody = await assessments.json();
const setupPage = await get("/setup");
const setupText = await setupPage.text();
const profilePage = await get("/profile");
const profileText = await profilePage.text();
const root = await fetch(`${baseUrl}/`, {
  headers: authenticatedHeaders,
  redirect: "manual",
});
const logout = await fetch(`${baseUrl}/api/v1/auth/logout`, {
  method: "POST",
  headers: authenticatedHeaders,
});
const revokedSession = await get("/api/v1/auth/me");

const measurement = baselineBody.data?.baseline?.measurements;

console.log(`INVALID_LOGIN_STATUS=${invalidLogin.status}`);
console.log(`LOGIN_STATUS=${login.status}`);
console.log(`COOKIE_HTTPONLY=${/HttpOnly/i.test(setCookie)}`);
console.log(`COOKIE_SAMESITE_LAX=${/SameSite=Lax/i.test(setCookie)}`);
console.log(`COOKIE_SECURE=${/Secure/i.test(setCookie)}`);
console.log(`LOGIN_EXPOSES_PASSWORD_HASH=${loginText.includes("passwordHash")}`);
console.log(`LOGIN_EXPOSES_TOKEN_HASH=${loginText.includes("tokenHash")}`);
console.log(`ME_STATUS=${me.status}`);
console.log(
  `ME_SAFE_OWNER_FIELDS=${meText.includes('"success":true') && !meText.includes("passwordHash") && !meText.includes("tokenHash")}`,
);
console.log(`BASELINE_STATUS=${baseline.status}`);
console.log(`BASELINE_SOURCE=${baselineBody.data?.baseline?.source ?? "missing"}`);
console.log(`BASELINE_WEIGHT=${measurement?.weightKg ?? "missing"}`);
console.log(`BASELINE_BODY_FAT=${measurement?.percentBodyFat ?? "missing"}`);
console.log(`BASELINE_SKELETAL_MUSCLE=${measurement?.skeletalMuscleMassKg ?? "missing"}`);
console.log(`ASSESSMENT_COUNT=${assessmentsBody.data?.assessments?.length ?? "missing"}`);
console.log(`SETUP_PAGE_STATUS=${setupPage.status}`);
console.log(
  `SETUP_PAGE_HAS_FLOW=${setupText.includes("SYSTEM CONFIGURATION") && setupText.includes("INITIAL STATUS")}`,
);
console.log(`PROFILE_PAGE_STATUS=${profilePage.status}`);
console.log(
  `PROFILE_PAGE_HAS_BASELINE=${profileText.includes("BASELINE ASSESSMENT") && profileText.includes("111.1")}`,
);
console.log(`INCOMPLETE_ROOT_STATUS=${root.status}`);
console.log(
  `INCOMPLETE_ROOT_REDIRECT_SETUP=${root.headers.get("location")?.endsWith("/setup") ?? false}`,
);
console.log(`LOGOUT_STATUS=${logout.status}`);
console.log(`REVOKED_SESSION_STATUS=${revokedSession.status}`);
