# Settings — Backend contract (v3 · frozen + NEW Appearance)

> **Screen.** Settings (`/settings` candidate · `/company/settings` company). **FE consumer:** [`frontend_settings.md`](./frontend_settings.md).
> **Status:** **TWO parts.** Part 1 is `EXISTING — reuse` the v2 settings-security contract (no new BE work for the 4 existing tabs — only the v3 rebuild on the FE). Part 2 is `NEW` — the `PreferencesService` that backs the new Appearance tab, lifted from umbrella [v3 redesign + appearance plan](../../2026-06-20-v3-redesign-and-appearance.md) **Phase B**.
> **Anti-fiction reminder.** Aptura is pre-launch. This contract documents only what the UI consumes today — no claimed integrations, no fabricated session-history coverage. The `PreferencesService` enum sets are an **architectural truth** (the FE `[data-base]` / `[data-accent]` CSS blocks must stay in lockstep) — preserve the set verbatim.
> **Real-vs-mock today.** Settings (Part 1) is contract-frozen but **mock on the FE** until `pnpm gen` lands `api.settings.*`; Preferences (Part 2) is **NEW** and built in umbrella Phase B, FE codes against a typed mock seam until gen.

---

## Part 1 — `admin.settings.v1.SettingsService` · **Status: EXISTING — reuse**

> **Source contract:** [`../../v2-screens/settings-security.md`](../../v2-screens/settings-security.md) (the authoritative freeze). Restated here so this page is self-contained; **no re-derivation** — implement that doc.
> Self-scoped to the caller's token (no target `user_id`), works for **both** candidate and company roles (no role gate). gRPC-web on admin, in-process.

### Functionalities

- Change password; request + verify email change.
- Set up / verify / disable **TOTP 2FA** (secrets shown once; recovery codes shown once).
- List + revoke **active sessions** (per-jti); revoke-all-but-current.
- Get / set **notification preferences** (email categories, SMS-critical, digest cadence, quiet hours).

### Service & RPCs (`package admin.settings.v1`; no request carries a target `user_id`)

```proto
service SettingsService {
  rpc ChangePassword(ChangePasswordRequest) returns (OkResponse);            // self; revoke-others-keep-current
  rpc RequestEmailChange(RequestEmailChangeRequest) returns (OkResponse);    // stage pending_email; verify-link
  rpc VerifyEmailChange(VerifyEmailChangeRequest) returns (OkResponse);      // token-bearing, pre-auth (no caller_identity)
  rpc SetupTotp(SetupTotpRequest) returns (SetupTotpResponse);               // staged secret; uri+secret ONCE
  rpc VerifyTotp(VerifyTotpRequest) returns (VerifyTotpResponse);            // enables; recovery_codes ONCE
  rpc DisableTotp(DisableTotpRequest) returns (OkResponse);                  // TOTP code OR recovery code
  rpc ListSessions(ListSessionsRequest) returns (ListSessionsResponse);
  rpc RevokeSession(RevokeSessionRequest) returns (OkResponse);
  rpc RevokeAllSessions(RevokeAllSessionsRequest) returns (OkResponse);      // all but current jti
  rpc GetNotificationPrefs(GetNotificationPrefsRequest) returns (NotificationPrefs);
  rpc SetNotificationPrefs(NotificationPrefs) returns (NotificationPrefs);
}
```

Auth/scope: bearer; self-scoped to `identity["id"]` for every RPC **except** `VerifyEmailChange` (token-bearing, pre-auth). IP/UA from gRPC metadata (`_client_ip`) for `ChangePassword` / `ListSessions` / `RevokeAllSessions`.

### Request / Response structures

