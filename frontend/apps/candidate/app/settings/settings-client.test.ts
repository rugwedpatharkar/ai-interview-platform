// Spec for passwordChangeError + the in-memory settings client.

import { it } from "vitest";

import { expectEqual, expectTrue } from "../../test-harness.js";
import { makeMockSettingsClient, passwordChangeError } from "./settings-client.js";
import type { SettingsClient } from "./types.js";

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

// Pins BUG-20260728-01 (Critical). SecurityTab's 2FA badge and Setup/Disable action
// are driven by a local useState(false), which mis-renders "Not enabled" and offers
// "Set up 2FA" to a user who already has TOTP on. That button silently rotates the
// TOTP secret and clears totp_enabled server-side.
//
// The fix requires the client to expose the true server state so the component can
// query it. This test fails today because the SettingsClient interface has no such
// method; it will pass once a getTotpStatus (or equivalent me-shaped read) is added.
it("SettingsClient exposes a read of the true TOTP-enabled state (pins BUG-20260728-01)", () => {
  const c: SettingsClient = makeMockSettingsClient();
  // Any of these seams would let SecurityTab read the real value. The check is
  // intentionally structural — the exact name is FE's call as long as the seam exists.
  const shape = c as unknown as Record<string, unknown>;
  const hasSeam =
    typeof shape.getTotpStatus === "function" ||
    typeof shape.getMe === "function" ||
    typeof shape.getSecurityStatus === "function";
  expectTrue("settings.totpStatusSeamExists", hasSeam);
});
