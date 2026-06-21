import type { ApiClients } from "@ip/api-client";

import type {
  NotificationPrefs,
  SessionDTO,
  SettingsClient,
  SetupTotpResult,
  VerifyTotpResult,
} from "./types.js";
import { EMAIL_CATEGORIES } from "./types.js";

export const MIN_PASSWORD_LEN = 8; // mirror the server register policy

const SESSIONS_KEY = ["settings", "sessions"] as const;
const PREFS_KEY = ["settings", "prefs"] as const;

/** Client-side guard mirroring the server's password rules; returns an error string or null.
 *  The server stays the authority — this only saves a round-trip on obvious mistakes. */
export function passwordChangeError(
  _current: string,
  next: string,
  confirm: string,
): string | null {
  if (next.length < MIN_PASSWORD_LEN)
    return `New password must be at least ${MIN_PASSWORD_LEN} characters.`;
  if (next !== confirm) return "New password and confirmation don't match.";
  return null;
}

/** In-memory settings client for building the screen before `api.settings` lands. */
export function makeMockSettingsClient(): SettingsClient {
  const sessions: SessionDTO[] = [
    {
      jti: "j1",
      ip: "203.0.113.4",
      userAgent: "Chrome on macOS",
      createdAt: "2026-06-19T09:00:00Z",
      lastSeenAt: "2026-06-20T08:40:00Z",
      current: true,
    },
    {
      jti: "j2",
      ip: "198.51.100.9",
      userAgent: "Safari on iPhone",
      createdAt: "2026-06-15T12:00:00Z",
      lastSeenAt: "2026-06-18T20:10:00Z",
      current: false,
    },
  ];
  let prefs: NotificationPrefs = {
    emailCategories: Object.fromEntries(EMAIL_CATEGORIES.map((c) => [c.key, true])),
    smsCritical: false,
    digest: "off",
  };
  return {
    changePassword: async () => undefined,
    requestEmailChange: async () => undefined,
    verifyEmailChange: async () => undefined,
    setupTotp: async (): Promise<SetupTotpResult> => ({
      provisioningUri:
        "otpauth://totp/Aptura:you@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Aptura",
      secret: "JBSWY3DPEHPK3PXP",
    }),
    verifyTotp: async (): Promise<VerifyTotpResult> => ({
      enabled: true,
      recoveryCodes: Array.from({ length: 10 }, (_, i) => `aptura-${1000 + i}-${2000 + i}`),
    }),
    disableTotp: async () => undefined,
    listSessions: async () => sessions.slice(),
    revokeSession: async (jti) => {
      const i = sessions.findIndex((s) => s.jti === jti);
      if (i >= 0) sessions.splice(i, 1);
    },
    revokeAllSessions: async () => {
      for (let i = sessions.length - 1; i >= 0; i--)
        if (!sessions[i]!.current) sessions.splice(i, 1);
    },
    getPrefs: async () => prefs,
    setPrefs: async (next) => {
      prefs = next;
      return prefs;
    },
    sessionsQueryKey: () => SESSIONS_KEY,
    prefsQueryKey: () => PREFS_KEY,
  };
}

// protobuf map<> + message fields deserialize as a plain object / undefined — normalize to
// the DTO shape so the view never has to defend against absent fields.
function normalizePrefs(p: NotificationPrefs): NotificationPrefs {
  return {
    emailCategories: p.emailCategories ?? {},
    smsCritical: Boolean(p.smsCritical),
    digest: (p.digest ?? "off") as NotificationPrefs["digest"],
    quietHours: p.quietHours,
  };
}

// Gen `SessionDTO` uses `lastSeen` (proto last_seen); the FE seam uses `lastSeenAt`. Remap
// at this boundary so the rest of the screen reads the seam shape verbatim.
type GenSession = Omit<SessionDTO, "lastSeenAt"> & { lastSeen: string };
function adaptSession(s: GenSession): SessionDTO {
  return {
    jti: s.jti,
    ip: s.ip,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeen,
    current: s.current,
  };
}

// Real client over the admin transport. protobuf-es accepts plain object literals at the
// call boundary, so we don't need the request schemas here. No try/except — the React layer
// renders ConnectError via errorMessage(...).
export function makeApiSettingsClient(api: ApiClients): SettingsClient {
  const s = api.settings;
  return {
    changePassword: async (currentPassword, newPassword) => {
      await s.changePassword({ currentPassword, newPassword });
    },
    requestEmailChange: async (newEmail) => {
      await s.requestEmailChange({ newEmail });
    },
    verifyEmailChange: async (token) => {
      await s.verifyEmailChange({ token });
    },
    setupTotp: async () => {
      const r = await s.setupTotp({});
      return { provisioningUri: r.provisioningUri, secret: r.secret };
    },
    verifyTotp: async (code) => {
      const r = await s.verifyTotp({ code });
      return { enabled: r.enabled, recoveryCodes: r.recoveryCodes };
    },
    disableTotp: async (code) => {
      await s.disableTotp({ code });
    },
    listSessions: async () =>
      (await s.listSessions({})).sessions.map((row) => adaptSession(row as GenSession)),
    revokeSession: async (jti) => {
      await s.revokeSession({ jti });
    },
    revokeAllSessions: async () => {
      await s.revokeAllSessions({});
    },
    getPrefs: async () => normalizePrefs((await s.getNotificationPrefs({})) as NotificationPrefs),
    setPrefs: async (prefs) =>
      normalizePrefs((await s.setNotificationPrefs(prefs)) as NotificationPrefs),
    sessionsQueryKey: () => SESSIONS_KEY,
    prefsQueryKey: () => PREFS_KEY,
  };
}

// Mock when NEXT_PUBLIC_MOCK=1 (fixture-driven dev), else the live gRPC client.
export const USE_MOCK_SETTINGS = process.env.NEXT_PUBLIC_MOCK === "1";

/** Returns the active SettingsClient for the calling component. Live by default; mock when
 *  NEXT_PUBLIC_MOCK=1. The consumer memoizes (`useMemo`) so the mock's in-memory store survives
 *  re-renders. */
export function makeSettingsClient(api: ApiClients): SettingsClient {
  return USE_MOCK_SETTINGS ? makeMockSettingsClient() : makeApiSettingsClient(api);
}