```proto
message ChangePasswordRequest    { string current_password = 1; string new_password = 2; }
message RequestEmailChangeRequest { string new_email = 1; }
message VerifyEmailChangeRequest  { string token = 1; }
message SetupTotpRequest          {}                                  // caller is the token
message SetupTotpResponse         { string provisioning_uri = 1; string secret = 2; }   // shown once
message VerifyTotpRequest         { string code = 1; }
message VerifyTotpResponse        { bool enabled = 1; repeated string recovery_codes = 2; }   // shown once
message DisableTotpRequest        { string code = 1; }                // TOTP code OR recovery code
message ListSessionsRequest       {}
message SessionDTO { string jti = 1; string ip = 2; string user_agent = 3;
                     string created_at = 4; string last_seen_at = 5; bool current = 6; }
message ListSessionsResponse      { repeated SessionDTO sessions = 1; }
message RevokeSessionRequest      { string jti = 1; }
message RevokeAllSessionsRequest  {}
message QuietHours                { string start = 1; string end = 2; string tz = 3; }
message GetNotificationPrefsRequest {}
message NotificationPrefs { map<string, bool> email_categories = 1; bool sms_critical = 2;
                            string digest = 3; QuietHours quiet_hours = 4; }   // digest: off|daily|weekly
message OkResponse { bool ok = 1; }
```

**FE mock shape** (already live at `frontend/apps/{app}/app/settings/types.ts` — `SettingsClient` + DTOs, protobuf-es camelCase: `provisioningUri` / `recoveryCodes` / `lastSeenAt` / `userAgent` / `emailCategories` / `smsCritical` / `quietHours`). The v3 rebuild does **not** change this shape.

### Data required

`users` (additive `totp_secret` / `totp_enabled` / `recovery_codes` / `pending_email`), `notification_prefs` collection (`user_id` unique, one doc/user), enriched `RefreshSessionStore` (`refresh:meta:{jti}` per-jti meta sharing session TTL; jti-in-SET is the auth authority). `pyotp` behind `TotpProvider`; secret encrypted behind `SecretBox` (Fernet).

### Errors & edge cases

SSO-only password change → `INVALID_ARGUMENT`; email already registered → `ALREADY_EXISTS`; replayed verify token → `UNAUTHENTICATED`; revoke unknown jti → `NOT_FOUND`; bad TOTP / recovery → rejected + rate-limit hit; bad digest / quiet-hours / tz → `INVALID_ARGUMENT`; `GetNotificationPrefs` returns **safe defaults** when no doc (email-all-on, `sms_critical=false`, `digest="off"`, no quiet hours). Every state-change audited; sensitive ops rate-limited.

### Cross-references

