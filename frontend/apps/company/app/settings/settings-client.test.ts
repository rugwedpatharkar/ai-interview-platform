// Spec for passwordChangeError + the in-memory settings client. Zero-dependency harness
// (no test runner is wired in this monorepo, and adding vitest would churn the shared
// lockfile) — mirrors lib/saved-jobs-client.test.ts: typechecks under the app tsconfig and
// runs via `npx tsx app/settings/settings-client.test.ts`.

import { makeMockSettingsClient, passwordChangeError } from "./settings-client.js";

let failures = 0;

function expectEqual<T>(label: string, actual: T, expected: T): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(
      `✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function expectTrue(label: string, actual: boolean): void {
  if (!actual) {
    failures += 1;
    console.error(`✗ ${label}: expected true`);
  }
}

// passwordChangeError: too-short → message; mismatch → message; valid → null
expectTrue(
  "pw.tooShort",
  /at least 8/i.test(passwordChangeError("old", "short", "short") ?? ""),
);
expectTrue(
  "pw.mismatch",
  /match/i.test(passwordChangeError("old", "longenough1", "different1") ?? ""),
);
expectEqual("pw.valid", passwordChangeError("old", "longenough1", "longenough1"), null);

async function run(): Promise<void> {
  const c = makeMockSettingsClient();

  // setupTotp returns a provisioning uri + secret; verifyTotp returns ≥10 recovery codes
  const setup = await c.setupTotp();
  expectTrue("totp.uri", setup.provisioningUri.includes("otpauth://"));
  const v = await c.verifyTotp("123456");
  expectEqual("totp.enabled", v.enabled, true);
  expectTrue("totp.recovery", v.recoveryCodes.length >= 10);

  // getPrefs returns email-all-on defaults; listSessions marks exactly one current
  const prefs = await c.getPrefs();
  expectEqual("prefs.digest", prefs.digest, "off");
  expectTrue("prefs.allOn", Object.values(prefs.emailCategories).every(Boolean));
  const sessions = await c.listSessions();
  expectTrue("sessions.current", sessions.some((s) => s.current));

  // revokeSession drops the targeted jti; revokeAllSessions keeps only the current one
  await c.revokeSession("j2");
  expectTrue("sessions.revoked", !(await c.listSessions()).some((s) => s.jti === "j2"));
  await c.revokeAllSessions();
  const after = await c.listSessions();
  expectTrue("sessions.onlyCurrent", after.every((s) => s.current));

  if (failures > 0) {
    console.error(`\nsettings-client.test: ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log("settings-client.test: all assertions passed");
  }
}

void run();
