# Settings & Security — Account self-management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this task-by-task. Steps use `- [ ]` checkboxes.
> Spec: `docs/superpowers/v2/2026-06-19-settings-and-security-design.md`. Canonical design:
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` (§4 #1 Identity & Access, §6, §7).
> Closes completeness-audit **Part A #1** (`2026-06-19-v2-completeness-audit.md`).

**Goal:** A self-service **account & security** module for every authenticated user (candidate +
company). A new authed gRPC-web **`SettingsService`** on **admin** (owns Mongo) provides: **notification
preferences** (a per-user `notification_prefs` doc the notifications center reads to decide channels),
**password change** (verify current → set new → revoke other sessions), **email change** (stage new →
re-verify via token → swap), **2FA TOTP** (setup/verify/disable + a login gate), and **active sessions**
(list device/ip/last-seen + revoke one / revoke all others, reusing `RefreshSessionStore`). Plus
candidate/company **`/settings`** pages (tabs: Profile/Account, Security, Notifications) reusing `@ip/ui`.
Every sensitive op is **rate-limited** (`lib.redis.RateLimiter`), **audited** (`AuditLog`), and
**validated at the boundary**. No new service, no new infra. **EXCLUDE** ID/background/biometric and
SMS-2FA (TOTP only; SMS is a notification channel behind a seam).

**Architecture:** New `resources/settings.py` (the contract: self-scoping + validation + rate-limit +
audit + session/2FA/prefs logic + `channels_for`) over a new `notification_prefs` repository + additive
`users` fields + an enriched `RefreshSessionStore`. A thin `SettingsServicer` adapts gRPC-web to the
resource (mirrors `routes/decision.py`). TOTP is `pyotp` behind a `TotpProvider` Protocol (fake in
tests); the TOTP secret is encrypted behind a `crypto`/`SecretBox` seam. A new `@ip/shared/settings.ts`
wraps the gRPC-web calls; the `/settings` page reuses `@ip/ui` `Tabs`/`Card`/`Input`/`ConfirmDialog`.

## Global Constraints

- **LOCAL-ONLY — never run git/gh.** "Commit" steps are replaced by **"run the gate"**:
  `bash scripts/check.sh` (ruff format+lint S-rules line-88, pip-audit, pytest ×5) must stay green;
  baseline today is **423 tests**. Frontend verified by `npx pnpm@9.15.0 --filter @ip/candidate build`
  + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck`. Never `next build`
  while `pnpm dev` is live.
- **Robustness bar (this is a security surface — treat every input as a contract surface):** validate
  at boundaries (passwords min-length, `EmailStr`, 6-digit TOTP shape, `digest` enum, quiet-hours
  time + IANA tz); trust internal typed calls (no defensive coercion); rate-limit every sensitive op
  via the **existing** `lib.redis.RateLimiter`; audit every state-change via the **existing**
  `AuditLog`; never leak which precise check failed (opaque `RESOURCE_EXHAUSTED`/`UNAUTHENTICATED`).
  Follow `~/.claude/CLAUDE.md` (minimal, trust-the-system, validate-at-boundaries) and
  `docs/superpowers/plans/PRODUCTION_STANDARDS.md`.
- **Reuse, do NOT reinvent the security primitives:** `lib.security` `hash_password`/`verify_password`,
  `TokenService` (add only a new `mfa` purpose + reuse `verification_token` for email change),
  `RefreshSessionStore` (`revoke`/`revoke_user` already exist — only **add metadata**),
  `SingleUseTokenStore` (nonce anti-replay), `RateLimiter`. The password-change flow is the
  authenticated sibling of `resources/auth.reset_password`; the email-change flow mirrors
  `resources/auth.verify_email`.