- Shared contract: [`../../v2-screens/settings-security.md`](../../v2-screens/settings-security.md) (freeze).
- The `mfa_required` Login branch + `VerifyTotpLogin` live on `AuthService` (out of scope for this screen's post-auth service).

---

## Part 2 — `admin.preferences.v1.PreferencesService` · **Status: NEW**

> **Source:** umbrella [v3 plan](../../2026-06-20-v3-redesign-and-appearance.md) **Phase B** (Tasks B1–B3). Backs the new **Appearance** tab. **Per-user, token-scoped** → one service serves **both** candidate and company.
> **Why a separate service** (not folded into `admin.settings.v1`): per-user preferences are a future home for more than appearance (default device, language, accessibility flags). Keeping it isolated from `SettingsService` lets us evolve preferences without touching the security-critical settings surface.

### Functionalities

- **Get** the caller's appearance preferences (returns stored doc, or **defaults** when absent).
- **Update** the caller's appearance preferences (validate enums + clamp custom hue, upsert, return stored doc).

### Service & RPCs (`package admin.preferences.v1`)

```proto
import "google/protobuf/empty.proto";   // or a local Empty {} — match the repo's convention

service PreferencesService {
  rpc GetAppearance(google.protobuf.Empty) returns (Appearance);   // self (token sub); no target user_id
  rpc UpdateAppearance(Appearance) returns (Appearance);           // self; validates + clamps; returns stored
}

message Appearance {
  string mode = 1;        // system | light | dark        (default: system)
  string base = 2;        // aperture | azure | mint | slate (default: aperture)
  string accent = 3;      // teal | cyan | lime | emerald | amber | coral | azure | custom (default: teal)
  uint32 accent_hue = 4;  // 0–359, only honored when accent == "custom"
}
```

Auth / scope: bearer; self-scoped to the token **`sub`** (= user id). **No role gate** — identical for candidate + company. Servicer is thin (token → `sub` → resource call), mirrors `routes/decision.py`.

### Request / Response structures

- `GetAppearance(Empty) → Appearance` — returns the stored doc or `DEFAULTS`.
- `UpdateAppearance(Appearance) → Appearance` — validates via the model, upserts, returns the persisted doc.
- **Defaults:** `mode="system"`, `base="aperture"`, `accent="teal"`, `accent_hue` unset.

**FE mock shape** (`frontend/apps/{app}/app/settings/appearance-client.ts`, protobuf-es camelCase — see [`frontend_settings.md`](./frontend_settings.md) Task 6):

```ts
export type ThemeMode = "system" | "light" | "dark";
export type BaseTheme = "aperture" | "azure" | "mint" | "slate";
export type AccentId  = "teal" | "cyan" | "lime" | "emerald" | "amber" | "coral" | "azure" | "custom";

export interface AppearancePrefs { mode: ThemeMode; base: BaseTheme; accent: AccentId; accentHue?: number }

export const APPEARANCE_DEFAULTS: AppearancePrefs = { mode: "system", base: "aperture", accent: "teal" };

export interface AppearanceClient {
  get(): Promise<AppearancePrefs>;
  set(p: AppearancePrefs): Promise<AppearancePrefs>;
  queryKey(): readonly string[];   // ["preferences","appearance"]
}
```

### Data required

- **Collection `user_preferences`**, `_id = <token sub>` (one doc per user — serves candidate AND company alike).
  Fields: `{ mode, base, accent, accent_hue }`. `update_one(upsert=True)` on `UpdateAppearance`.
- **Model** `src/admin/app/model/appearance_prefs.py` — `AppearancePrefs(mode, base, accent, accent_hue)` with the defaults above; `from_dict` **validates** enum membership and **clamps** `accent_hue` to `0–359` (`hue % 360`), honoring it only when `accent == "custom"`; `to_dict`. Enum sets are the single source of truth, mirrored on the FE in `tokens.css` `[data-base]` / `[data-accent]` blocks (umbrella Phase A).
- No indexes beyond `_id` (point reads / writes by user).

### Errors & edge cases

- `UpdateAppearance` with an unknown enum (`mode` / `base` / `accent` not in the set) → `INVALID_ARGUMENT`.
- `accent_hue` out of range → **clamped** (not rejected) via `% 360`; ignored unless `accent == "custom"`.
- `GetAppearance` when no doc exists → returns **DEFAULTS** (never `NOT_FOUND`).
- Auth missing / invalid token → `UNAUTHENTICATED` (standard servicer gate).
- Erasure: `user_preferences` doc deleted in the candidate-eraser cascade (additive; flag at BE handoff).

### Cross-references

- Umbrella [v3 plan](../../2026-06-20-v3-redesign-and-appearance.md) — Phase B (model B1, proto + resource B2, FE gen B3); Phase C consumes this via `AppearanceProvider` + `appearance-client.ts`; Phase A maps the enum values to the `[data-base]` / `[data-accent]` CSS blocks (so the BE enum set and the CSS swatch set must stay in lockstep).
- Shared enums: `ThemeMode` / `BaseTheme` / `AccentId` are identical across BE model (B1), proto (B2), FE DTO (C2), and the `useAppearance` provider (C1). `mode` default `system`, `base` default `aperture`, `accent` default `teal` — these are the design-language defaults (see [`../_design-language.md`](../_design-language.md) §"Per-user Appearance — accent + base").
- Design language: [`../_design-language.md`](../_design-language.md) — the resolved accent is exposed everywhere as `--teal` (the variable name is intentionally the default accent identifier; user accents override it via `[data-accent]` blocks).
