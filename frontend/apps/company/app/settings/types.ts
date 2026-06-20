// Typed contract for SettingsService (admin.settings.v1). The proto/servicer aren't
// generated yet, so the settings page + its tabs code against this shape until `pnpm gen`
// exposes `api.settings.*`. camelCase mirrors protobuf-es (provisioningUri / recoveryCodes /
// lastSeenAt / userAgent / emailCategories / smsCritical / quietHours).

export interface SessionDTO {
  jti: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface QuietHours {
  start: string;
  end: string;
  tz: string;
}

export type DigestCadence = "off" | "daily" | "weekly";

export interface NotificationPrefs {
  emailCategories: Record<string, boolean>;
  smsCritical: boolean;
  digest: DigestCadence;
  quietHours?: QuietHours;
}

export interface SetupTotpResult {
  provisioningUri: string;
  secret: string;
}

export interface VerifyTotpResult {
  enabled: boolean;
  recoveryCodes: string[];
}

// The seam the screen codes against: the real client (createSettingsClient) and the mock
// (makeMockSettingsClient) both satisfy it, so component code never changes at integration.
export interface SettingsClient {
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  requestEmailChange(newEmail: string): Promise<void>;
  verifyEmailChange(token: string): Promise<void>;
  setupTotp(): Promise<SetupTotpResult>;
  verifyTotp(code: string): Promise<VerifyTotpResult>;
  disableTotp(code: string): Promise<void>;
  listSessions(): Promise<SessionDTO[]>;
  revokeSession(jti: string): Promise<void>;
  revokeAllSessions(): Promise<void>;
  getPrefs(): Promise<NotificationPrefs>;
  setPrefs(prefs: NotificationPrefs): Promise<NotificationPrefs>;
  sessionsQueryKey(): readonly string[];
  prefsQueryKey(): readonly string[];
}

// Stable category keys (must match the server's NotificationPrefs.email_categories keys).
export const EMAIL_CATEGORIES = [
  { key: "application_updates", label: "Application updates" },
  { key: "messages", label: "New messages" },
  { key: "security", label: "Security alerts" },
  { key: "marketing", label: "Product news" },
] as const;
