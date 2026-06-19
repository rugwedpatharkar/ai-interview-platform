# Screen: Settings & Security — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 4).
> **Route:** `apps/{candidate,company}/app/settings/page.tsx` (NEW) · **Mockup:** `aptura_settings_security` · **Pillar:** [settings-and-security](../../v2/2026-06-19-settings-and-security.md)
> **Goal:** A self-service **account & security** module for every authenticated user (candidate + company): change password, change email (re-verify), set up / disable **TOTP 2FA**, see + revoke **active sessions**, and tune **notification preferences** — in one tabbed page (Account · Security · Notifications · Privacy). The existing `/account` consent + erasure controls **move under the Privacy tab** (the standalone `/account` route stays as a redirect/alias).

This screen follows the **authed-gRPC** pattern: `"use client"` → `useAuth`/`useRequireAuth` → `createSettingsClient(api)` (a thin wrapper over the generated `api.settings.*` gRPC-web client) → TanStack Query/Mutation → `@ip/ui`. Every method is self-scoped to the caller's token (no target-user param). It is **not** public/SSR.

> **Pillar mapping.** This screen is the **FE/contract slice** of the full [settings-and-security](../../v2/2026-06-19-settings-and-security.md) plan (TIER A–D). That plan is the source of truth for the backend (models, repos, `RefreshSessionStore` metadata, `TotpProvider`/`SecretBox` seams, the resource contract, the login gate, the erasure cascade). This doc pins the **exact RPC surface + FE mock shape + the screen's TDD build**. Two reconciled deltas vs. that plan, applied here:
> - **4 tabs, not 3.** The pillar's tab list is Profile/Account · Security · Notifications and says "moving consent into a Privacy tab is a separate, later change." This screen **is** that change: a 4th **Privacy** tab hosts the consent + erasure controls (re-using the exact `ComplianceService` calls already in `app/account/page.tsx`), so `/settings` is the single home. `/account` becomes a thin redirect to `/settings?tab=privacy`.
> - **RPC names.** This doc uses `VerifyEmailChange` (alias of the pillar's `ConfirmEmailChange`) and `RevokeAllSessions` (alias of `RevokeOtherSessions`) to match the program index wording. Pick one spelling at proto-authoring and keep it consistent across `settings.proto` + `settings.ts`; the semantics are identical (token-bearing confirm; revoke-all-but-current).

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** `admin.settings.v1.SettingsService` (gRPC-web on admin, in-process — the established transport). All logic lives in `resources/settings.py` (the contract: self-scope + validation + rate-limit + audit + session/2FA/prefs); the servicer is a thin adapter (mirrors `routes/decision.py`).

**Authoritative build:** [settings-and-security](../../v2/2026-06-19-settings-and-security.md) TIER A–C (this contract = its proto Task 9 + the resource Tasks 4–8 + the erasure cascade Task 10). Do not re-derive the resource here — implement that plan; this is the **interface freeze**.

### RPCs (no request carries a target `user_id` — the caller is the token)

```proto
// src/admin/app/routes/pb/settings.proto  — package admin.settings.v1  (mirror decision.proto shape)
service SettingsService {
  // — account —
  rpc ChangePassword(ChangePasswordRequest) returns (OkResponse);
  rpc RequestEmailChange(RequestEmailChangeRequest) returns (OkResponse);
  rpc VerifyEmailChange(VerifyEmailChangeRequest) returns (OkResponse);     // token-bearing (email link target) — NOT caller_identity-gated
  // — 2FA (TOTP only) —
  rpc SetupTotp(SetupTotpRequest) returns (SetupTotpResponse);              // stages encrypted secret; returns provisioning_uri + secret ONCE
  rpc VerifyTotp(VerifyTotpRequest) returns (VerifyTotpResponse);          // enables; returns recovery_codes ONCE
  rpc DisableTotp(DisableTotpRequest) returns (OkResponse);                // requires a TOTP code OR a recovery code
  // — active sessions —
  rpc ListSessions(ListSessionsRequest) returns (ListSessionsResponse);
  rpc RevokeSession(RevokeSessionRequest) returns (OkResponse);
  rpc RevokeAllSessions(RevokeAllSessionsRequest) returns (OkResponse);    // revoke all but the caller's current jti
  // — notification preferences —
  rpc GetNotificationPrefs(GetNotificationPrefsRequest) returns (NotificationPrefs);
  rpc SetNotificationPrefs(NotificationPrefs) returns (NotificationPrefs);
}

message ChangePasswordRequest   { string current_password = 1; string new_password = 2; }
message RequestEmailChangeRequest{ string new_email = 1; }
message VerifyEmailChangeRequest { string token = 1; }

message SetupTotpRequest         {}                                         // empty — caller is the token
message SetupTotpResponse        { string provisioning_uri = 1; string secret = 2; }   // both shown once
message VerifyTotpRequest        { string code = 1; }
message VerifyTotpResponse       { bool enabled = 1; repeated string recovery_codes = 2; }   // codes shown once
message DisableTotpRequest       { string code = 1; }                       // TOTP code OR recovery code

message ListSessionsRequest      {}
message SessionDTO {
  string jti = 1; string ip = 2; string user_agent = 3;
  string created_at = 4; string last_seen_at = 5; bool current = 6;
}
message ListSessionsResponse     { repeated SessionDTO sessions = 1; }
message RevokeSessionRequest     { string jti = 1; }
message RevokeAllSessionsRequest {}

message QuietHours               { string start = 1; string end = 2; string tz = 3; }
message GetNotificationPrefsRequest {}
message NotificationPrefs {
  map<string, bool> email_categories = 1;   // category -> enabled (e.g. messages/application_updates/marketing/security)
  bool sms_critical = 2;
  string digest = 3;                          // off | daily | weekly
  QuietHours quiet_hours = 4;                 // optional; absent = no quiet hours
}

message OkResponse { bool ok = 1; }
```

**Login branches to `mfa_required` (AuthService, additive).** `Login` stays on `AuthService`; when `totp_enabled` it returns a **challenge** (`mfa_required = true` + a single-use short-lived `mfa_token`) instead of access/refresh tokens — see the pillar's Task 8 + Task 9 note. The 2FA-**off** Login response is **byte-for-byte unchanged**. The second factor completes via `VerifyTotpLogin(mfa_token, code) → TokenResponse` — placed on `AuthService` (pre-auth: the caller has only the `mfa_token`, no access token, so it must **not** require `caller_identity`). This screen's FE owns the **login-page 2FA step** that calls it (Task 9 here); the `SettingsService` proper is post-auth only.

### Field semantics + validation (boundary = contract surface)

| RPC | Request | Response | Validation / behavior |
|---|---|---|---|
| `ChangePassword` | `current_password`, `new_password` | `ok` | verify current (`verify_password`); `new_password` ≥ register min-len; SSO-only (`password_hash==""`) → `INVALID_ARGUMENT` (route to reset); on success **revoke other sessions, keep current**; rate-limited; audit `password_changed`. |
| `RequestEmailChange` | `new_email` | `ok` | normalize+`EmailStr`; reject one already registered to another user (`ALREADY_EXISTS`); stage `pending_email` (live `email` untouched); email the **new** address a verify link; rate-limited; audit `email_change_requested`. |
| `VerifyEmailChange` | `token` | `ok` | decode token (purpose `email_verify`), consume nonce (replay → `UNAUTHENTICATED`), swap (`email=pending_email`, clear pending, `email_verified=true`), audit `email_changed`; (default) revoke other sessions. **No `caller_identity`** (token is the auth). |
| `SetupTotp` | — | `provisioning_uri`, `secret` | stage an **encrypted** secret (`SecretBox.encrypt`) with `totp_enabled=false`; return the otpauth:// URI + raw secret **once** (FE renders QR + copyable secret). |
| `VerifyTotp` | `code` | `enabled`, `recovery_codes[]` | `totp.verify(secret, code)` → set `totp_enabled=true`, generate `RECOVERY_CODE_COUNT` (10) recovery codes, store them **hashed** (`hash_password` each), return **plaintext once**; bad code → no enable (+ rate-limit hit); audit `totp_enabled`. |
| `DisableTotp` | `code` (TOTP **or** recovery) | `ok` | match a TOTP code or a stored recovery hash (consume on match); clear `totp_secret`/`totp_enabled=false`/`recovery_codes=[]`; bad → rejected (+ rate-limit hit); audit `totp_disabled`. |
| `ListSessions` | — | `sessions[]` | one row per **active** jti (device/ip/last-seen from the session meta hash); the **IP+UA match** is `current=true`; a session with a lost meta key still lists (degraded detail, still active). |
| `RevokeSession` | `jti` | `ok` | kill one jti; a jti **not in the caller's user-SET** → `NOT_FOUND`; rate-limited; audit. |
| `RevokeAllSessions` | — | `ok` | kill all but `current_jti` (re-`allow_meta` the caller); rate-limited; audit. |
| `GetNotificationPrefs` | — | `NotificationPrefs` | **safe defaults** when no doc exists (email-all-on, `sms_critical=false`, `digest="off"`, no quiet hours). |
| `SetNotificationPrefs` | `NotificationPrefs` | `NotificationPrefs` | validate `digest` enum + quiet-hours `HH:MM` + a real IANA `tz` (`INVALID_ARGUMENT` otherwise); stamp `updated_at`; audit `notification_prefs_updated`; returns the persisted doc. |

- **Auth/scope:** bearer; **self-scoped** to `identity["id"]` for every RPC **except** `VerifyEmailChange` (token-bearing, pre-auth). Works for **both** candidate and company roles (no role gate — a seat-management concern lives in TeamService, not here). IP/UA sourced from gRPC metadata in the servicer (the `_client_ip` pattern), threaded to `ChangePassword`/`ListSessions`/`RevokeAllSessions`.
- **Backed by:** `resources/settings.py` over (a) `users` (gains `totp_secret`/`totp_enabled`/`recovery_codes`/`pending_email` — all additive/defaulted), (b) a new **`notification_prefs`** collection (`IndexSpec("notification_prefs","user_id",{"unique":True})` — one doc per user), (c) an **enriched `RefreshSessionStore`** (per-jti meta hash `refresh:meta:{jti}` sharing the session TTL; the jti-in-SET stays the auth authority). `pyotp` behind `TotpProvider`; the TOTP secret encrypted behind `SecretBox` (Fernet, app-secret-keyed) — both faked in tests. Every sensitive op rate-limited via the existing `lib.redis.RateLimiter`; every state-change audited via `AuditLog`. Erasure cascade: `CandidateEraser` deletes `notification_prefs`, `users.anonymize` nulls the security fields, `sessions.revoke_user` clears sessions+meta.
- **Proto/REST file:** `src/admin/app/routes/pb/settings.proto` (NEW) → generated `settings_pb2*.py` (admin) + `settings_pb.ts` (`@ip/api-client`, via `pnpm gen`). Servicer `src/admin/app/routes/settings.py`; registered in `routes/web.py`. `VerifyTotpLogin` + the `mfa_required` Login branch land on `routes/auth.py` (pillar Task 10 Step 5).
- **Pillar cross-ref:** [settings-and-security](../../v2/2026-06-19-settings-and-security.md) — resource Tasks 4–8, transport Tasks 9–10, the FE client + page Tasks 11–13 (this doc supersedes those FE tasks with the 4-tab build).

**FE mock shape** (`apps/{candidate,company}/app/settings/types.ts`) — the FE codes against this until `pnpm gen` exposes `api.settings.*` (camelCase per protobuf-es: `provisioningUri`, `recoveryCodes`, `lastSeenAt`, `userAgent`, `emailCategories`, `smsCritical`, `quietHours`):

```ts
// Mirrors admin.settings.v1 (protobuf-es camelCase). Kept until pnpm gen lands the real types.
export interface SessionDTO {
  jti: string; ip: string; userAgent: string;
  createdAt: string; lastSeenAt: string; current: boolean;
}
export interface QuietHours { start: string; end: string; tz: string }
export interface NotificationPrefs {
  emailCategories: Record<string, boolean>;
  smsCritical: boolean;
  digest: "off" | "daily" | "weekly";
  quietHours?: QuietHours;
}
export interface SetupTotpResult { provisioningUri: string; secret: string }
export interface VerifyTotpResult { enabled: boolean; recoveryCodes: string[] }

// The interface the screen codes against — the real client (createSettingsClient(api)) and the
// mock (makeMockSettingsClient()) both satisfy it, so component code never changes at integration.
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
```

---

## B. Frontend plan (TDD, bite-sized)

**Files (both apps unless noted — `{app}` ∈ {candidate, company}):**
- Create: `frontend/apps/{app}/app/settings/types.ts` (the contract shape above)
- Create: `frontend/apps/{app}/app/settings/settings-client.ts` (`createSettingsClient(api)` real + `makeMockSettingsClient()` mock; `NEXT_PUBLIC_MOCK` toggle)
- Create: `frontend/apps/{app}/app/settings/settings-client.test.ts` (mock-client contract + the password-match guard)
- Create: `frontend/apps/{app}/app/settings/page.tsx` (`"use client"`, tabbed shell, `?tab=` deep-link)
- Create: `frontend/apps/{app}/components/settings/{account-tab,security-tab,notifications-tab,privacy-tab}.tsx`
- Create: `frontend/apps/{app}/components/settings/totp-setup-dialog.tsx`, `session-list.tsx`
- Modify: `frontend/apps/{app}/components/{candidate,company}-shell.tsx` (+`/settings` nav entry)
- Modify: `frontend/apps/{app}/app/account/page.tsx` → thin redirect to `/settings?tab=privacy`
- Modify (login 2FA step): `frontend/apps/{app}/app/login/page.tsx` (+ the `mfa_required` challenge step)
- (At integration) Modify: `frontend/packages/api-client/src/index.ts` (+`settings_pb`), `frontend/packages/shared/src/index.ts` (re-export DTOs if shared)

**Components:** new `TotpSetupDialog`, `SessionList`, the 4 tabs; reuse `@ip/ui` `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`, `Field`, `Input`, `Button`, `Badge`, `Alert`, `ConfirmDialog`, `Dialog`/`DialogTrigger`/`DialogContent`/`DialogTitle`/`DialogDescription`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`, `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`, `RadioGroup`/`RadioGroupItem`, `Checkbox`, `LoadingState`/`ErrorState`/`EmptyState`/`PageHeader`, `toast`. **No `Switch` in `@ip/ui`** — booleans use `Checkbox`. lucide icons (`Mail`, `KeyRound`, `Shield`, `Smartphone`, `Monitor`, `Bell`, `ShieldCheck`, `Copy`) imported **in the app** (the lucide-must-be-in-app rule).
**Query keys:** `["settings","sessions"]`, `["settings","prefs"]` (via the client's key helpers so view + invalidation never drift).

> **Build both apps.** The candidate + company `/settings` pages are near-identical; the company **Account** tab is **read-only identity** (role + company shown, not editable — org management is the team module) and has **no `/profile` link**. Build candidate first (Tasks 1–8), then port to company (Task 10) — the tabs are app-local duplicates per the established convention (mirrors the pillar Task 13).

### Task 1: Contract types + the password-match guard (pure, testable)

- [ ] **Step 1: Write the failing test** — `frontend/apps/candidate/app/settings/settings-client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { passwordChangeError, makeMockSettingsClient } from "./settings-client";

describe("passwordChangeError", () => {
  it("rejects a too-short new password", () => {
    expect(passwordChangeError("old", "short", "short")).toMatch(/at least 8/i);
  });
  it("rejects a confirm mismatch", () => {
    expect(passwordChangeError("old", "longenough1", "different1")).toMatch(/match/i);
  });
  it("passes a valid change", () => {
    expect(passwordChangeError("old", "longenough1", "longenough1")).toBeNull();
  });
});

describe("makeMockSettingsClient", () => {
  it("setupTotp returns a provisioning uri + secret; verifyTotp returns recovery codes", async () => {
    const c = makeMockSettingsClient();
    const setup = await c.setupTotp();
    expect(setup.provisioningUri).toContain("otpauth://");
    const v = await c.verifyTotp("123456");
    expect(v.enabled).toBe(true);
    expect(v.recoveryCodes.length).toBeGreaterThanOrEqual(10);
  });
  it("getPrefs returns email-all-on defaults; listSessions marks one current", async () => {
    const c = makeMockSettingsClient();
    const prefs = await c.getPrefs();
    expect(prefs.digest).toBe("off");
    expect(Object.values(prefs.emailCategories).every(Boolean)).toBe(true);
    const sessions = await c.listSessions();
    expect(sessions.some((s) => s.current)).toBe(true);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test settings-client` → FAIL (module not found). *(If the app has no test runner wired, add `vitest` to `apps/candidate` devDeps + a `test` script first — fold into this task; mirror the marketplace exemplar.)*
- [ ] **Step 3: Implement `types.ts`** (paste Part A's shape) **and** `settings-client.ts` (the pure guard + the mock; the real client is Task 2):
```ts
import type {
  NotificationPrefs, SessionDTO, SettingsClient, SetupTotpResult, VerifyTotpResult,
} from "./types";
import { EMAIL_CATEGORIES } from "./types";

export const MIN_PASSWORD_LEN = 8; // mirror the server register policy

/** Client-side guard mirroring the server's password rules; returns an error string or null. */
export function passwordChangeError(_current: string, next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LEN) return `New password must be at least ${MIN_PASSWORD_LEN} characters.`;
  if (next !== confirm) return "New password and confirmation don't match.";
  return null;
}

const SESSIONS_KEY = ["settings", "sessions"] as const;
const PREFS_KEY = ["settings", "prefs"] as const;

export function makeMockSettingsClient(): SettingsClient {
  const sessions: SessionDTO[] = [
    { jti: "j1", ip: "203.0.113.4", userAgent: "Chrome on macOS",
      createdAt: "2026-06-19T09:00:00Z", lastSeenAt: "2026-06-20T08:40:00Z", current: true },
    { jti: "j2", ip: "198.51.100.9", userAgent: "Safari on iPhone",
      createdAt: "2026-06-15T12:00:00Z", lastSeenAt: "2026-06-18T20:10:00Z", current: false },
  ];
  let prefs: NotificationPrefs = {
    emailCategories: Object.fromEntries(EMAIL_CATEGORIES.map((c) => [c.key, true])),
    smsCritical: false, digest: "off",
  };
  return {
    changePassword: async () => undefined,
    requestEmailChange: async () => undefined,
    verifyEmailChange: async () => undefined,
    setupTotp: async (): Promise<SetupTotpResult> => ({
      provisioningUri: "otpauth://totp/Aptura:you@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Aptura",
      secret: "JBSWY3DPEHPK3PXP",
    }),
    verifyTotp: async (): Promise<VerifyTotpResult> => ({
      enabled: true,
      recoveryCodes: Array.from({ length: 10 }, (_, i) => `aptura-${1000 + i}-${2000 + i}`),
    }),
    disableTotp: async () => undefined,
    listSessions: async () => sessions,
    revokeSession: async (jti) => { const i = sessions.findIndex((s) => s.jti === jti); if (i >= 0) sessions.splice(i, 1); },
    revokeAllSessions: async () => { for (let i = sessions.length - 1; i >= 0; i--) if (!sessions[i].current) sessions.splice(i, 1); },
    getPrefs: async () => prefs,
    setPrefs: async (next) => { prefs = next; return prefs; },
    sessionsQueryKey: () => SESSIONS_KEY,
    prefsQueryKey: () => PREFS_KEY,
  };
}
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test settings-client` → PASS
- [ ] **Step 5: Commit** — `git add frontend/apps/candidate/app/settings && git commit -m "feat(settings): contract types + password guard + mock client"`

### Task 2: Real gRPC client wrapper + mock toggle

- [ ] **Step 1:** Add `createSettingsClient(api)` to `settings-client.ts` (mirrors `interview.ts`/`jd.ts` factory shape — closes over the typed `api`; **no try/except** here, the React layer renders `ConnectError` via `errorMessage`). Until `pnpm gen` lands the types, type `api` as `ApiClientsLike` (a local interface exposing `settings.*`) so the app typechecks against the mock today:
```ts
import type { ApiClients } from "@ip/api-client"; // after pnpm gen exposes api.settings
import type { NotificationPrefs, SettingsClient } from "./types";

export function createSettingsClient(api: ApiClients): SettingsClient {
  const s = api.settings; // Client<typeof SettingsService> after gen
  return {
    changePassword: async (currentPassword, newPassword) => { await s.changePassword({ currentPassword, newPassword }); },
    requestEmailChange: async (newEmail) => { await s.requestEmailChange({ newEmail }); },
    verifyEmailChange: async (token) => { await s.verifyEmailChange({ token }); },
    setupTotp: async () => { const r = await s.setupTotp({}); return { provisioningUri: r.provisioningUri, secret: r.secret }; },
    verifyTotp: async (code) => { const r = await s.verifyTotp({ code }); return { enabled: r.enabled, recoveryCodes: r.recoveryCodes }; },
    disableTotp: async (code) => { await s.disableTotp({ code }); },
    listSessions: async () => (await s.listSessions({})).sessions,
    revokeSession: async (jti) => { await s.revokeSession({ jti }); },
    revokeAllSessions: async () => { await s.revokeAllSessions({}); },
    getPrefs: async () => normalizePrefs(await s.getNotificationPrefs({})),
    setPrefs: async (prefs) => normalizePrefs(await s.setNotificationPrefs(prefs as NotificationPrefs)),
    sessionsQueryKey: () => ["settings", "sessions"],
    prefsQueryKey: () => ["settings", "prefs"],
  };
}
// protobuf map<> + message fields deserialize as a plain object / undefined — normalize to the DTO shape.
function normalizePrefs(p: NotificationPrefs): NotificationPrefs {
  return { emailCategories: p.emailCategories ?? {}, smsCritical: !!p.smsCritical,
    digest: (p.digest ?? "off") as NotificationPrefs["digest"], quietHours: p.quietHours };
}
```
- [ ] **Step 2:** Add the toggle so the screen builds before the proto lands:
```ts
export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
export function useSettingsClient(api: ApiClients) {
  // a hook so the page can swap mock↔real without prop drilling; memoized per-render upstream.
  return USE_MOCK ? makeMockSettingsClient() : createSettingsClient(api);
}
```
- [ ] **Step 3: Verify** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate typecheck` clean (the `api.settings` reference is dead under the mock; if typecheck flags the missing `settings` member pre-gen, guard the real factory behind `USE_MOCK` so it's tree-shaken, or stub the `ApiClientsLike` interface locally — note this at handoff).
- [ ] **Step 4: Commit** — `git commit -am "feat(settings): real gRPC client wrapper behind NEXT_PUBLIC_MOCK"`

### Task 3: `SessionList` component (active sessions + revoke)

- [ ] **Step 1:** Create `frontend/apps/candidate/components/settings/session-list.tsx`:
```tsx
"use client";
import { Badge, Button, ConfirmDialog, ErrorState, LoadingState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ip/ui";
import { errorMessage, toast } from "@ip/shared"; // toast is re-exported from @ip/ui; import from there if not in shared
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor } from "lucide-react";
import type { SettingsClient } from "../../app/settings/types";

const rel = (iso: string) => new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  .format(Math.round((Date.parse(iso) - Date.now()) / 86_400_000), "day");

export function SessionList({ client }: { client: SettingsClient }) {
  const qc = useQueryClient();
  const key = client.sessionsQueryKey();
  const q = useQuery({ queryKey: key, queryFn: () => client.listSessions() });
  const revoke = useMutation({
    mutationFn: (jti: string) => client.revokeSession(jti),
    onSuccess: () => { toast.success("Session revoked"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revokeAll = useMutation({
    mutationFn: () => client.revokeAllSessions(),
    onSuccess: () => { toast.success("Other sessions signed out"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <LoadingState label="Loading sessions…" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const sessions = q.data ?? [];
  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow><TableHead>Device</TableHead><TableHead>IP</TableHead><TableHead>Last active</TableHead><TableHead /></TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((s) => (
            <TableRow key={s.jti}>
              <TableCell className="flex items-center gap-2">
                <Monitor className="size-4 text-muted-foreground" aria-hidden />{s.userAgent}
                {s.current && <Badge tone="info" variant="subtle">This device</Badge>}
              </TableCell>
              <TableCell className="text-muted-foreground">{s.ip}</TableCell>
              <TableCell className="text-muted-foreground">{rel(s.lastSeenAt)}</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" disabled={s.current || revoke.isPending}
                  onClick={() => revoke.mutate(s.jti)}>Revoke</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ConfirmDialog
        trigger={<Button variant="outline" className="self-start" disabled={sessions.length <= 1}>Sign out other sessions</Button>}
        title="Sign out everywhere else?" description="All sessions except this device will be signed out."
        confirmLabel="Sign out others" busy={revokeAll.isPending} onConfirm={() => revokeAll.mutate()}
      />
    </div>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/candidate typecheck` clean (adjust `Badge` `tone`/`variant` + `ErrorState` `onRetry` prop names to the real `@ip/ui` API if flagged; confirm `toast` import origin — it's exported from `@ip/ui`).
- [ ] **Step 3: Commit** — `git commit -am "feat(settings): SessionList (active sessions + revoke)"`

### Task 4: `TotpSetupDialog` component (QR → verify → recovery codes once)

- [ ] **Step 1:** Create `totp-setup-dialog.tsx` — a `@ip/ui` `Dialog` walking the 3 states: (1) call `setupTotp()` → show the `provisioningUri` as a QR **and** the copyable `secret` string (the no-extra-dependency fallback — render the secret in a `<code>` with a `Copy` button; a QR lib is optional, flag at handoff); (2) a 6-digit `Input` + **Verify** → `verifyTotp(code)`; (3) on `enabled`, **reveal the `recoveryCodes` once** in a `<code>` block with a copy-all affordance + an `Alert tone="warning"` "Save these now — they won't be shown again." Lucide `Copy`/`ShieldCheck` imported here.
```tsx
"use client";
import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger, Field, Input } from "@ip/ui";
import { errorMessage, toast } from "@ip/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { SettingsClient } from "../../app/settings/types";

export function TotpSetupDialog({ client, onEnabled }: { client: SettingsClient; onEnabled: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ provisioningUri: string; secret: string } | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const begin = useMutation({ mutationFn: () => client.setupTotp(),
    onSuccess: (r) => setSetup(r), onError: (e) => toast.error(errorMessage(e)) });
  const verify = useMutation({ mutationFn: () => client.verifyTotp(code),
    onSuccess: (r) => { setRecovery(r.recoveryCodes); onEnabled(); },
    onError: (e) => toast.error(errorMessage(e)) });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && !setup) begin.mutate(); if (!o) { setSetup(null); setRecovery(null); setCode(""); } }}>
      <DialogTrigger asChild><Button>Set up 2FA</Button></DialogTrigger>
      <DialogContent>
        <DialogTitle>Set up two-factor authentication</DialogTitle>
        <DialogDescription>Scan the QR in your authenticator app, or enter the key manually.</DialogDescription>
        {recovery ? (
          <div className="flex flex-col gap-3">
            <Alert tone="warning">Save these recovery codes now — they won't be shown again.</Alert>
            <code className="grid grid-cols-2 gap-1 rounded-md border border-border bg-surface-muted p-3 text-sm">
              {recovery.map((c) => <span key={c}>{c}</span>)}
            </code>
            <Button onClick={() => { navigator.clipboard?.writeText(recovery.join("\n")); toast.success("Copied"); }}>Copy all</Button>
            <Button variant="outline" onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : setup ? (
          <div className="flex flex-col gap-3">
            {/* QR: render setup.provisioningUri via a client QR component, or show the secret as the fallback */}
            <Field label="Secret key" htmlFor="totp-secret">
              <Input id="totp-secret" readOnly value={setup.secret} />
            </Field>
            <Field label="6-digit code" htmlFor="totp-code">
              <Input id="totp-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <Button loading={verify.isPending} disabled={code.length !== 6} onClick={() => verify.mutate()}>Verify & enable</Button>
          </div>
        ) : <Alert tone="info">Preparing setup…</Alert>}
      </DialogContent>
    </Dialog>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/candidate typecheck` clean (confirm `Dialog` `open`/`onOpenChange` + `DialogTrigger asChild` + `Button` `loading` props against the real `@ip/ui` API).
- [ ] **Step 3: Commit** — `git commit -am "feat(settings): TotpSetupDialog (QR + verify + recovery codes once)"`

### Task 5: The four tab components

- [ ] **Step 1: Account tab** (`components/settings/account-tab.tsx`) — show the email + a verified `Badge`; a **Change email** action (a `Field`+`Input` in a `ConfirmDialog` → `requestEmailChange`, toast "Check your new inbox to confirm"); a **Change password** action (current + new + confirm `Field`s with the client-side `passwordChangeError` guard → `changePassword`; on success toast "Password changed — other devices signed out"). Candidate: link to `/profile` (the profile editor — not owned here) and to the Privacy tab. Lucide `Mail`/`KeyRound` here. *(The candidate JWT carries no email — surface email from the profile query the app already has, or render "your account email"; the company shell confirms the JWT is id/role/compId only. Note this at handoff.)*
- [ ] **Step 2: Security tab** (`components/settings/security-tab.tsx`) — a **2FA** status `Badge` (on/off); when **off**, render `<TotpSetupDialog client={client} onEnabled={refetch}/>`; when **on**, a **Disable 2FA** `ConfirmDialog` requiring a code → `disableTotp`. Below: `<SessionList client={client}/>`. (The 2FA on/off state comes from a small status read — reuse a profile/account field, or add a `totp_enabled` to an existing "me" response at integration; until then derive from the last `verifyTotp`/`disableTotp` result + a local flag. Flag at handoff.) Lucide `Shield`/`Smartphone` here.
- [ ] **Step 3: Notifications tab** (`components/settings/notifications-tab.tsx`) — `useQuery(prefsQueryKey, getPrefs)` → render: the 4 **email-category** `Checkbox`es (`EMAIL_CATEGORIES`), the **SMS-critical** `Checkbox`, the **digest** cadence as a `RadioGroup` (off/daily/weekly), and **quiet hours** (start/end `Input type="time"` + a tz `Select`). Save via `setPrefs` with an **optimistic** update + `invalidateQueries` reconcile + toast (the `/account` consent-mutation pattern). An inline note: "In-app notifications are always on — only email, SMS, and cadence are configurable" (so the missing in-app toggle isn't read as a bug). Lucide `Bell` here.
```tsx
// notifications-tab.tsx (core shape)
"use client";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, ErrorState, Field, Input, LoadingState, RadioGroup, RadioGroupItem, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ip/ui";
import { errorMessage, toast } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { EMAIL_CATEGORIES, type NotificationPrefs, type SettingsClient } from "../../app/settings/types";

export function NotificationsTab({ client }: { client: SettingsClient }) {
  const qc = useQueryClient(); const key = client.prefsQueryKey();
  const q = useQuery({ queryKey: key, queryFn: () => client.getPrefs() });
  const save = useMutation({
    mutationFn: (next: NotificationPrefs) => client.setPrefs(next),
    onMutate: async (next) => { await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationPrefs>(key); qc.setQueryData(key, next); return { prev }; },
    onError: (e, _n, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); toast.error(errorMessage(e)); },
    onSuccess: () => { toast.success("Preferences saved"); qc.invalidateQueries({ queryKey: key }); },
  });
  if (q.isLoading) return <LoadingState label="Loading preferences…" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const p = q.data!;
  const patch = (d: Partial<NotificationPrefs>) => save.mutate({ ...p, ...d });
  return (
    <Card>
      <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert tone="info">In-app notifications are always on. Email, SMS, and digest cadence are configurable here.</Alert>
        {EMAIL_CATEGORIES.map((c) => (
          <label key={c.key} className="flex items-center justify-between gap-3">
            <span className="text-sm text-foreground">Email me about {c.label.toLowerCase()}</span>
            <Checkbox checked={p.emailCategories[c.key] ?? true}
              onCheckedChange={(v) => patch({ emailCategories: { ...p.emailCategories, [c.key]: Boolean(v) } })} />
          </label>
        ))}
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-foreground">Text me for critical security alerts</span>
          <Checkbox checked={p.smsCritical} onCheckedChange={(v) => patch({ smsCritical: Boolean(v) })} />
        </label>
        <Field label="Email digest">
          <RadioGroup value={p.digest} onValueChange={(d) => patch({ digest: d as NotificationPrefs["digest"] })}
            className="flex gap-4">
            {(["off", "daily", "weekly"] as const).map((d) => (
              <label key={d} className="flex items-center gap-2 text-sm capitalize"><RadioGroupItem value={d} />{d}</label>
            ))}
          </RadioGroup>
        </Field>
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 4: Privacy tab** (`components/settings/privacy-tab.tsx`) — **move** the consent + erasure controls out of `app/account/page.tsx` verbatim: the consent list (`api.compliance.getMyConsent` / `recordConsent`) + the **Erase my account** `ConfirmDialog` (`api.compliance.eraseMe` → `logout`). Keep the exact `ComplianceService` calls and the `tone="danger"` framing — only the host moves.
- [ ] **Step 5: Verify** — `--filter @ip/candidate typecheck` clean (confirm `RadioGroup` `onValueChange`, `Checkbox` `onCheckedChange`, `Select` parts against `@ip/ui`).
- [ ] **Step 6: Commit** — `git commit -am "feat(settings): Account/Security/Notifications/Privacy tabs"`

### Task 6: The tabbed `/settings` page + `?tab=` deep-link + nav

- [ ] **Step 1:** Create `frontend/apps/candidate/app/settings/page.tsx`:
```tsx
"use client";
import { LoadingState, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@ip/ui";
import { useRequireAuth } from "@ip/shared";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CandidateShell } from "../../components/candidate-shell";
import { useAuth } from "../../lib/auth";
import { useSettingsClient } from "./settings-client";
import { AccountTab } from "../../components/settings/account-tab";
import { SecurityTab } from "../../components/settings/security-tab";
import { NotificationsTab } from "../../components/settings/notifications-tab";
import { PrivacyTab } from "../../components/settings/privacy-tab";

const TABS = ["account", "security", "notifications", "privacy"] as const;

export default function SettingsPage() {
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready);
  const client = useSettingsClient(api); // memoized in the hook / stable mock
  const sp = useSearchParams();
  const initial = (TABS as readonly string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as string) : "account";
  if (!token) return null;
  return (
    <CandidateShell>
      <PageHeader title="Settings" description="Manage your account, security, and notifications." />
      <Tabs defaultValue={initial} className="mt-4">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>
        <TabsContent value="account"><AccountTab client={client} /></TabsContent>
        <TabsContent value="security"><SecurityTab client={client} /></TabsContent>
        <TabsContent value="notifications"><NotificationsTab client={client} /></TabsContent>
        <TabsContent value="privacy"><PrivacyTab /></TabsContent>
      </Tabs>
    </CandidateShell>
  );
}
```
- [ ] **Step 2:** Add `{ href: "/settings", label: "Settings" }` to `NAV` in `candidate-shell.tsx` (alongside `/profile`, `/account`).
- [ ] **Step 3:** Convert `app/account/page.tsx` to a thin redirect so the old route still works: `useEffect(() => router.replace("/settings?tab=privacy"), [])` returning `<LoadingState/>` (the consent/erasure logic now lives in the Privacy tab).
- [ ] **Step 4: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate build` clean; via the preview loop: start dev, load `/settings`, confirm all 4 tabs render, `?tab=security` opens Security, the session table lists + "This device" is badged + its Revoke is disabled, the 2FA dialog opens (QR/secret → code → recovery codes), the notifications toggles persist optimistically, the Privacy tab shows consent + erase. `/account` redirects to `?tab=privacy`. No console errors. Screenshot.
- [ ] **Step 5: Commit** — `git commit -am "feat(settings): tabbed /settings page + ?tab deep-link + nav + /account redirect"`

### Task 7: Wire the real client at integration (after `pnpm gen`)

- [ ] **Step 1: api-client** — once `settings.proto` is generated, in `frontend/packages/api-client/src/index.ts` add `settings_pb` to (a) the import block, (b) the `export * from "./gen/settings_pb.js"` list, (c) `ApiClients` as `settings: Client<typeof SettingsService>`, and (d) the `clientsFromTransport` return — mirroring `decisions`/`compliance` exactly.
- [ ] **Step 2: flip the toggle** — drop `NEXT_PUBLIC_MOCK` (or set `=0`); the page swaps to `createSettingsClient(api)` with **no component change** (the `SettingsClient` interface is the seam). `--filter @ip/api-client typecheck` then `--filter @ip/shared typecheck` then `--filter @ip/candidate build` green.
- [ ] **Step 3: Commit** — `git commit -am "feat(settings): integrate real SettingsService client (pnpm gen)"`

### Task 8: Login-page 2FA challenge step (both apps)

- [ ] **Step 1:** In `app/login/page.tsx`, when `login` returns `mfa_required` (carrying the `mfa_token`), render a **"Enter your 6-digit code"** step (with a "use a recovery code" affordance) → `api.auth.verifyTotpLogin({ mfaToken, code })` → on success store the returned tokens exactly as a normal login does (the existing `useAuth` token-set path) and proceed. A wrong/expired challenge → surface `errorMessage` and let them restart. The 2FA-**off** path is unchanged (the challenge branch only renders when the response says so).
- [ ] **Step 2: Verify** — `--filter @ip/candidate build` clean; manual: enable 2FA → log out → login asks for the code → enter → in.
- [ ] **Step 3: Commit** — `git commit -am "feat(settings): login 2FA challenge step (mfa_required)"`

### Task 9–10: Port to the company app

- [ ] **Task 9 — company tabs:** create `frontend/apps/company/app/settings/{page.tsx,types.ts,settings-client.ts}` + `components/settings/{account-tab,security-tab,notifications-tab,privacy-tab,totp-setup-dialog,session-list}.tsx` as **thin duplicates** of the candidate files (the app-local convention). The **Account** tab is **read-only identity**: show the role + company name (not editable — org management is the team module) and the email + Change-email + Change-password actions; **no `/profile` link**. The Privacy tab re-uses the company app's `ComplianceService` access (consent + erase) if present; if company has no erasure surface, ship only the controls that apply (flag at handoff). Use `CompanyShell`. Add `{ href: "/settings", label: "Settings" }` to `company-shell.tsx`'s `NAV`. The login-page 2FA step (Task 8) is built for **both** apps.
- [ ] **Task 10 — verify + gate:** `npx pnpm@9.15.0 --filter @ip/company build` + `--filter @ip/candidate build` + `--filter @ip/{ui,shared,api-client} typecheck` all green. Manual: a company user enables 2FA → logs out → login asks for the code → in. **Commit** each app's port separately. Flag at handoff: (a) the QR lib vs. manual-secret fallback choice; (b) where the **2FA-on status** + **account email** are read from for the FE (a "me" field vs. profile query) — both are display reads the FE needs but the JWT lacks; (c) the `VerifyEmailChange`/`RevokeAllSessions` proto spelling chosen; (d) `NEXT_PUBLIC_MOCK` removed.

---

## C. States & acceptance

- **States (every tab):** loading (`LoadingState`/`Skeleton`), empty (sessions never truly empty — the current device always lists; prefs fall back to defaults), error (`ErrorState` + retry on the queries; mutation errors → `toast.error(errorMessage(err))`), success. The 2FA dialog has its own 3-state machine (setup → verify → recovery-reveal); recovery codes + the TOTP secret are shown **once**.
- **Security posture (this is a security surface):** the FE never holds the TOTP secret beyond the setup dialog; recovery codes are revealed once and not re-fetchable; password/disable-2FA forms have client-side guards that **mirror** the server (the server stays the authority); revoke-all-others is the safe bulk action; "This device" current-session marking is advisory (IP+UA match) and its individual revoke is disabled.
- **Responsive:** the session `Table` scrolls/stacks under `md:`; the tab list wraps; forms are single-column on mobile.
- **Dark mode:** tokens only (`bg-surface-muted`, `text-muted-foreground`, `border-border`, `tone=` Badge/Alert families) — automatic.
- **A11y:** each tab is a labelled `Tabs` panel; forms use `Field` (label + error); the 6-digit code input is `inputMode="numeric"`; toggles are real `Checkbox`/`RadioGroup` with associated labels; the destructive erase + disable-2FA + revoke-all use `ConfirmDialog`.
- **Acceptance:** matches `aptura_settings_security` (2FA card with QR + recovery codes, the active-session list + revoke, the notification preferences) plus the Privacy tab hosting consent + erasure; the existing `/account` consent/erasure behavior is **preserved** (moved, not removed) and `/account` redirects; `--filter @ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck` all green; works against the mock today and against `SettingsService` once the BE lands (flip `NEXT_PUBLIC_MOCK`); the login 2FA step completes `verifyTotpLogin`.
