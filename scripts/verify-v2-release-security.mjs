import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const listed = spawnSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
);
if (listed.status !== 0) throw new Error("SECRET_SCAN_FILE_LIST_FAILED");

const trackedLocalEnvironment =
  spawnSync("git", ["ls-files", "--error-unmatch", ".env.local"], { stdio: "ignore" })
    .status === 0;
const localEnvironmentIgnored =
  spawnSync("git", ["check-ignore", "-q", ".env.local"], {
    stdio: "ignore",
  }).status === 0;
if (trackedLocalEnvironment || !localEnvironmentIgnored)
  throw new Error("LOCAL_ENVIRONMENT_TRACKING_INVALID");

const textFile =
  /(?:^|\/)(?:\.env\.example|\.gitignore)$|\.(?:[cm]?[jt]sx?|json|md|css|html|svg|ya?ml|toml)$/i;
const files = listed.stdout.split("\0").filter((file) => file && textFile.test(file));
const findings = [];
const knownSynthetic =
  /synthetic|example|placeholder|redacted|fake|test|private-value|user:password|never|must not|do not|should not/i;

for (const file of files) {
  const content = await readFile(file, "utf8");
  const directPatterns = [
    /mongodb(?:\+srv)?:\/\/[^:\s/"']+:[^@\s/"']+@/i,
    /\bre_[A-Za-z0-9_-]{24,}\b/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PASSWORD|PRIVATE|PEPPER|MONGODB|GMAIL)/,
  ];
  for (const line of content.split(/\r?\n/))
    if (
      directPatterns.some((pattern) => pattern.test(line)) &&
      !knownSynthetic.test(line)
    )
      findings.push(file);

  const assignment =
    /^(?:GMAIL_APP_PASSWORD|OTP_PEPPER|CRON_SECRET|WEB_PUSH_VAPID_PRIVATE_KEY|RESEND_API_KEY|MONGODB_URI)[ \t]*=[ \t]*(.+)$/gm;
  for (const match of content.matchAll(assignment)) {
    const value = match[1]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
    if (value && !knownSynthetic.test(value)) findings.push(file);
  }
}

if (findings.length > 0) {
  console.error(JSON.stringify({ potentialSecretFiles: [...new Set(findings)].sort() }));
  throw new Error("POTENTIAL_SECRET_FOUND");
}

console.log(
  JSON.stringify({
    secretScan: "PASS",
    filesScanned: files.length,
    findings: 0,
    envLocalTracked: false,
    envLocalIgnored: true,
    secretValuesLogged: false,
  }),
);
