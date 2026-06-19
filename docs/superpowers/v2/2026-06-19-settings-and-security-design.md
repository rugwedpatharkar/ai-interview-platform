# Settings & Security — Account self-management — Design

> **v2 "complete" core addition (Part A #1 of the completeness audit).** Read the canonical
> `docs/superpowers/v2/2026-06-19-v2-architecture-overview-design.md` first — esp. §4 module #1
> (Identity & Access, `[built]`), §6 (compliance-ready model), and §7 (data ownership). This is a
> **new account-self-management module** that extends the existing identity stack, not a pillar; it
> closes the audit's #1 core gap ("Account settings & security — notification preferences, 2FA,
> password/email change (re-verify), active-session list + revoke. Today `/account` only has consent
> + erasure"). Its closest sibling is the notifications center
> (`…-notifications-center-design.md`), whose explicitly-deferred per-user preferences this module
> provides. The TDD build is `docs/superpowers/v2/2026-06-19-settings-and-security.md`.
>
> **Status:** design, awaiting review. No production code yet (the v2 build is a later, separately
> green-lit phase). **Local-only project; never run git/gh.**

---

## 1. Goal & scope

Give every authenticated user — candidate **and** company (`company_admin` / `recruiter`) — a single
place to **manage their own account and security**. Today the only self-service surface is the
candidate `/account` page, which holds exactly two things: the **consent ledger** and **right-to-erasure**
(`resources/compliance.py`). There is no way for a user to change their password without the
forgot-password email dance, no way to change their email, no 2FA, no view of their active sessions,
and no control over which notifications reach them. Every one of those is table-stakes for a real
launch (audit Part A #1). This module adds them as a new **`SettingsService`** on admin plus a
candidate/company **`/settings`** page — reusing the existing security primitives (`lib.security`
`TokenService` / `hash_password` / `RefreshSessionStore` / `SingleUseTokenStore`, `lib.redis`
`RateLimiter`) and the `@ip/ui` design system, inventing as little as possible.

**In scope (v1):**

- **Notification preferences** — a per-user `notification_prefs` doc holding per-category channel +
  frequency settings: **in-app always on** (the durable feed is never disableable); **email on/off
  per category**; **SMS opt-in for critical-only**; **digest cadence** (off / daily / weekly); **quiet
  hours** (a local-time window during which non-critical email/SMS is suppressed). This is **read by
  the notifications center's `notify` / `notify_event`** to decide which channels fire — it is the
  preferences gate that spec deferred (`…-notifications-center-design.md` §1 non-goals + §6: "a
  per-user preferences doc gating which `kind`s email vs. in-app-only"). v1 wires the **gate
  contract** (the read seam + defaults); SMS *delivery* itself stays a documented seam (§3.9), since
  the platform has no SMS sender yet.
- **Password change** — the authenticated-user path (distinct from forgot-password): **verify the
  current password → set the new one → revoke all *other* sessions** (keep the caller's current
  session alive so they aren't logged out of the tab they just used). Rate-limited; audited.
- **Email change** — **set a new address → re-verify it via a single-use token emailed to the new
  address → swap on confirm**. The old address stays authoritative until the new one is proven, so a
  typo or a hijack attempt can't strand the account. Audited at request and at swap.
- **2FA (TOTP)** — standard RFC-6238 TOTP **setup / verify / disable**: generate a per-user secret +
  one-time **recovery codes**, confirm with a live code before enabling, and **gate login** when
  enabled (a second-factor step after password). **TOTP only** — no SMS-2FA requirement (SMS is a
  notification channel, not an auth factor here).
- **Active sessions** — **list** the user's live refresh-token sessions (device / IP / last-seen /
  current-session flag) and **revoke one** or **revoke all others**, reusing the existing
  `RefreshSessionStore` (which already does `revoke(jti)` and `revoke_user(user_id)`); v1 **enriches**
  it with per-session metadata so the list has something to show (§3.6).
- **Surfaces** — a candidate **and** company `/settings` page with tabs **Profile/Account**,
  **Security**, **Notifications**, reusing `@ip/ui` (`Tabs`, `Card`, `Input`, `Button`,
  `ConfirmDialog`, `toast`, `Badge`, the violet/dark token system) and `useAuth().api`. A new
  `@ip/shared/settings.ts` client wraps the gRPC-web calls.
- **Robustness:** every sensitive op (password change, email-change request, 2FA verify/disable,
  session revoke) is **rate-limited** via the existing `RateLimiter`, **audited** via the existing
  `AuditLog`, and **validated at the boundary** (passwords, email format, TOTP code shape) — the
  module is a security surface, so it is treated as a contract surface throughout.

**Out of scope / explicit non-goals:**

- **No ID / identity verification, no background/reference checks, no biometric (face/voice)
  factors** — excluded platform-wide (overview §2). 2FA here is a *possession* factor (TOTP app), not
  an *identity* proof.
- **No SMS-2FA** — TOTP is the only second factor (the task is explicit). SMS appears only as a
  *notification* channel for critical alerts (opt-in), and even that is a documented delivery seam
  (§3.9), not a built sender in v1.
- **No new SMS infrastructure built in v1** — `notification_prefs` carries the SMS opt-in flag and the
  notify gate honours it, but the actual SMS send is behind a `Notifier`-style seam (mirroring how
  email is `LoggingNotifier` today → SMTP later). No Twilio/SNS client in this increment.
- **No social-account linking / unlinking** (Google SSO accounts exist via `oauth_login`, but managing
  linked providers is a clean follow-up, not v1).
- **No org/team management** — seat management, the RBAC matrix, per-job scoping are a **separate**
  Part A #2 module (`…-team-and-permissions-design.md`); this module is strictly *self*-management of
  one's own account. The Profile/Account tab links to profile editing (candidate) but does not own it.
- **No WebAuthn / passkeys** — a strong future second factor, but TOTP is the v1 standard; the 2FA
  model leaves room for an additional method later (§6).
- **No password-strength meter as a gate** — a min-length boundary check only (the existing register
  path's policy), with a client-side strength hint; we don't block on entropy heuristics in v1.

---

## 2. Where it fits

```
   Candidate app ─┐   gRPC-web (authed)        ┌────────────────────────────────────────────┐
   (/settings)    ├──────────────────────────►│  ADMIN  (owns MongoDB, source of truth)      │
   Company app ───┘   change pw / email /       │  • SettingsService (NEW servicer)           │
                      2FA / sessions / prefs     │    ChangePassword / RequestEmailChange /     │
                  ◄────────────────────────────│    ConfirmEmailChange / StartTotp / VerifyTotp│
                                                │    / DisableTotp / ListSessions / RevokeSession
                                                │    / RevokeOtherSessions / Get|UpdateNotificationPrefs
                                                │  resources/settings.py  ─────────────────────┤
                                                │   self-scoped (identity["id"]); reuses        │
                                                │   lib.security (TokenService/hash/sessions),  │
                                                │   lib.redis.RateLimiter, AuditLog, Notifier   │
                                                └───────┬───────────────────────┬───────────────┘
                                                        │ Mongo                 │ Redis
                                                        ▼                       ▼
                              users (+ totp_secret, recovery hashes, pending_email),     refresh:* sessions
                              notification_prefs (per user)                              (+ per-jti meta hash)
                                                        │
   login (existing AuthService) ──gated when 2FA on──► resources/settings.verify_totp_login (2nd factor)
   notifications center notify/notify_event ──reads──► resources/settings.channels_for(user_id, kind)
```

- **admin owns it all.** Every setting is a self-service write on data admin already owns (the `users`
  doc, a new `notification_prefs` collection, the Redis refresh-session store). The browser reaches
  `SettingsService` over the **existing in-process gRPC-web transport** (uvicorn, no proxy) — the same
  surface as `AuthService` / `DecisionService`. **No new service**; settings is a new *capability* on
  admin: one servicer, one resource module, one new model + repository, plus small extensions to the
  `users` model and `RefreshSessionStore`.
- **The resource layer is the contract** (the established convention — `resources/auth.py`,
  `resources/decision.py`, `resources/compliance.py`). All scoping, validation, rate-limiting, audit,
  session bookkeeping, and DTO shaping live in `resources/settings.py`; the servicer is a thin
  adapter (`caller_identity` → resource → proto, `_STATUS` error mapping). **No logic in the servicer.**
- **Self-scoped, always.** Every RPC acts on **`identity["id"]`** (the authenticated caller) — there
  is no admin-acting-on-another-user surface here (that is the team module). This collapses authz to
  "the token *is* the authorization", exactly as `resources/compliance.py` does for consent/erasure
  ("the caller acts on their own data"). No new authz primitive.
- **It reuses two existing seams rather than forking them:**
  - **Login gating** plugs into the existing `AuthService.Login` path (`resources/auth.login`): when a
    user has 2FA enabled, the password step returns a **short-lived `mfa_pending` challenge** instead
    of tokens, and a new `VerifyTotpLogin` completes the login. The token mint, refresh-session
    `allow`, and audit are **unchanged** — only a gate is inserted before them (§3.5).
  - **The notifications channel decision** plugs into the notifications center: `notify` / `notify_event`
    call `settings.channels_for(user_id, kind)` (a pure read) to decide *email yes/no, sms yes/no*
    before sending — the center already owns the in-app row (always written) and the email seam; this
    module supplies the *gate* it was designed to accept (§3.9).

---

## 3. Design

### 3.1 Data model

One **new collection** (`notification_prefs`) plus **additive fields** on the existing `users` doc.
New Pydantic models in `src/admin/app/model/settings.py`; `users` fields extend
`src/admin/app/model/auth.py`.

**`users` (extended — additive, all optional/defaulted so existing rows are valid):**

| Field | Type | Notes |
|---|---|---|
| `totp_secret` | `str \| None` | The base32 TOTP shared secret, **encrypted at rest** (§3.4). `None` until 2FA setup is confirmed; presence of a *confirmed* secret means 2FA is enabled (gated by `totp_enabled`). |
| `totp_enabled` | `bool` (default `False`) | True only after a setup code is verified. Login gates on this, not on `totp_secret is not None`, so a half-finished setup never locks anyone out. |
| `recovery_codes` | `list[str]` (default `[]`) | **Hashed** recovery codes (each `hash_password`-hashed, same as a password — never stored plaintext). Each is single-use: consuming one removes it. |
| `pending_email` | `str \| None` | The not-yet-verified new email during an email change; the live `email` stays authoritative until `ConfirmEmailChange` swaps it. `None` normally. |

> **Why these live on `users`, not a side collection.** They are 1:1 with the user, read on the auth
> hot path (login must know `totp_enabled`), and are identifying security material — keeping them on
> the user doc means the login lookup already has them (no extra read) and the existing
> `CandidateEraser.anonymize` / account lifecycle naturally covers them (§3.8). This mirrors how
> `email_verified` and `password_hash` already live on `users`.

**`NotificationPrefs` (`model/settings.py`) — one per user, lazily created with safe defaults:**

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | — |
| `user_id` | `str` | **Owner.** Unique. Every read/write scoped to `identity["id"]`. |
| `email_categories` | `dict[str, bool]` | Per-category email opt-in, keyed by notification **category** (a coarse grouping over `_MESSAGES` kinds — `application_updates`, `messages`, `assessments`, `practice`; see §3.9). Default: all `True` (current behaviour = email everything). |
| `sms_critical` | `bool` (default `False`) | Opt-**in** to SMS for critical-only alerts (e.g. a security event, an interview-imminent reminder). Off by default (opt-in, GDPR/TCPA-friendly). |
| `digest` | `"off" \| "daily" \| "weekly"` (default `"off"`) | Roll non-urgent emails into a digest at this cadence instead of sending each immediately (§3.9 — v1 stores + honours the *gate*; the digest *batcher* is a documented scheduler follow-up). |
| `quiet_hours` | `QuietHours \| None` | `{ start: "22:00", end: "07:00", tz: "Europe/London" }` — during this local window, non-critical email/SMS is suppressed (critical still sends). `None` = no quiet hours. |
| `updated_at` | `datetime` | `default_factory` now; stamped on every update. |

`in_app` is intentionally **not a field** — the durable in-app feed is **always on** (it's the
no-ghosting guarantee's backbone; a user can't silence the record of what happened to their
application). Preferences only gate the *additive* channels (email, SMS) and *cadence* (digest, quiet
hours).

**Category, not raw kind.** Users choose at the **category** granularity (4 toggles), not per
`_MESSAGES` kind (a dozen-plus) — fewer, clearer choices, and new kinds inherit their category's
setting without a migration. The `kind → category` map is a small constant in `resources/settings.py`
(§3.9), the single place that knows the grouping.

### 3.2 Self-scoping — why the token *is* the authorization

Every settings operation acts on the caller's own account, so authorization is simply "resolve the
caller from the token, act on **their** `user_id`" — the exact pattern `resources/compliance.py`
uses (`identity["id"]` for consent + erasure). There is **no** target-user parameter on any RPC; the
servicer never accepts a `user_id` from the client. Concretely:

- `caller_identity(context, tokens)` (the shared route helper) yields `{id, role, comp_id}` from the
  validated access token; an absent/expired token aborts `UNAUTHENTICATED` (so the FE transport
  refreshes-and-retries) — unchanged, reused verbatim from `routes/auth.py`.
- Each resource function takes `identity` and uses `identity["id"]` as the subject. A caller can only
  ever read/mutate their own `users` row, their own `notification_prefs`, and their own refresh
  sessions. **There is no cross-user surface to misuse** — which is precisely why this module is
  self-management only and team-admin actions live elsewhere.
- `comp_id` is **not** an authz axis here (a recruiter changing their own password doesn't involve a
  tenant boundary) — but security-event audit rows still carry `comp_id` when the caller has one, so a
  company can see "a user in my org changed their 2FA" in the audit trail (read-only, via the existing
  audit surface; this module doesn't add a company-facing security console in v1).

### 3.3 Password change (verify → set → revoke others)

`resources/settings.change_password(identity, current_password, new_password, *, users, sessions,
limiter, audit, current_jti)`:

1. **Rate-limit** (`limiter.hit(f"pwchange:{identity['id']}", PWCHANGE_LIMIT, PWCHANGE_WINDOW)`) — a
   failed-current-password guess must not be unlimited. Over budget → `RateLimitedError`.
2. **Validate** `new_password` at the boundary (min length, the same policy the register path uses) →
   `ValidationError` on failure.
3. **Verify the current password**: `users.get(identity["id"])` → `verify_password(current_password,
   user["password_hash"])`. Mismatch → `InvalidCredentialsError` (and the rate-limit hit already
   counted). **An SSO-only account** (`password_hash == ""`) cannot "change" a password it never had →
   `ValidationError("set a password via reset first")` (honest: it routes them to the reset flow).
4. **Set** the new hash: `users.update(id, {"password_hash": hash_password(new_password)})`.
5. **Revoke all *other* sessions** but keep the current one: `sessions.revoke_user(id)` clears every
   refresh jti, then **re-issue the caller's current session** so the tab they're on stays logged in
   (the FE already holds a valid access token; a fresh refresh jti is `allow`-ed for `current_jti`'s
   replacement). *Rationale:* a password change should boot every *other* device (the security point)
   without rage-logging-out the user who just did it. (Implementation detail: the simplest correct
   form is `revoke_user` then `allow` a new jti for the caller and return it; §6 notes the
   keep-current nuance to confirm at planning.)
6. **Audit**: `AuditLog(entity="user", entity_id=id, action="password_changed", comp_id=...)`.

This is the authenticated sibling of `resources/auth.reset_password` (which does verify-token → hash →
`revoke_user`); the difference is it verifies the **current password** instead of a reset token, and
it keeps the caller's session.

### 3.4 2FA (TOTP) — setup, verify, disable

Standard RFC-6238 TOTP, implemented with the `pyotp` library (pure, offline, no network — fits the
offline test gate) behind a tiny **`TotpProvider` Protocol** so tests inject a deterministic fake
(no wall-clock flakiness in the gate):

```python
class TotpProvider(Protocol):
    def generate_secret(self) -> str: ...
    def provisioning_uri(self, secret: str, account: str) -> str: ...   # otpauth:// for the QR
    def verify(self, secret: str, code: str, *, valid_window: int = 1) -> bool: ...
```

- **`StartTotp`** (`settings.start_totp(identity, *, users, totp, crypto)`): generate a fresh secret,
  store it **encrypted** (`crypto.encrypt(secret)`) on `users.totp_secret` with `totp_enabled=False`,
  and return the **provisioning URI** (for the authenticator-app QR) + the raw secret (for manual
  entry) **once**. The secret is *staged* — not yet enabling 2FA — so a user who abandons setup is
  never locked out (login gates on `totp_enabled`).
- **`VerifyTotp`** (`settings.verify_totp(identity, code, *, users, totp, crypto, audit)`): decrypt the
  staged secret, `totp.verify(secret, code)`; on success set `totp_enabled=True`, **generate N=10
  recovery codes**, store them **hashed** (`hash_password` each), and return the **plaintext recovery
  codes once** (the only time they're shown — the user must save them). Rate-limited
  (`mfa:{id}`) so the 6-digit code can't be brute-forced. Audited (`totp_enabled`).
- **`DisableTotp`** (`settings.disable_totp(identity, code_or_recovery, *, users, totp, crypto,
  limiter, audit)`): **require a fresh TOTP code *or* a recovery code** to disable (disabling is a
  security-sensitive op — you must prove possession, not just be logged in), then clear `totp_secret`,
  `totp_enabled=False`, `recovery_codes=[]`. Rate-limited; audited (`totp_disabled`).

**Secret encryption at rest (`crypto`).** The TOTP secret is a bearer credential — anyone with it can
mint valid codes — so it is **encrypted at rest**, not stored plaintext, behind a `SecretBox`-style
seam (`lib.security` extension or a thin wrapper over `cryptography.fernet`) keyed by an app secret
from config (the same config seam that holds the JWT secret). Recovery codes are **hashed** (not
encrypted) because they're only ever *compared*, never *re-read* — exactly like a password. This split
(encrypt the thing you must reproduce, hash the thing you only compare) is the standard, and is
called out so a reviewer doesn't ask "why not hash the secret too" (you can't TOTP-verify against a
hash).

### 3.5 Login gating when 2FA is enabled

The existing `AuthService.Login` path mints tokens directly after a correct password. With 2FA, a
**gate** is inserted **after** the password check and **before** the token mint — the token mint,
`sessions.allow`, and the login audit are otherwise **unchanged**:

- `resources/auth.login` (or a thin wrapper it delegates to) checks `user["totp_enabled"]` after
  `verify_password` succeeds:
  - **2FA off** → behaves exactly as today (mint access+refresh, `allow` the session, audit `login`).
  - **2FA on** → instead of tokens, return an **`mfa_required` challenge**: a short-lived,
    single-purpose **`mfa` token** (a new `TokenService` purpose, ~5 min, carrying `sub` + a nonce
    registered in `SingleUseTokenStore`) — **not** an access/refresh token. The FE shows the
    "enter your 6-digit code" step.
- **`VerifyTotpLogin`** (`settings.verify_totp_login(mfa_token, code, *, users, tokens, sessions,
  nonces, limiter, refresh_ttl_seconds, audit)`): consume the `mfa` nonce (single-use, anti-replay),
  decode the `mfa` token → `sub`, `totp.verify` the code **or** accept+consume a recovery code, then
  **mint the real tokens exactly as `login` does** (`access_token` + `refresh_token`, `sessions.allow`,
  audit `login` with a `mfa=true` marker). Rate-limited per `sub`.
- **Why a separate `mfa` token, not "trust me, password was right":** the second factor must be bound
  to *that* password success and *time-boxed*, and it must not be a usable session by itself. A
  dedicated short-lived single-use token is the minimal correct carrier — it reuses `TokenService`
  (just a new `purpose`) and `SingleUseTokenStore` (anti-replay), no new mechanism.

The whole gate is **additive**: with 2FA off, `Login` is byte-for-byte the current behaviour, so the
1700-line auth suite stays green; the gate only branches when `totp_enabled` is true.

### 3.6 Active sessions — enriching `RefreshSessionStore`

`RefreshSessionStore` (`lib/security/sessions.py`) already tracks active refresh jtis in a per-user
Redis SET and exposes `allow(user_id, jti, ttl)`, `is_active(jti)`, `revoke(jti)`,
`revoke_user(user_id)`. What it **doesn't** store is any **per-session metadata** — so today there's
nothing to *show* in a "your devices" list. v1 **enriches the existing store** (no parallel store):

- **`allow_meta(user_id, jti, ttl, *, meta)`** — a superset of `allow` that, alongside the existing
  jti-key + user-SET membership, writes a small **per-jti metadata hash** (`refresh:meta:{jti}` →
  `{ip, user_agent, created_at, last_seen_at}`) with the **same TTL** as the session (so metadata
  expires exactly when the session does — no orphans, no unbounded growth). `login` /
  `verify_totp_login` / `refresh` call `allow_meta` with the request's IP + User-Agent (sourced in the
  servicer from gRPC metadata, the same place `_client_ip` reads the peer).
- **`touch(jti)`** — on each `refresh`, update `last_seen_at` (and `ip`/`user_agent` if changed),
  so "last seen" is meaningful. Cheap (`HSET` on an existing key).
- **`list_for_user(user_id)`** — return the metadata for every *active* jti in the user's SET
  (skipping any whose meta key has expired — the SET is the authority for "active", meta is
  best-effort decoration). This is what `ListSessions` renders.
- **Revoke** reuses the existing `revoke(jti)` (one session) and `revoke_user(user_id)` (all) — and
  `RevokeOtherSessions` is `revoke_user` then re-`allow_meta` the caller's current jti (the same
  keep-current move as password change, §3.3).

**Identifying the current session.** The access token doesn't carry the refresh jti, so the FE can't
trivially say "this row is me". v1 resolves it by having the resource mark the row whose **`ip` +
`user_agent` match the current request** as `current: true` (best-effort, advisory — it only drives a
"This device" badge and disables its individual revoke button so a user doesn't accidentally kill
their own session mid-list; **revoke-all-others is the safe bulk action**). A more exact binding
(thread the refresh jti into the access token, or a session-id claim) is noted as a §6 open item — the
advisory match is sufficient for the v1 UX and avoids a token-shape change.

> **Honest tradeoff (a key decision, §4):** the metadata (IP, User-Agent) is **decoration on an
> advisory store**, not a security boundary. The *authority* for "is this session valid" remains the
> jti-in-SET membership (`is_active`), unchanged; if a meta key is lost (Redis eviction edge), the
> session still works and simply shows less detail. We never gate auth on the metadata.

### 3.7 Email change (set new → re-verify → swap)

`resources/settings` splits email change into two audited steps, so the live email is never replaced
by an unproven address:

- **`RequestEmailChange`** (`settings.request_email_change(identity, new_email, *, users, tokens,
  notifier, nonces, limiter, audit)`): rate-limit; normalize + validate `new_email` (`strip().lower()`,
  `EmailStr`); reject if it's already registered to **another** user (`users.get_by_email` →
  `ConflictError`, the same uniqueness guard registration uses); store it as **`pending_email`** on the
  caller's row (the live `email` is untouched); mint a **verification token** for the *new* address
  (reuse `TokenService.verification_token` + register the nonce in `SingleUseTokenStore`, exactly as
  registration's `_send_verification` does) and **email the link to the new address**. Audit
  `email_change_requested`. — This proves the user controls the new mailbox before anything swaps.
- **`ConfirmEmailChange`** (`settings.confirm_email_change(token, *, users, tokens, nonces, sessions,
  audit)`): decode the token (purpose `email_verify`), consume the single-use nonce (anti-replay),
  load the user, verify `pending_email` is still set + still unique, then **atomically swap**:
  `email = pending_email`, `pending_email = None`, `email_verified = True`. Audit
  `email_changed`. Optionally revoke other sessions (an email change is account-sensitive) — confirm
  at planning (§6); the safe default is to **revoke others** like a password change, since email is a
  recovery channel.

This mirrors the existing **`verify_email`** flow (token → nonce-consume → `set_email_verified`) but
targets `pending_email` and swaps it in. Reusing the same token purpose + nonce store means no new
token machinery — the only new piece is the `pending_email` staging field.

### 3.8 Erasure cascade entry (Inc 0)

The new artifacts hold identifying / security material, so they **join the `CandidateEraser`
cascade** (overview §6: "Extend `CandidateEraser` to every new artifact"):

- **`notification_prefs`** is `user_id`-keyed PII-adjacent state → `notifications_prefs.delete_by_user(
  user_id)` in `erase`, mirroring `consents.delete_by_user` (the exact precedent for a user-id-keyed
  store). Add the repo to `CandidateEraser.__init__` + `make_eraser`.
- **The `users` security fields** (`totp_secret`, `recovery_codes`, `pending_email`) are cleared by
  the existing **`users.anonymize(user_id)`** step — extend `anonymize` to null them alongside the
  email/password it already scrubs (so an erased account carries no residual secret). No new cascade
  step; just widen what `anonymize` zeroes.
- **Active sessions** are already covered: erasure should `revoke_user(user_id)` so an erased user's
  refresh sessions (and now their meta hashes, which share the TTL) are gone — add `sessions.revoke_user`
  to `erase` if not already present (it is the correct security posture for erasure regardless).

The Inc-0 stub registers `notification_prefs` in the cascade from day one (overview §8: "makes new
artifacts erasable from day one"); this module fills in the repository + the `anonymize` widening.

### 3.9 Notification preferences as the channel gate (the notifications-center seam)

This is the **integration that makes prefs meaningful**: the notifications center
(`…-notifications-center-design.md`) writes the **always-on in-app row** and then decides whether to
*also* email (and, later, SMS). v1 of the center "sends both for every notifiable event" and
**explicitly defers** the preferences gate to "a preferences doc gating which `kind`s email vs.
in-app-only" (its §1 non-goals + §6). **This module is that doc**, and it supplies the gate the center
calls:

```python
# resources/settings.py — the single channel-decision the center consumes
KIND_CATEGORY: dict[str, str] = {       # the one place that groups kinds → categories
    "interview_pending": "application_updates", "shortlisted": "application_updates",
    "hired": "application_updates", "rejected": "application_updates",
    "gated_out": "application_updates", "aptitude_pending": "application_updates",
    "assessment_review": "assessments", "assessment_ready": "assessments",
    "new_message": "messages", "practice_complete": "practice",
}
CRITICAL_KINDS = {"new_message"}  # + any future security/interview-imminent kinds — SMS-eligible

async def channels_for(user_id, kind, *, prefs, clock=_utcnow) -> ChannelDecision:
    """Pure read: given a recipient + notification kind, return which ADDITIVE channels
    fire. In-app is always on and is NOT decided here (the center always writes the row)."""
    p = await prefs.get_or_default(user_id)         # safe defaults if no doc yet
    category = KIND_CATEGORY.get(kind, "application_updates")
    in_quiet = _in_quiet_hours(p.quiet_hours, clock())  # local-time window check
    critical = kind in CRITICAL_KINDS
    email = p.email_categories.get(category, True) and (critical or not in_quiet) and p.digest == "off"
    sms = p.sms_critical and critical                    # SMS only ever for critical, only if opted in
    return ChannelDecision(email=email, sms=sms, in_app=True)
```

- **The center calls `channels_for` inside `_emit`** (the shared write helper) **after** it has written
  the durable row: if `decision.email` → send via the existing `Notifier` seam; if `decision.sms` →
  send via the **SMS seam** (§ below). The in-app row is **already written** regardless — prefs never
  suppress the durable feed. This is a *small, additive* call at one chokepoint, exactly the seam the
  center anticipated.
- **`digest != "off"`** suppresses the immediate email (the event still lands in-app); a **digest
  batcher** (a scheduled job that rolls the period's in-app rows into one email) is a documented
  **scheduler follow-up** — v1 stores + honours the gate (no immediate email when a digest is chosen)
  but does not build the batcher. Flagged so a reviewer doesn't expect daily-digest emails to actually
  arrive in v1 (they're correctly *not* sent immediately; the rollup job is the follow-up).
- **Quiet hours** suppress **non-critical** email/SMS during the local window (critical always sends);
  the window check is a pure local-time comparison using the stored `tz` (UTC discipline: compare the
  current UTC instant against the window resolved in the user's tz — the one place tz math lives).
- **SMS delivery seam.** `notification_prefs.sms_critical` + `CRITICAL_KINDS` decide *whether* SMS
  *should* fire; the *actual send* is behind an **`SmsSender` Protocol** mirroring the email `Notifier`
  (a `LoggingSmsSender` in v1 that logs the would-be SMS, swappable for Twilio/SNS later as a pure
  wiring change). So v1 **fully wires the opt-in + the gate + the seam**, and a real SMS provider is a
  one-class swap — no SMS infra is built, but nothing is hard-coded against not having it. (This keeps
  the offline test gate clean: `LoggingSmsSender` has no network.)

**Why the gate lives here, not in the center.** The center owns *what happened* (the message source +
the durable row); this module owns *the user's preference about reaching them*. Putting `channels_for`
in `resources/settings.py` keeps the preference logic with the preference data (one owner), and the
center depends on a tiny pure function it can call best-effort — the same shape as every other
best-effort notify hop. If `channels_for` ever errored, the center's existing best-effort wrap means
the row is still written and the operation still succeeds; the safe fallback is "email per the
defaults" (fail-open to the current behaviour, never fail-closed into silence — silence is the
anti-goal).

### 3.10 Robustness — rate-limits, audit, boundary validation (the security posture)

Because this is a security surface, the cross-cutting robustness rules are first-class, not optional:

- **Rate-limits (reuse `lib.redis.RateLimiter`)** — a **consolidated table** of the sensitive ops, all
  per-user (and the limiter is the same primitive `resources/auth` uses for login):

  | Op | Key | Why |
  |---|---|---|
  | `ChangePassword` | `pwchange:{user_id}` | Throttle current-password guessing. |
  | `RequestEmailChange` | `emailchange:{user_id}` | Throttle verification-email spam to a new address. |
  | `VerifyTotp` / `VerifyTotpLogin` / `DisableTotp` | `mfa:{user_id}` (or `mfa:{sub}` at login) | A 6-digit code is brute-forceable — the rate-limit is the primary control alongside TOTP's time window. |
  | `RevokeSession` / `RevokeOtherSessions` | `sessions:{user_id}` | Cheap, but bounded so the op can't be abused as a logout-amplification. |

  Over budget → `RateLimitedError(retry_after)` → the servicer maps it to `RESOURCE_EXHAUSTED` with an
  **opaque** message (no detail leak), exactly as the login path does today.
- **Audit (reuse `AuditLog` + the existing audit repo)** — every state-changing security op writes an
  immutable audit row: `password_changed`, `email_change_requested`, `email_changed`, `totp_enabled`,
  `totp_disabled`, `session_revoked`, `sessions_revoked_all`, `notification_prefs_updated`. Entity is
  `"user"`, `entity_id = user_id`, `comp_id` carried when present — so the existing audit surface shows
  a complete security timeline per user with no new audit machinery.
- **Boundary validation** — passwords (min length, the register policy), emails (`EmailStr` +
  normalize), TOTP codes (6-digit numeric shape before `verify`), recovery codes (expected format),
  `digest` enum, `quiet_hours` time format + a real IANA tz. All raise `ValidationError` →
  `INVALID_ARGUMENT`. The boundary **is** the contract surface — every field a client sends is
  validated; internal typed calls between resource and repo are trusted (no defensive re-coercion),
  per the house rules.
- **No detail leak on failure** — a wrong current password, a non-existent target, a bad TOTP code all
  return the *category* of error (`UNAUTHENTICATED` / `INVALID_ARGUMENT` / `RESOURCE_EXHAUSTED`)
  without revealing which precise check failed where it would aid an attacker (e.g. email-change
  uniqueness uses the same `ConflictError` the register path does — it doesn't enumerate accounts
  beyond what registration already does).

### 3.11 Surfaces — the `/settings` page (tabs) reusing `@ip/ui`

Both apps get a `/settings` route, behind the existing auth guard (`useRequireAuth`), rendering a
3-tab layout with the existing `@ip/ui` `Tabs` component (already used by the company applicant/jobs
pages):

- **Profile / Account tab** — basic identity (email, with a **"Change email"** action opening the
  request-email-change flow; verified badge), a **"Change password"** action (a `ConfirmDialog` / form
  with current + new + confirm fields), and — candidate only — a link to the existing `/profile`
  editor (this tab does **not** own profile fields; it links out). Company users see their role +
  company (read-only here; org management is the team module).
- **Security tab** — **2FA** (status badge; a "Set up 2FA" flow showing the QR from the provisioning
  URI + a code-entry confirm + the one-time recovery-code reveal; a "Disable 2FA" action requiring a
  code) and **Active sessions** (a list of device/IP/last-seen rows from `ListSessions`, the current
  one badged "This device" with its individual revoke disabled, plus a **"Sign out other sessions"**
  bulk button → `RevokeOtherSessions`).
- **Notifications tab** — the `notification_prefs` editor: per-category email toggles, the SMS-critical
  opt-in, the digest cadence (off/daily/weekly radio), and quiet-hours (start/end/tz). Saves via
  `UpdateNotificationPrefs`; optimistic toggle with `invalidateQueries` reconcile, `toast` on
  success/error — the same TanStack mutation pattern the existing `/account` consent page uses.

All of it reuses `@ip/ui` primitives (`Card`, `Input`, `Button`, `Badge`, `ConfirmDialog`, `Tabs`,
`toast`, `LoadingState`/`ErrorState`/`EmptyState`, the violet/dark tokens) and `useAuth().api` via a
new `@ip/shared/settings.ts` client. Lucide icons (`Shield`, `KeyRound`, `Mail`, `Bell`, `Smartphone`,
`Monitor`) are imported **in the app** (never re-exported through `@ip/ui` — the lucide-must-be-in-app
gotcha from the frontend design-system memo). QR rendering uses the provisioning URI string from the
backend with a small client-side QR component (a tiny dependency, or render the `otpauth://` URI as
text + a copyable secret for manual entry if a QR lib is undesirable — confirm at planning).

The existing candidate `/account` page (consent + erasure) **stays as-is**; `/settings` is the new
account-management home, and the Profile/Account tab can link to `/account` for the privacy controls
(or those can later fold into a "Privacy" tab — out of scope to move them in v1; we add, we don't
relocate existing surfaces).

---

## 4. Key decisions & tradeoffs

| Decision | Rationale | Tradeoff / mitigation |
|---|---|---|
| **One `SettingsService` on admin (no new service)** | Every setting is a self-write on admin-owned data; admin already serves authed unary gRPC-web | More RPCs on admin; mitigated by one thin servicer over one resource module (the established convention) |
| **Self-scoped: the token *is* the authz (no target-user param)** | Mirrors `compliance.py` (consent/erasure act on `identity["id"]`); collapses authz to caller-resolution, no new primitive | No admin-acts-on-user surface here — that's deliberately the separate team module |
| **2FA = TOTP only (no SMS-2FA)** | Task-mandated; TOTP is the offline-testable, infra-free standard; SMS is a notify channel, not an auth factor | No SMS fallback factor; recovery codes are the account-recovery path; WdAuthn/passkeys left as a §6 extension point |
| **Stage the TOTP secret, gate login on `totp_enabled`** | A half-finished setup must never lock a user out | Two fields (`totp_secret` staged + `totp_enabled`) instead of one; trivially worth the safety |
| **Encrypt the TOTP secret, hash recovery codes** | The secret must be *reproduced* to verify (→ encrypt); recovery codes are only *compared* (→ hash, like a password) | Adds a `crypto`/`SecretBox` seam keyed by an app secret; standard, and isolated behind a Protocol |
| **Login gating is additive (branch only when 2FA on)** | With 2FA off, `Login` is byte-for-byte today's behaviour → the large auth suite stays green | A new short-lived `mfa` token purpose + a `VerifyTotpLogin` RPC; both reuse `TokenService` + `SingleUseTokenStore`, no new mechanism |
| **Enrich the existing `RefreshSessionStore` (no parallel session store)** | `revoke`/`revoke_user` already exist; only metadata was missing | Meta is **advisory decoration** (IP/UA), shares the session TTL; the jti-in-SET stays the auth authority — never gate on meta |
| **"Current session" identified by IP+UA match (advisory)** | The access token doesn't carry the refresh jti; an advisory match is enough to badge "This device" + protect the bulk action | Imperfect on shared NAT/identical UA; **revoke-all-others is the safe bulk action**; an exact session-id claim is a §6 follow-up |
| **Email change is two-step (stage `pending_email` → verify new → swap)** | The live email is a recovery channel; never replace it with an unproven address | One staging field; reuses the existing verify-token + nonce flow, so no new token machinery |
| **Notification prefs gate the center via a pure `channels_for` read** | Puts preference logic with preference data; the center already anticipated this exact gate seam | The center takes one best-effort dependency; **fail-open to defaults** (never fail-closed into silence — silence is the anti-goal) |
| **Category-level prefs (4 toggles), not per-kind** | Fewer, clearer user choices; new kinds inherit a category with no migration | Less granular than per-kind; the `KIND_CATEGORY` map is the single place to re-group |
| **In-app feed is always on (not a pref)** | The no-ghosting guarantee depends on the durable record; a user can't silence what happened to their application | Users can't fully mute in-app; correct — prefs gate only the *additive* channels (email/SMS) + cadence |
| **SMS = opt-in flag + gate + `SmsSender` seam, no provider built** | Wires the whole decision path offline; a real provider is a one-class swap | No SMS actually delivered in v1 (`LoggingSmsSender` logs it); flagged, mirrors email's LoggingNotifier→SMTP path |
| **Digest gate honoured, batcher deferred** | Choosing a digest correctly suppresses the immediate email now | Digest emails don't actually arrive in v1 (the rollup scheduler is the follow-up); flagged so it's not read as a bug |

---

## 5. Testing approach

TDD throughout (failing test watched fail → implement → green), per PRODUCTION_STANDARDS §2. The gate
is `bash scripts/check.sh` (ruff format, lint+security S-rules line-88, pip-audit, pytest ×5);
**baseline 423 tests** must stay green and grow. Frontend verified by `npx pnpm@9.15.0 --filter
@ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck`
(never `next build` while `pnpm dev` is live). All security logic is pure-Python over injected
collaborators (repos, `TokenService`, a fake `TotpProvider`, a fake `crypto`, a fake `RateLimiter`,
the `LoggingNotifier`/`LoggingSmsSender` sinks) — **fully unit-tested offline, no network in the gate**.

- **Resource layer (`resources/settings.py`) — where most coverage lands (it is the contract):**
  - **Self-scoping:** every op acts on `identity["id"]`; there is no target-user param to abuse
    (assert the servicer never reads a client `user_id`).
  - **Password change:** wrong current password → `InvalidCredentialsError` (+ a rate-limit hit
    counted); too-short new password → `ValidationError`; success updates the hash, **revokes other
    sessions but keeps the caller's**, and audits `password_changed`; an SSO-only account
    (`password_hash == ""`) → `ValidationError` routing to reset.
  - **2FA:** `start_totp` stages an **encrypted** secret with `totp_enabled=False` and returns the URI;
    `verify_totp` with a good code enables 2FA + returns N recovery codes (and stores them **hashed**);
    a bad code → no enable (+ rate-limit hit); `disable_totp` requires a valid code **or** recovery
    code, then clears the secret + codes; all audited.
  - **Login gating:** `login` with `totp_enabled=False` is **unchanged** (mints tokens — assert the
    existing behaviour); with `totp_enabled=True` it returns an `mfa_required` challenge (a single-use
    `mfa` token), **not** tokens; `verify_totp_login` with a good code (or recovery code) mints the
    real tokens + `allow`s the session + audits `login`; a replayed `mfa` token → rejected
    (nonce consumed); brute-forcing the code is rate-limited.
  - **Active sessions:** `allow_meta` writes the per-jti meta hash with the session TTL; `list_for_user`
    returns one row per active jti with device/ip/last-seen and marks the IP+UA match `current=true`;
    `revoke_session` kills one (404 if not the caller's jti); `revoke_other_sessions` kills all but the
    caller's; a lost meta key still lists the session (degraded detail, still active — meta is
    advisory).
  - **Email change:** `request_email_change` stages `pending_email` (live email untouched), rejects a
    new email already taken (`ConflictError`), emails the new address, audits; `confirm_email_change`
    consumes the nonce, swaps `email`/clears `pending_email`/sets `email_verified=True`, audits; a
    replayed token → rejected.
  - **Notification prefs:** `get_or_default` returns safe defaults (email-all-on, sms-off,
    digest-off, no quiet hours) when no doc exists; `update` validates the `digest` enum + quiet-hours
    format + tz and stamps `updated_at`; `channels_for` returns the correct additive-channel decision
    per kind/category (email gated by category + quiet-hours + digest; SMS only for critical + opt-in;
    **in-app always true**); quiet-hours suppress non-critical but **not** critical; a `channels_for`
    error **fails open to defaults** (assert email still fires per defaults, never silence).
  - **DTO subset:** the listed session/prefs/2FA-status shapes carry **no secrets** — `totp_secret`,
    recovery-code hashes, and password hashes are **never** in any DTO (a grep-style test asserts the
    secret never leaves except the one-time setup reveal).
  - **Rate-limit table:** each sensitive op hits its key; over budget → `RateLimitedError`.
- **gRPC servicer (`routes/settings.py`):** mirror the decision/aptitude servicer tests — `_STATUS`
  mapping (Invalid→INVALID_ARGUMENT, InvalidCredentials→UNAUTHENTICATED, Conflict→ALREADY_EXISTS,
  RateLimited→RESOURCE_EXHAUSTED, NotFound→NOT_FOUND), `caller_identity` enforced (no token →
  UNAUTHENTICATED), **no authz/validation logic in the adapter**, IP+UA sourced from gRPC metadata.
- **Notifications-center integration (cross-spec):** the center's `_emit` calls `channels_for` and
  **honours it** — email is skipped when the category is off / quiet hours / digest, the **in-app row
  is still written** in every case, and a `channels_for` failure doesn't break the center's send (its
  existing best-effort wrap). (Asserted in the center's suite, cross-referenced here.)
- **Erasure cascade (Inc 0):** `CandidateEraser.erase` deletes the user's `notification_prefs`,
  `anonymize` nulls `totp_secret`/`recovery_codes`/`pending_email`, and `revoke_user` clears their
  sessions — while applications/audit survive.
- **Frontend:** `@ip/shared/settings.ts` typechecks; a fake transport drives each tab (password-change
  success/error toast; 2FA setup reveals the QR + recovery codes once; session list renders + revoke;
  prefs toggle optimistic-then-reconcile). No network in unit tests.
- **Manual / local E2E (Chrome via preview):** a user enables 2FA (scans the QR, enters a code, saves
  recovery codes) → logs out → login now asks for the code → enters it → in; changes their password →
  other sessions drop, current stays; requests an email change → the verification link lands in the
  `LoggingNotifier` sink → confirms → email swaps; toggles "email me about messages" off → a new
  message produces an in-app row but **no** email in the sink; the session list shows the current
  device badged.

---

## Resolved gaps (completeness audit 2026-06-19)

This module closes audit **Part A #1 (core)** — "Account settings & security" — and folds in the
relevant cross-cutting Part A items (#4 rate-limiting on sensitive ops) for its own surface. It also
fulfils the notifications-center spec's deferred preferences gate.

- **Account settings & security (Part A #1) — RESOLVED (this whole spec).** Notification preferences
  (§3.1/§3.9), password change (§3.3), email change with re-verify (§3.7), 2FA TOTP setup/verify/
  disable + login gate (§3.4/§3.5), and an active-session list + revoke-one/revoke-all (§3.6) — all
  self-scoped on admin, reusing the existing security primitives.
- **Notification preferences gate (notifications-center deferral) — RESOLVED (§3.9).** The center's
  explicitly-deferred "per-user preferences doc gating which `kind`s email vs. in-app-only" is provided
  as `channels_for(user_id, kind)`, a pure read the center calls inside `_emit` after writing the
  always-on in-app row. In-app is never gated; email/SMS/digest/quiet-hours are. Fail-open to defaults.
- **Rate-limiting sensitive ops (Part A #4, this surface) — RESOLVED (§3.10).** A consolidated
  per-user rate-limit table over the existing `lib.redis.RateLimiter` covers password change,
  email-change request, every TOTP verify/disable, and session revokes; over-budget → opaque
  `RESOURCE_EXHAUSTED`.
- **Audit coverage — RESOLVED (§3.10).** Every state-changing security op writes an `AuditLog` row
  (`password_changed`/`email_changed`/`totp_enabled`/`totp_disabled`/`session_revoked`/…) via the
  existing audit repo — a complete per-user security timeline, no new audit machinery.
- **Erasure follow-through (overview §6) — RESOLVED (§3.8).** `notification_prefs` joins the
  `CandidateEraser` cascade; `anonymize` widens to null the `users` security fields; erasure revokes
  the user's sessions. New artifacts are erasable.

---

## 6. Open questions / risks

- **Keep-current-session on password change / revoke-all-others.** The intent is "boot every *other*
  device, keep the tab I'm on". The simplest correct shape is `revoke_user` then re-`allow_meta` a
  fresh jti for the caller and return it to the FE. *Open:* whether to mint a brand-new refresh jti for
  the caller mid-operation (cleanest) or thread the existing jti through — confirm the exact mechanic
  at planning so the FE's token handling stays simple. *Mitigation:* either way the access token in
  hand stays valid until expiry, so the user isn't logged out.
- **Identifying the current session precisely.** v1 uses an **advisory IP+User-Agent match** to badge
  "This device" and protect its individual revoke. On shared NAT / identical browsers this can
  mis-badge. *Mitigation:* **revoke-all-others** is the safe bulk action regardless; an exact binding
  (a `sid` claim in the access token tied to the refresh jti) is the clean follow-up. **Open:** adopt
  the `sid` claim now or defer — leaning defer (avoids a token-shape change in v1).
- **TOTP secret encryption key management.** The secret is encrypted at rest with an app-secret-keyed
  `SecretBox`. *Open:* key source (the existing JWT-secret config seam vs. a dedicated secret) and key
  rotation policy. *Mitigation:* isolate behind the `crypto` Protocol so the key source is a wiring
  detail; rotation is a documented ops follow-up (re-encrypt on next successful verify).
- **QR rendering dependency.** The Security tab needs to render the `otpauth://` provisioning URI as a
  QR. *Open:* add a tiny client-side QR lib vs. show the URI + copyable secret for manual entry only.
  *Mitigation:* manual-entry (secret string) always works as the no-dependency fallback; confirm the
  QR lib at planning.
- **Email-change: revoke other sessions or not?** Email is a recovery channel, so the safe default is
  to revoke others on swap (like a password change). *Open:* confirm at planning; *Mitigation:* default
  to revoke-others (security-first), keep the caller's session.
- **Digest batcher + SMS provider are seams, not built.** Choosing a digest correctly **suppresses the
  immediate email** but no digest email arrives in v1 (the rollup scheduler is the follow-up); the SMS
  opt-in + gate are honoured but `LoggingSmsSender` only logs. *Mitigation:* both are flagged as
  documented follow-ups behind the same seam pattern email uses (LoggingNotifier → SMTP); the *gate*
  ships and is tested, only the *delivery* is deferred — so it's not silent breakage, it's a staged
  delivery path.
- **Quiet-hours timezone math.** Comparing "is now within the user's quiet window" requires resolving
  a stored IANA tz against the current UTC instant — a classic source of off-by-an-hour / DST bugs.
  *Mitigation:* the comparison lives in **one** helper (`_in_quiet_hours`), is UTC-anchored, validated
  tz at the boundary, and is unit-tested across a DST boundary; critical kinds bypass it entirely.
- **No company-facing security console in v1.** Audit rows carry `comp_id`, so the data exists for "a
  user in my org changed 2FA", but no company UI surfaces it. *Mitigation:* stated as out-of-scope (the
  team module's territory) so a reviewer doesn't look for it here.