- **Self-scoped only:** every RPC acts on `identity["id"]` — **no target-user param** on any request
  (that's the separate team module). Authz = caller-resolution, exactly like `resources/compliance.py`.
- **Login gate is ADDITIVE:** with 2FA off, `AuthService.Login` must be **byte-for-byte today's
  behaviour** (the large existing auth suite stays green); the gate branches only when `totp_enabled`.
- **Resource is the contract:** no validation/authz/rate-limit/DTO logic in the servicer or any FE
  adapter.
- **Notifications-center ordering:** this plan adds `channels_for` (the pure channel-decision read) in
  `resources/settings.py`. The center's `_emit` **calls** it (best-effort, fail-open to defaults). If
  the notifications-center increment lands first, wire its `_emit` to call `channels_for`; if this
  lands first, ship `channels_for` + its tests and the center wires to it when it lands (flag at
  handoff). The **always-on in-app row is the center's job**, never gated here.
- **TOTP offline:** `pyotp` is pure/offline (fits the gate); inject a deterministic fake `TotpProvider`
  in tests so no wall-clock flakiness. The `crypto`/`SecretBox` is also faked in tests (identity or
  reversible stub) so encryption is exercised without a real key.

---

## File structure (new + modified)

```
src/admin/app/
  model/settings.py                        (NEW — NotificationPrefs + QuietHours + ChannelDecision pydantic models)
  model/auth.py                            (MODIFY — +totp_secret/totp_enabled/recovery_codes/pending_email on User)
  infra/repositories/
    notification_prefs.py                  (NEW — NotificationPrefsRepository: get_by_user/upsert/delete_by_user)
    users.py                               (MODIFY — +set_totp/clear_totp/set_pending_email/swap_email helpers; widen anonymize)
  infra/db.py                              (+INDEX: notification_prefs.user_id unique)
  infra/totp.py                            (NEW — PyotpProvider implementing the TotpProvider Protocol)
  infra/crypto.py                          (NEW — SecretBox: encrypt/decrypt the TOTP secret, app-secret-keyed)
  resources/settings.py                    (NEW — the contract: pw/email/2FA/sessions/prefs + channels_for + rate-limit + audit)
  resources/auth.py                        (MODIFY — login() branches to mfa_required when totp_enabled; add verify_totp_login internals or delegate)
  resources/compliance.py                  (CandidateEraser: +notification_prefs cascade; widen anonymize usage; revoke_user on erase)
  routes/pb/settings.proto                 (NEW) + generated settings_pb2*.py (via pnpm gen / buf)
  routes/settings.py                       (NEW — SettingsServicer, thin adapter; sources IP+UA from gRPC metadata)
  routes/auth.py                           (MODIFY — Login maps an mfa_required result to the challenge response; +VerifyTotpLogin RPC if on AuthService, else it lives on SettingsService)
  routes/web.py                            (+register SettingsServicer; +notification_prefs in make_eraser; thread crypto/totp/limiter/sessions)
  infra/sessions/ (lib)                    → see lib change below

lib/lib/security/sessions.py               (MODIFY — RefreshSessionStore: +allow_meta/touch/list_for_user; meta hash shares the session TTL)

src/admin/tests/
  test_resources_settings.py               (NEW — pw/email/2FA/sessions/prefs/channels_for, all self-scoped, rate-limit, audit, no-secret-leak)
  test_routes_settings.py                  (NEW — servicer status mapping + caller_identity + IP/UA sourcing + no logic in adapter)
  test_resources_auth.py                   (EXTEND — login gating: 2FA-off unchanged; 2FA-on returns challenge; verify_totp_login mints tokens)
  test_resources_compliance.py             (EXTEND — erase deletes prefs, anonymize nulls security fields, revoke_user called)
  conftest.py                              (+fake prefs repo, fake TotpProvider, fake crypto, fake RateLimiter if the suite uses fakes)

lib/tests/ (or src/admin/tests as the repo places lib tests)
  test_sessions_meta.py                    (NEW — allow_meta writes meta w/ TTL; list_for_user; touch updates last_seen; revoke removes meta)

frontend/packages/api-client/src/
  index.ts                                 (+settings_pb import/re-export; +SettingsService in ApiClients + clientsFromTransport)
frontend/packages/shared/src/
  settings.ts                              (NEW — createSettingsClient: pw/email/2FA/sessions/prefs calls + query-key helpers)
  index.ts                                 (+export createSettingsClient + re-export Prefs/Session/TotpSetup DTOs)
frontend/apps/candidate/
  app/settings/page.tsx                    (NEW — tabs: Profile/Account, Security, Notifications)
  components/settings/                      (NEW — security-tab.tsx, notifications-tab.tsx, account-tab.tsx; lucide imported here)
  components/candidate-shell.tsx           (+/settings nav entry)
frontend/apps/company/
  app/settings/page.tsx                    (NEW — same tabs; Account tab read-only role/company)
  components/settings/                      (NEW — thin duplicates of the candidate tabs; app-local convention)
  components/company-shell.tsx             (+/settings nav entry)
```

**Responsibilities (one job each):** `resources/settings.py` = all logic (self-scope/validation/
rate-limit/audit/session+2FA+prefs/`channels_for`). `routes/settings.py` = gRPC adapter only (+ IP/UA
from metadata). `infra/totp.py` + `infra/crypto.py` = injectable seams (faked in tests).
`lib...sessions.py` = the session store, **enriched** (meta is advisory decoration; the jti-in-SET stays
the auth authority). `settings.ts` = transport + query keys. The tab components = app-local re-skins
over `@ip/ui`.

---

## TIER A — data + security seams (models, repos, the enriched session store, totp/crypto)

### Task 1 — models + `users` extension + `notification_prefs` repo + index
**Files:** Create `model/settings.py`, `infra/repositories/notification_prefs.py`; Modify
`model/auth.py`, `infra/repositories/users.py`, `infra/db.py`.
**Deliverable:** the new collection + its index exist; `users` carries the security fields; repos expose
the reads/writes the resource needs.

- [ ] **Step 1 — `model/settings.py`** — `QuietHours` (`start: str`, `end: str`, `tz: str`),
  `NotificationPrefs` (`user_id`, `email_categories: dict[str, bool]`, `sms_critical: bool = False`,
  `digest: Literal["off","daily","weekly"] = "off"`, `quiet_hours: QuietHours | None = None`,
  `updated_at` default-now), and a small `ChannelDecision` dataclass (`email: bool`, `sms: bool`,
  `in_app: bool`). Mirror `model/aptitude.py` field style (pydantic `BaseModel` + `Field`).
- [ ] **Step 2 — `model/auth.py`** — add to `User` (all additive/defaulted so existing rows validate):
  `totp_secret: str | None = None`, `totp_enabled: bool = False`, `recovery_codes: list[str] = []`
  (Field default_factory list), `pending_email: str | None = None`.
- [ ] **Step 3 — `NotificationPrefsRepository`** (extend `lib.mongodb.BaseRepository`, mirror an
  existing per-user repo): `get_by_user(user_id)`, `upsert(user_id, fields)` (set + stamp
  `updated_at`), `delete_by_user(user_id)` (mirror `ConsentRepository.delete_by_user` for the cascade).
- [ ] **Step 4 — `users.py` helpers + widen `anonymize`:** add `set_totp(user_id, enc_secret)`,
  `enable_totp(user_id, recovery_hashes)`, `clear_totp(user_id)`, `set_pending_email(user_id, email)`,
  `swap_email(user_id, new_email)` (set `email`, clear `pending_email`, `email_verified=True`), and
  **widen `anonymize`** to also null `totp_secret`/`recovery_codes`/`pending_email` (so erasure leaves
  no residual secret — spec §3.8).
- [ ] **Step 5 — index** in `infra/db.py` `INDEXES` (single index authority):
```python
# settings — one preferences doc per user
IndexSpec("notification_prefs", "user_id", {"unique": True}),
```
- [ ] **Step 6 — gate:** `bash scripts/check.sh` green (models/repos are import-only; no behavior yet).

### Task 2 — enrich `RefreshSessionStore` with session metadata (TDD, in `lib`)
**Files:** Modify `lib/lib/security/sessions.py`; Test `test_sessions_meta.py`.
**Interfaces — Produces:** `allow_meta(user_id, jti, ttl_seconds, *, meta)`, `touch(jti, *, meta)`,
`list_for_user(user_id)`. **Reuses:** the existing jti-key + user-SET; the meta hash shares the TTL.

- [ ] **Step 1 — failing tests:** `allow_meta` writes a `refresh:meta:{jti}` hash (`ip`, `user_agent`,
  `created_at`, `last_seen_at`) **with the same TTL as the session** and adds the jti to the user SET;
  `list_for_user` returns one row per **active** jti (an expired/missing meta key is skipped but the
  jti-in-SET remains the authority — assert a session with a lost meta key still counts as active via
  `is_active`); `touch` updates `last_seen_at` (and ip/ua if changed); `revoke(jti)` removes the meta
  hash too (no orphan); `revoke_user` clears all (meta included, since keys share the TTL / are deleted
  with the jti keys). Use a fake/in-memory Redis (the suite's existing pattern).
- [ ] **Step 2 — run → FAIL → implement.** `allow_meta` = the existing `allow` body + an `HSET` of the
  meta hash + `expire(meta_key, ttl)`; `touch` = `HSET last_seen_at` (guard a missing key — a touched
  expired session is a no-op); `list_for_user` = read the user SET, `HGETALL` each meta key, drop empties.
  **Do not** change `allow`/`is_active`/`revoke`/`revoke_user` signatures — `allow_meta` is a superset;
  `revoke` additionally deletes the meta key. Keep `with_timeout` on every Redis call (the existing
  resilience pattern).
- [ ] **Step 3 — gate green** (lib tests + admin tests still pass — nothing consumes `allow_meta` yet).

### Task 3 — `TotpProvider` + `SecretBox` seams
**Files:** Create `infra/totp.py`, `infra/crypto.py`.
**Deliverable:** injectable TOTP + encryption seams with real impls (`pyotp`, `cryptography.fernet`)
and a Protocol each, so tests inject deterministic fakes.

- [ ] **Step 1 — `infra/totp.py`:** define the `TotpProvider` Protocol (`generate_secret`,
  `provisioning_uri(secret, account)`, `verify(secret, code, *, valid_window=1)`) + `PyotpProvider`
  implementing it over `pyotp` (add `pyotp` to the deps if absent — confirm it's in the lockfile / 3rd-
  party allowlist). Pure/offline; no network.
- [ ] **Step 2 — `infra/crypto.py`:** define a `SecretBox` (or `Crypto`) Protocol (`encrypt(plaintext)
  -> str`, `decrypt(token) -> str`) + a Fernet-backed impl keyed by an app secret from config (the
  same config seam the JWT secret uses). Document the key-source/rotation as a §6 follow-up; isolate so
  the key is a wiring detail.
- [ ] **Step 3 — gate green** (import-only; consumed in Tier B).

---

## TIER B — the resource contract (the core; pure-logic, fully unit-tested offline)

### Task 4 — `resources/settings.change_password` (TDD — verify → set → revoke-others → keep-current)
**Files:** Create `resources/settings.py`; Test `tests/test_resources_settings.py`.
**Interfaces — Produces:** `async change_password(identity, current_password, new_password, *, users,
sessions, limiter, audit, current_jti=None) -> dict`. **Consumes:** `hash_password`/`verify_password`,
`RateLimiter`, `RefreshSessionStore.revoke_user`/`allow_meta`, `AuditLog`.

- [ ] **Step 1 — failing tests:**
  - wrong current password → `InvalidCredentialsError` **and** a rate-limit hit was counted; a
    too-short new password → `ValidationError`; an SSO-only account (`password_hash == ""`) →
    `ValidationError` (route to reset).
  - success: `password_hash` updated (`verify_password(new, stored)` true), **other sessions revoked**
    (`revoke_user` called) **but the caller's current session preserved** (a fresh jti re-`allow`ed for
    the caller — assert the returned/kept session), and an `AuditLog(action="password_changed")` written.
  - over rate-limit budget → `RateLimitedError`.
- [ ] **Step 2 — run** `(cd src/admin && ../../.venv/bin/python -m pytest tests/test_resources_settings.py -v)` → FAIL.
- [ ] **Step 3 — implement.** Define module constants at the top (`PWCHANGE_LIMIT`, `PWCHANGE_WINDOW`,
  `MIN_PASSWORD_LEN` matching the register policy, `RECOVERY_CODE_COUNT = 10`, `MFA_TTL_SECONDS`).
  `change_password`: rate-limit → validate → `verify_password` (SSO-empty-hash fails closed to
  `ValidationError`) → `users.update(password_hash=...)` → `revoke_user` then re-`allow_meta` the
  caller's new jti (keep-current, spec §3.3/§6) → audit. **Reuse** `verify_password`/`hash_password` —
  do not reimplement.
- [ ] **Step 4 — run → PASS; gate green.**

### Task 5 — 2FA: `start_totp` / `verify_totp` / `disable_totp` (TDD)
**Files:** Modify `resources/settings.py`; Test `tests/test_resources_settings.py`.
**Interfaces — Produces:** `start_totp(identity, *, users, totp, crypto)`,
`verify_totp(identity, code, *, users, totp, crypto, limiter, audit)`,
`disable_totp(identity, code_or_recovery, *, users, totp, crypto, limiter, audit)`.

- [ ] **Step 1 — failing tests:**
  - `start_totp` stages an **encrypted** secret (`crypto.encrypt` called; stored value is not the raw
    secret) with `totp_enabled=False`, and returns the provisioning URI + the raw secret **once**.
  - `verify_totp` with a good code (fake `totp.verify` → True) sets `totp_enabled=True`, generates
    **`RECOVERY_CODE_COUNT`** recovery codes, stores them **hashed** (each `hash_password`; stored != 
    plaintext), and returns the **plaintext codes once**; a bad code → no enable (+ rate-limit hit);
    audited `totp_enabled`.
  - `disable_totp` requires a valid TOTP **or** recovery code (a recovery code is matched via
    `verify_password` against the stored hashes and **consumed**); on success clears
    `totp_secret`/`totp_enabled=False`/`recovery_codes=[]`; a bad code/recovery → rejected (+ rate-limit
    hit); audited `totp_disabled`.
  - **no-secret-leak:** assert the 2FA-status DTO (and any list/read) **never** contains `totp_secret`
    or recovery-code hashes (only the one-time reveals return material).
- [ ] **Step 2 — run → FAIL → implement.** Use the injected `totp` + `crypto`; recovery-code match
  reuses `verify_password` over the stored hashes (consume on match). Rate-limit key `mfa:{id}`.
- [ ] **Step 3 — gate green.**

### Task 6 — email change: `request_email_change` / `confirm_email_change` (TDD)
**Files:** Modify `resources/settings.py`; Test `tests/test_resources_settings.py`.
**Interfaces — Produces:** `request_email_change(identity, new_email, *, users, tokens, notifier,
nonces, limiter, audit)`, `confirm_email_change(token, *, users, tokens, nonces, sessions, audit)`.

- [ ] **Step 1 — failing tests:**
  - `request_email_change` normalizes+validates the new email, **rejects one already registered to
    another user** (`ConflictError`), stages it as `pending_email` (the live `email` is **untouched**),
    emails the **new** address a verification link (reuse `tokens.verification_token` +
    `nonces.allow`), audits `email_change_requested`; rate-limited; an invalid email → `ValidationError`.
  - `confirm_email_change` decodes the token (purpose `email_verify`), **consumes the nonce**
    (anti-replay — a second call → `InvalidTokenError`), verifies `pending_email` still set + still
    unique, then **swaps** (`email = pending_email`, `pending_email = None`, `email_verified = True`),
    audits `email_changed`, and (default) revokes other sessions (spec §3.7/§6).
- [ ] **Step 2 — run → FAIL → implement.** Mirror `resources/auth.verify_email` (token → nonce-consume →
  set) but target `pending_email`/`swap_email`. Reuse the existing token + nonce machinery — no new
  token purpose for email change.
- [ ] **Step 3 — gate green.**

### Task 7 — active sessions + notification prefs + `channels_for` (TDD)
**Files:** Modify `resources/settings.py`; Test `tests/test_resources_settings.py`.
**Interfaces — Produces:** `list_sessions(identity, *, sessions, current_ip, current_ua)`,
`revoke_session(identity, jti, *, sessions, limiter, audit)`,
`revoke_other_sessions(identity, *, sessions, limiter, audit, current_jti)`,
`get_prefs(identity, *, prefs)`, `update_prefs(identity, fields, *, prefs, audit)`,
`channels_for(user_id, kind, *, prefs, clock=_utcnow)`.

- [ ] **Step 1 — failing tests:**
  - `list_sessions` returns one row per active jti (device/ip/last-seen from the meta hash), marking the
    **IP+UA match** `current=true`; a session with a lost meta key still lists (degraded detail, still
    active).
  - `revoke_session` kills one jti (and **404s a jti that isn't the caller's** — resolve ownership via
    the user SET); `revoke_other_sessions` kills all but `current_jti` (re-`allow_meta` the caller);
    both audited + rate-limited.
  - `get_prefs` returns **safe defaults** (email-all-on, `sms_critical=False`, `digest="off"`, no quiet
    hours) when no doc exists; `update_prefs` validates the `digest` enum + quiet-hours time format +
    a real IANA tz (`ValidationError` otherwise), stamps `updated_at`, audits `notification_prefs_updated`.
  - **`channels_for` (the center's gate):** `in_app` is **always True**; email gated by category +
    quiet-hours (non-critical suppressed in-window, **critical bypasses**) + `digest == "off"`; SMS only
    when `sms_critical` **and** the kind is in `CRITICAL_KINDS`; an unknown kind defaults to
    `application_updates`; **a failure fails OPEN to defaults** (email per defaults — assert it never
    returns silence on error).
- [ ] **Step 2 — run → FAIL → implement.** Define `KIND_CATEGORY` + `CRITICAL_KINDS` constants and the
  `_in_quiet_hours(quiet_hours, now_utc)` helper (UTC-anchored, the single place tz math lives — test
  it across a DST boundary). `channels_for` is a **pure read** (no audit, no write). Session ownership:
  a jti is the caller's iff it's in `sessions`' user SET for `identity["id"]`.
- [ ] **Step 3 — gate green.**

### Task 8 — login gating (TDD — additive; 2FA-off path unchanged)
**Files:** Modify `resources/auth.py` (+ `resources/settings.py` for `verify_totp_login` internals);
Extend `tests/test_resources_auth.py`.
**Interfaces — Produces:** `login(...)` returns an `mfa_required` result when `totp_enabled`;
`verify_totp_login(mfa_token, code, *, users, tokens, sessions, nonces, totp, crypto, limiter,
refresh_ttl_seconds, audit)`.

- [ ] **Step 1 — failing tests:**
  - **2FA off → unchanged:** `login` with `totp_enabled=False` mints access+refresh, `allow`s the
    session, audits `login` — **assert the existing behaviour is byte-for-byte preserved** (the existing
    login tests must still pass untouched).
  - **2FA on → challenge:** `login` with `totp_enabled=True` returns an `mfa_required` payload carrying
    a **single-use, short-lived `mfa` token** (new `TokenService` purpose), **not** access/refresh
    tokens; the password is still verified first (a wrong password still → `InvalidCredentialsError`,
    never a challenge).
  - **complete:** `verify_totp_login` consumes the `mfa` nonce (a replay → rejected), decodes the `mfa`
    token → `sub`, verifies the TOTP code **or** a recovery code, then mints the **real** tokens +
    `allow_meta`s the session + audits `login` (with an `mfa=true` marker); brute-forcing the code is
    rate-limited per `sub`.
- [ ] **Step 2 — run → FAIL → implement.** Add a `mfa` purpose to `TokenService` (`mfa_token(sub, jti)`
  + accept it in `decode(expected purpose)`), mirroring `verification_token`. `login` branches **after**
  `verify_password` succeeds: `totp_enabled` → register an `mfa` nonce + return the challenge; else the
  current path. `verify_totp_login` reuses the **exact** token-mint + `allow` + audit block `login`
  uses (extract a tiny shared helper if it reduces duplication; the mint is used 2+ times → justified).
  Keep `_client_ip`/UA sourcing in the servicer.
- [ ] **Step 3 — gate green** (the full auth suite + the new gating tests).

---

## TIER C — transport: the gRPC-web service + erasure cascade

### Task 9 — `settings.proto` + generate the client
**Files:** Create `routes/pb/settings.proto`; run the generator.
**Deliverable:** `settings_pb2.py`/`settings_pb2_grpc.py` (admin) + the TS client for `@ip/api-client`.

- [ ] **Step 1 — `settings.proto`** (`package admin.settings.v1`; mirror `decision.proto`/`auth.proto`
  shape). RPCs (no request carries a target `user_id` — the caller is the token):
```proto
service SettingsService {
  rpc ChangePassword(ChangePasswordRequest) returns (OkResponse);
  rpc RequestEmailChange(RequestEmailChangeRequest) returns (OkResponse);
  rpc ConfirmEmailChange(ConfirmEmailChangeRequest) returns (OkResponse);   // token-bearing (link target)
  rpc StartTotp(StartTotpRequest) returns (StartTotpResponse);              // returns provisioning_uri + secret (once)
  rpc VerifyTotp(VerifyTotpRequest) returns (VerifyTotpResponse);           // returns recovery_codes (once)
  rpc DisableTotp(DisableTotpRequest) returns (OkResponse);
  rpc VerifyTotpLogin(VerifyTotpLoginRequest) returns (TokenResponse);      // 2nd factor → real tokens
  rpc ListSessions(ListSessionsRequest) returns (ListSessionsResponse);
  rpc RevokeSession(RevokeSessionRequest) returns (OkResponse);
  rpc RevokeOtherSessions(RevokeOtherSessionsRequest) returns (OkResponse);
  rpc GetNotificationPrefs(GetNotificationPrefsRequest) returns (NotificationPrefs);
  rpc UpdateNotificationPrefs(NotificationPrefs) returns (NotificationPrefs);
}
message ChangePasswordRequest { string current_password = 1; string new_password = 2; }
message RequestEmailChangeRequest { string new_email = 1; }
message ConfirmEmailChangeRequest { string token = 1; }
message StartTotpResponse { string provisioning_uri = 1; string secret = 2; }
message VerifyTotpRequest { string code = 1; }
message VerifyTotpResponse { bool enabled = 1; repeated string recovery_codes = 2; }
message DisableTotpRequest { string code = 1; }   // a TOTP code OR a recovery code
message VerifyTotpLoginRequest { string mfa_token = 1; string code = 2; }
message TokenResponse { string access_token = 1; string refresh_token = 2; string token_type = 3; }  // reuse auth's shape
message SessionDTO { string jti = 1; string ip = 2; string user_agent = 3; string created_at = 4; string last_seen_at = 5; bool current = 6; }
message ListSessionsResponse { repeated SessionDTO sessions = 1; }
message RevokeSessionRequest { string jti = 1; }
message QuietHours { string start = 1; string end = 2; string tz = 3; }
message NotificationPrefs {
  map<string, bool> email_categories = 1; bool sms_critical = 2; string digest = 3; QuietHours quiet_hours = 4;
}
message OkResponse { bool ok = 1; }
// (empty request messages: StartTotpRequest, ListSessionsRequest, RevokeOtherSessionsRequest, GetNotificationPrefsRequest)
```
  > **Where does `Login` return the challenge + does `VerifyTotpLogin` live on Auth or Settings?**
  > `Login` stays on `AuthService`; when 2FA is on it must return a challenge, so either (a) extend the
  > auth `TokenResponse`/Login to carry an optional `mfa_token` + `mfa_required` flag (preferred — one
  > Login RPC, the challenge rides the existing response), or (b) a dedicated `LoginChallengeResponse`.
  > `VerifyTotpLogin` is placed on `SettingsService` here for cohesion, but it is **pre-auth** (the
  > caller has only the `mfa` token, no access token) — so it must **not** require `caller_identity`;
  > it authenticates via the `mfa` token in the request body. Confirm the Auth-vs-Settings placement +
  > the Login response shape at planning (flag at handoff). Whichever, the 2FA-off Login response is
  > **unchanged**.
- [ ] **Step 2 — generate** the Python stubs (same toolchain as the existing `pb/*` — buf/protoc) and
  the TS client via `npx pnpm@9.15.0 --filter @ip/api-client gen` (regenerate, don't hand-edit).
- [ ] **Step 3 — gate green** (generated stubs import cleanly).

### Task 10 — `SettingsServicer` (TDD — thin adapter) + register + wire erasure
**Files:** Create `routes/settings.py`; Modify `routes/auth.py` (Login challenge mapping),
`routes/web.py`, `resources/compliance.py`; Test `tests/test_routes_settings.py`,
`tests/test_resources_compliance.py`.
**Interfaces — Consumes:** `resources/settings.*`, `caller_identity`, `_STATUS`, gRPC metadata (IP/UA).

- [ ] **Step 1 — failing servicer tests** (mirror the decision/aptitude servicer tests): each
  authed RPC 200-returns its DTO for the caller; **status mapping** via `_STATUS`
  (Validation→INVALID_ARGUMENT, InvalidCredentials→UNAUTHENTICATED, Conflict→ALREADY_EXISTS,
  RateLimited→RESOURCE_EXHAUSTED, NotFound→NOT_FOUND); `caller_identity` enforced on the authed RPCs
  (no token → UNAUTHENTICATED); **`VerifyTotpLogin` does NOT require `caller_identity`** (pre-auth — it
  trusts the `mfa` token in the body); IP+UA are sourced from gRPC metadata (the `_client_ip` pattern)
  and threaded to `list_sessions`/`change_password`/etc.; **no validation/authz logic in the adapter**.
- [ ] **Step 2 — implement** `SettingsServicer(decision-style)`: each authed RPC `try`s
  `identity = await caller_identity(context, self._tokens)`, calls the resource with injected
  collaborators (repos, `tokens`, `sessions`, `limiter`, `totp`, `crypto`, `notifier`, `nonces`,
  `audit`), maps the result to proto, `except AuthDomainError` → `self._abort`. `ConfirmEmailChange` is
  token-bearing (link target) and **not** `caller_identity`-gated (the token is the auth); same for
  `VerifyTotpLogin`.
- [ ] **Step 3 — register in `routes/web.py`:** add
  `settings_pb2_grpc.add_SettingsServiceServicer_to_server(SettingsServicer(users=UserRepository(db),
  prefs=NotificationPrefsRepository(db), tokens=tokens, sessions=RefreshSessionStore(redis),
  limiter=RateLimiter(redis), totp=PyotpProvider(), crypto=SecretBox(<app_secret>),
  notifier=notifier, nonces=SingleUseTokenStore(redis), audit=AuditLogRepository(db),
  refresh_ttl_seconds=refresh_ttl_seconds, trusted_proxy=trusted_proxy), app)`; add the
  `settings_pb2_grpc` import to the `pb` block. Thread `crypto`/`totp` construction (and the `SecretBox`
  app-secret from the config seam) into `create_web_app`'s signature.
- [ ] **Step 4 — erasure cascade:** add `notification_prefs` to `CandidateEraser.__init__` +
  `make_eraser`; in `erase`, call `notification_prefs.delete_by_user(user_id)` and ensure
  `sessions.revoke_user(user_id)` runs (so an erased user's sessions+meta are gone); the `users.anonymize`
  widening (Task 1 Step 4) nulls the security fields. **Failing test first** (`test_resources_compliance`:
  erase deletes prefs + nulls security fields + revokes sessions, while applications/audit survive),
  then implement.
- [ ] **Step 5 — Login challenge mapping** in `routes/auth.py`: when `login` returns an `mfa_required`
  result, map it to the chosen challenge response (Task 9 Step 1) instead of `TokenResponse`; the
  2FA-off path is unchanged.
- [ ] **Step 6 — run → PASS; full gate green.**

---

## TIER D — frontend: client + the `/settings` page (tabs) reusing `@ip/ui`

> **Grounding (read before coding).** Every authed read/write goes through `useAuth().api` (the typed
> `ApiClients`); see the existing candidate `/account` page (`app/account/page.tsx`) for the exact
> pattern — `useQuery`/`useMutation`, `queryClient.invalidateQueries`, `toast`, and `@ip/ui`
> `Card`/`Button`/`ConfirmDialog`/`LoadingState`/`Alert`/`PageHeader`/`Badge`. `Tabs`/`TabsList`/
> `TabsTrigger`/`TabsContent` are in `@ip/ui` (used by the company jobs/applicant pages). **Lucide icons
> are imported in the app**, never re-exported through `@ip/ui` (the lucide-must-be-in-app memo). The
> settings client wraps the **gRPC-web `ApiClients`**, built per-render: `const settings =
> useMemo(() => createSettingsClient(api), [api])`. The existing `/account` page (consent + erasure)
> **stays as-is** — `/settings` is the new home and may link to `/account`.

### Task 11 — `@ip/shared/settings.ts` + api-client wiring
**Files:** Create `frontend/packages/shared/src/settings.ts`; Modify
`frontend/packages/shared/src/index.ts`, `frontend/packages/api-client/src/index.ts`.
**Interfaces — Produces:** `createSettingsClient(api: ApiClients)` returning
`{ changePassword, requestEmailChange, confirmEmailChange, startTotp, verifyTotp, disableTotp,
verifyTotpLogin, listSessions, revokeSession, revokeOtherSessions, getPrefs, updatePrefs,
sessionsQueryKey, prefsQueryKey }`. Types re-exported from `@ip/api-client`'s generated `settings_pb`.

- [ ] **Step 1 — api-client (after `pnpm gen`):** in `frontend/packages/api-client/src/index.ts` add
  the generated `settings_pb` to (a) the import block, (b) the `export * from "./gen/settings_pb.js"`
  re-export list, (c) the `ApiClients` interface as `settings: Client<typeof SettingsService>`, and (d)
  the `clientsFromTransport` return object — mirroring `decisions`/`compliance` exactly.
- [ ] **Step 2 — `settings.ts`** (mirror the shape of an existing `create*Client` factory closing over
  the client). Export the query-key helpers (`sessionsQueryKey = () => ["settings","sessions"]`,
  `prefsQueryKey = () => ["settings","prefs"]`) so view + invalidation never drift. Each method is a
  thin `api.settings.<rpc>(...)`; errors surface as connect `ConnectError` (the same class
  `errorMessage` classifies) — **no try/except here**; the React layer renders the error.
- [ ] **Step 3 — barrel + typecheck:** export `createSettingsClient` + re-export the DTOs from
  `frontend/packages/shared/src/index.ts`; run `--filter @ip/api-client typecheck` then `--filter
  @ip/shared typecheck` green (api-client first — shared depends on its generated types).

### Task 12 — candidate `/settings` page (tabs) + nav
**Files:** Create `frontend/apps/candidate/app/settings/page.tsx`,
`frontend/apps/candidate/components/settings/{account-tab,security-tab,notifications-tab}.tsx`;
Modify `frontend/apps/candidate/components/candidate-shell.tsx`.

- [ ] **Step 1 — `/settings/page.tsx`** — `"use client"`, behind `useRequireAuth(token, ready)` (the
  `/account` pattern), a `PageHeader` + `@ip/ui` `Tabs` with three `TabsTrigger`s (Profile/Account,
  Security, Notifications) and a `TabsContent` rendering each tab component. `const settings =
  useMemo(() => createSettingsClient(api), [api])` passed (or each tab builds its own).
- [ ] **Step 2 — Account tab** (`account-tab.tsx`) — show the email + verified `Badge`; a **Change
  email** action (a form/`ConfirmDialog` collecting the new email → `requestEmailChange`, toast "check
  your new inbox to confirm"); a **Change password** action (a form: current + new + confirm, with a
  **client-side min-length guard mirroring the server**; → `changePassword`; on success toast "password
  changed — other devices signed out"). A link to `/profile` (candidate profile editor — not owned
  here) and to `/account` (privacy). Lucide `Mail`/`KeyRound` imported here.
- [ ] **Step 3 — Security tab** (`security-tab.tsx`) — **2FA:** a status `Badge` (on/off); when off, a
  **Set up 2FA** flow: call `startTotp` → render the `provisioning_uri` as a QR (a small client QR
  component, **or** the copyable secret string as the no-dependency fallback — confirm at planning) →
  a code-entry field → `verifyTotp` → on success **reveal the recovery codes once** (a copy-all
  affordance + "save these now" warning). When on, a **Disable 2FA** `ConfirmDialog` requiring a code →
  `disableTotp`. **Active sessions:** `useQuery({ queryKey: settings.sessionsQueryKey(), queryFn:
  settings.listSessions })` → a list of rows (device/ip/relative last-seen), the `current` row badged
  **"This device"** with its individual revoke disabled; a per-row **Revoke** (→ `revokeSession`,
  invalidate) and a **Sign out other sessions** button (→ `revokeOtherSessions`, invalidate). Lucide
  `Shield`/`Smartphone`/`Monitor` imported here. States: `LoadingState`/`ErrorState` + retry; mutation
  errors → `toast.error(errorMessage(err))`.
- [ ] **Step 4 — Notifications tab** (`notifications-tab.tsx`) — `useQuery(prefsQueryKey, getPrefs)` →
  render: per-category **email** toggles (the 4 categories), the **SMS-critical** opt-in, the **digest**
  cadence (off/daily/weekly radio), and **quiet hours** (start/end inputs + a tz select). Saving via
  `updatePrefs` with an **optimistic** toggle + `invalidateQueries` reconcile + toast (the `/account`
  consent mutation pattern). A small inline note that **in-app notifications are always on** (only email/
  SMS/cadence are configurable) so the missing in-app toggle isn't read as a bug. Lucide `Bell` here.
- [ ] **Step 5 — nav** in `candidate-shell.tsx` — add `{ href: "/settings", label: "Settings" }` to
  `NAV` (alongside the existing `/profile`, `/account`).
- [ ] **Step 6 — verify build:** `npx pnpm@9.15.0 --filter @ip/candidate build` green; manual open
  shows **no console errors**, the three tabs render, and each mutation round-trips against the dev
  backend (or is exercised via a fake transport in a unit test — no network in the gate).

### Task 13 — company `/settings` page (tabs) + nav + the 2FA login step
**Files:** Create `frontend/apps/company/app/settings/page.tsx`,
`frontend/apps/company/components/settings/{account-tab,security-tab,notifications-tab}.tsx` (thin
duplicates of the candidate tabs per the app-local convention — the Account tab shows role/company
**read-only**, no `/profile` link); Modify `frontend/apps/company/components/company-shell.tsx`; and the
**login page** of **both** apps for the 2FA challenge step.

- [ ] **Step 1 — company tabs** — duplicate the candidate Security + Notifications tabs verbatim (same
  `createSettingsClient` calls); the Account tab is read-only identity (email + Change-email +
  Change-password, role + company name shown but not editable here — org management is the team module).
- [ ] **Step 2 — nav** in `company-shell.tsx` — add `{ href: "/settings", label: "Settings" }` to its
  `NAV`.
- [ ] **Step 3 — the 2FA login step (both apps' login flow):** when `login` returns an `mfa_required`
  challenge (carrying the `mfa_token`), the login page shows a **"enter your 6-digit code"** step
  (with a "use a recovery code" affordance) → `verifyTotpLogin(mfa_token, code)` → on success store the
  returned tokens exactly as a normal login does (the existing `useAuth` token-set path) and proceed.
  A wrong/expired challenge → surface `errorMessage` and let them restart. (The 2FA-**off** login path
  is unchanged — the challenge branch only renders when the login response says so.)
- [ ] **Step 4 — verify build:** `npx pnpm@9.15.0 --filter @ip/company build` green; manual: a company
  user enables 2FA → logs out → login now asks for the code → enters it → in.
- [ ] **Step 5 — full gate + both FE builds + all four typechecks green; update `HANDOFF.md` + memory.**
  Run `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` + `--filter
  @ip/{ui,shared,api-client} typecheck`. Flag at handoff: (a) whether `channels_for` is wired into the
  real notifications-center `_emit` or awaiting that increment; (b) the Auth-vs-Settings placement of
  `VerifyTotpLogin` + the Login challenge response shape; (c) whether the QR lib was added or the
  manual-entry fallback shipped; (d) the keep-current-session mechanic chosen for password change /
  revoke-others.

---

## Verification (end-to-end)

1. **Per backend task:** `bash scripts/check.sh` GREEN (grows from **423**). All settings logic is
   pure-Python over injected collaborators (repos, `TokenService`, fake `TotpProvider`, fake `crypto`,
   fake `RateLimiter`, the `LoggingNotifier`/`LoggingSmsSender` sinks) — fully unit-tested offline; no
   network in the gate.
2. **Resource contract (the core, offline):** `test_resources_settings.py` proves self-scoping (every
   op on `identity["id"]`, no target-user param), password change (verify→set→revoke-others→keep-current
   + audit), 2FA (encrypted secret staged, enable returns hashed recovery codes + plaintext once,
   disable requires a code/recovery), email change (stage→verify→swap, replay rejected), sessions
   (list with current-badge, revoke one/all, lost-meta still active), prefs (defaults + validation),
   and `channels_for` (in-app always on; email gated by category/quiet-hours/digest; SMS critical-only
   + opt-in; **fail-open to defaults**); plus **no-secret-leak** in any DTO and the rate-limit table.
3. **Login gating:** `test_resources_auth.py` proves 2FA-off `login` is **unchanged** (the existing
   suite stays green), 2FA-on returns a single-use `mfa` challenge (not tokens), and `verify_totp_login`
   mints the real tokens (+ session + audit), with replay + brute-force protection.
4. **Session store:** `test_sessions_meta.py` proves `allow_meta` writes meta at the session TTL,
   `list_for_user` enumerates active jtis, `touch` updates last-seen, and revoke removes meta — while
   the jti-in-SET stays the auth authority (a lost meta key never invalidates a live session).
5. **Transport:** `test_routes_settings.py` proves `_STATUS` mapping + `caller_identity` on the authed
   RPCs (and **no** `caller_identity` on the pre-auth `ConfirmEmailChange`/`VerifyTotpLogin`), IP/UA
   sourcing from metadata, and that the servicer holds **no** logic.
6. **Erasure (Inc 0):** `test_resources_compliance.py` proves `erase` deletes `notification_prefs`,
   `anonymize` nulls the `users` security fields, and `revoke_user` clears sessions — while
   applications/audit survive.
7. **Notifications-center integration (cross-spec):** the center's `_emit` honours `channels_for`
   (email skipped when off/quiet/digest; **in-app row always written**; a `channels_for` failure
   doesn't break the send) — asserted in the center's suite, cross-referenced here.
8. **Frontend:** `@ip/{ui,shared,api-client}` typecheck + both app builds green. The three tabs render
   over a fake `ApiClients`/transport (password-change toast; 2FA setup reveals QR + recovery codes
   once; session list + revoke; prefs optimistic-then-reconcile; the in-app-always-on note present);
   the 2FA login step completes `verifyTotpLogin`. No network in unit tests.
9. **Manual / local E2E (Chrome via preview):** enable 2FA (QR → code → recovery codes) → log out →
   login asks for the code → in; change password → other sessions drop, current stays; request an email
   change → the link lands in the `LoggingNotifier` sink → confirm → email swaps; toggle "email me about
   messages" off → a new message produces an **in-app row** but **no** email in the sink; the session
   list shows the current device badged "This device".

## Resolved gaps (completeness audit 2026-06-19)

Folds the audit's **Part A #1 (core)** "Account settings & security" into a buildable module, plus the
relevant cross-cutting #4 (rate-limiting sensitive ops) for this surface, and fulfils the
notifications-center spec's deferred preferences gate. Each maps to concrete tasks above; the design
rationale is in `…-settings-and-security-design.md`.

- [ ] **Notification preferences (Part A #1)** — `notification_prefs` model + repo (**Task 1**),
  `get_prefs`/`update_prefs`/`channels_for` (**Task 7**), the Notifications tab (**Task 12 Step 4**),
  and the center reads `channels_for` to decide channels (**Global Constraints / Task 7**; in-app always
  on, email/SMS/digest/quiet-hours gated).
- [ ] **Password change (Part A #1)** — verify current → set new → **revoke other sessions, keep
  current** + audit (**Task 4**); Account-tab form with a client-side min-length guard (**Task 12 Step 2**).
- [ ] **Email change with re-verify (Part A #1)** — stage `pending_email` → verify the new address via a
  single-use token → swap (**Task 6**, mirroring `auth.verify_email`); Account-tab Change-email
  (**Task 12 Step 2**).
- [ ] **2FA TOTP (Part A #1)** — `start_totp`/`verify_totp`/`disable_totp` with an **encrypted secret**
  + **hashed recovery codes** (**Task 5**), the login **gate** + `verify_totp_login` (**Task 8**), the
  Security-tab setup/disable flow + the login code step (**Task 12 Step 3 / Task 13 Step 3**). TOTP only
  — no SMS-2FA.
- [ ] **Active sessions + revoke (Part A #1)** — enrich `RefreshSessionStore` with per-jti metadata
  (**Task 2**), `list_sessions`/`revoke_session`/`revoke_other_sessions` (**Task 7**), the Security-tab
  session list (**Task 12 Step 3**); reuses the existing `revoke`/`revoke_user`.
- [ ] **Rate-limiting sensitive ops (Part A #4, this surface)** — the consolidated per-user rate-limit
  table over the existing `RateLimiter` on every sensitive op (**Tasks 4–8**); over-budget → opaque
  `RESOURCE_EXHAUSTED` (**Task 10 Step 1**).
- [ ] **Audit + erasure follow-through** — `AuditLog` on every state-change (**Tasks 4–8**);
  `notification_prefs` joins the cascade + `anonymize` nulls security fields + `revoke_user` on erase
  (**Task 10 Step 4**).

## Risks / re-verify at execution

- **Login challenge response shape + `VerifyTotpLogin` placement.** `Login` stays on `AuthService`;
  decide whether the challenge rides an optional `mfa_token`/`mfa_required` on the existing Login
  response (preferred) or a new message, and whether `VerifyTotpLogin` sits on Auth or Settings (it is
  **pre-auth** — must not require `caller_identity`; it trusts the `mfa` token in the body). The
  2FA-**off** Login response must stay **unchanged**. Flag at handoff (Task 9 Step 1 note).
- **Keep-current-session mechanic.** Password change + revoke-others must boot other devices without
  logging out the caller. The simplest correct form is `revoke_user` then re-`allow_meta` a fresh jti
  for the caller; confirm whether to mint a new refresh jti mid-op vs. thread the existing one so FE
  token handling stays simple (spec §6).
- **"Current session" identification is advisory** (IP+UA match) — can mis-badge on shared NAT/identical
  browsers; **revoke-all-others is the safe bulk action** regardless. An exact `sid` claim is the
  follow-up — do **not** add it in v1 (avoids a token-shape change) unless planning decides otherwise.
- **TOTP secret encryption keying.** The `SecretBox` is app-secret-keyed (the JWT-secret config seam);
  isolate behind the `crypto` Protocol so the key source/rotation is a wiring detail (spec §6). Recovery
  codes are **hashed** (compared, not reproduced); the TOTP secret is **encrypted** (must be reproduced)
  — keep that split.
- **Proto/codegen drift.** Regenerate the TS client (`pnpm gen`) after `settings.proto`; hand-editing
  generated files drifts. Re-confirm the generator toolchain matches the existing `pb/*` artifacts.
- **`pyotp` dependency.** Confirm `pyotp` is acceptable + in the lockfile/allowlist; it is pure/offline
  (no network), so the gate stays clean. The fake `TotpProvider` keeps the unit tests deterministic.
- **SMS provider + digest batcher are seams, not built.** The SMS opt-in + gate are honoured but
  `LoggingSmsSender` only logs; choosing a digest **suppresses the immediate email** but no digest email
  arrives in v1 (the rollup scheduler is the follow-up). Both are flagged so they're not read as
  breakage — the **gate** ships and is tested; only **delivery** is deferred (mirrors email's
  LoggingNotifier → SMTP path).
- **`channels_for` fail-open.** If the prefs read errors, `channels_for` must **fall back to defaults**
  (email per defaults) — never fail-closed into silence (silence is the product's anti-goal). The
  center's existing best-effort wrap also covers it.
- **Quiet-hours tz math.** The `_in_quiet_hours` helper is the single place tz math lives; UTC-anchored,
  validated IANA tz at the boundary, unit-tested across a DST boundary; critical kinds bypass it.
- **Existing `/account` stays put.** `/settings` **adds** a surface; do not relocate the consent/erasure
  controls in v1 (link to them). Moving them into a "Privacy" tab is a separate, later change.
