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

// Structural view of the generated `api.settings` surface. Defined locally so the real factory
// typechecks before `pnpm gen` lands `api.settings` on ApiClients; at integration, swap the
// param type to `ApiClients` from "@ip/api-client" and drop this interface (one-line change).
interface SettingsApiLike {
  settings: {
    changePassword(req: {
      currentPassword: string;
      newPassword: string;
    }): Promise<{ ok: boolean }>;
    requestEmailChange(req: { newEmail: string }): Promise<{ ok: boolean }>;
    verifyEmailChange(req: { token: string }): Promise<{ ok: boolean }>;
    setupTotp(req: Record<string, never>): Promise<SetupTotpResult>;
    verifyTotp(req: { code: string }): Promise<VerifyTotpResult>;
    disableTotp(req: { code: string }): Promise<{ ok: boolean }>;
    listSessions(req: Record<string, never>): Promise<{ sessions: SessionDTO[] }>;
    revokeSession(req: { jti: string }): Promise<{ ok: boolean }>;
    revokeAllSessions(req: Record<string, never>): Promise<{ ok: boolean }>;
    getNotificationPrefs(req: Record<string, never>): Promise<NotificationPrefs>;
    setNotificationPrefs(req: NotificationPrefs): Promise<NotificationPrefs>;
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

// No try/except — the React layer renders ConnectError via errorMessage(...).
export function createSettingsClient(api: SettingsApiLike): SettingsClient {
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
    listSessions: async () => (await s.listSessions({})).sessions,
    revokeSession: async (jti) => {
      await s.revokeSession({ jti });
    },
    revokeAllSessions: async () => {
      await s.revokeAllSessions({});
    },
    getPrefs: async () => normalizePrefs(await s.getNotificationPrefs({})),
    setPrefs: async (prefs) => normalizePrefs(await s.setNotificationPrefs(prefs)),
    sessionsQueryKey: () => SESSIONS_KEY,
    prefsQueryKey: () => PREFS_KEY,
  };
}

// At integration: drop NEXT_PUBLIC_MOCK (or set =0) and return createSettingsClient(api) —
// the SettingsClient interface is the seam, so no component changes.
export const USE_MOCK_SETTINGS = process.env.NEXT_PUBLIC_MOCK === "1";

export function makeSettingsClient(): SettingsClient {
  return makeMockSettingsClient();
}
