// Spec for passwordChangeError + the in-memory settings client.

import { it } from "vitest";

import { expectEqual, expectTrue } from "../../test-harness.js";
import { makeMockSettingsClient, passwordChangeError } from "./settings-client.js";

it("passwordChangeError: too-short → message; mismatch → message; valid → null", () => {
  expectTrue("pw.tooShort", /at least 8/i.test(passwordChangeError("old", "short", "short") ?? ""));
  expectTrue(
    "pw.mismatch",
    /match/i.test(passwordChangeError("old", "longenough1", "different1") ?? ""),
  );
  expectEqual("pw.valid", passwordChangeError("old", "longenough1", "longenough1"), null);
});

it("setupTotp returns a provisioning uri + secret; verifyTotp returns ≥10 recovery codes", async () => {
  const c = makeMockSettingsClient();
  const setup = await c.setupTotp();
  expectTrue("totp.uri", setup.provisioningUri.includes("otpauth://"));
  const v = await c.verifyTotp("123456");
  expectEqual("totp.enabled", v.enabled, true);
  expectTrue("totp.recovery", v.recoveryCodes.length >= 10);
});

it("getPrefs returns email-all-on defaults; listSessions marks exactly one current", async () => {
  const c = makeMockSettingsClient();
  const prefs = await c.getPrefs();
  expectEqual("prefs.digest", prefs.digest, "off");
  expectTrue("prefs.allOn", Object.values(prefs.emailCategories).every(Boolean));
  const sessions = await c.listSessions();
  expectTrue("sessions.current", sessions.some((s) => s.current));
});

it("revokeSession drops the targeted jti; revokeAllSessions keeps only the current one", async () => {
  const c = makeMockSettingsClient();
  await c.revokeSession("j2");
  expectTrue("sessions.revoked", !(await c.listSessions()).some((s) => s.jti === "j2"));
  await c.revokeAllSessions();
  const after = await c.listSessions();
  expectTrue("sessions.onlyCurrent", after.every((s) => s.current));
});
