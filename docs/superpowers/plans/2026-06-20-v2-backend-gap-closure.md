# v2 Backend Gap-Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each gap (A1–A6) is an **independent sub-plan** — execute one at a time, gate-green, push, before the next.

**Goal:** Close the 6 backend contracts the frontend was built to call but the backend does not yet implement (A1–A6), wire the 10 already-shipped-but-unwired services into the frontend, and resolve the 3 architectural gaps (voice/video, proctoring trust, interview-RPC drift).

**Architecture:** The platform is a gRPC-web monorepo: `admin` (22 services), `ai-agents` (interview/chat/jd gRPC + practice REST), `mcp-data`/`mcp-capability` (tool layer), `lib` (shared), and `frontend/` (two Next.js apps + `@ip/{api-client,shared,ui}`). New backend work follows one **standard contract recipe** (proto → resource-with-all-logic → thin servicer → web registration → indexes/eraser → `pnpm gen`); the frontend consumes each via a generated `*_pb.ts` client wired into `ApiClients`. This plan adds 3 new RPC sets + 1 new ai-agents capability, enriches 1 report path, and (separately) wires 10 finished services the FE still mocks.

**Tech stack:** Python 3.14, grpcio + a custom gRPC-web ASGI translator (`lib/grpcweb`), Pydantic v2, MongoDB (Motor), Redis, RabbitMQ; FastMCP for the data/capability tools; LangGraph + Gemini for ai-agents. Frontend: Next.js (App Router), `@connectrpc/connect` + `connect-web`, TanStack Query, Tailwind, `@ip/ui`. Tests: pytest (`asyncio_mode=auto`); `ruff` (format + lint, line length 88, S-rules).

---

## Global Constraints

Copied verbatim from the project conventions — **every task below implicitly includes these**:

- **Gate (must be GREEN before every push):** `bash scripts/check.sh` (ruff format + ruff lint + pip-audit + pytest for lib/admin/ai-agents/mcp). Run `.venv/bin/ruff check <files>` AND `ruff format --check <files>` per file before committing; **every docstring/comment line ≤ 88 chars** (ruff format does not wrap prose → E501).
- **venv:** `/Users/rugwedpatharkar/Projects/Project/.venv`. Run as `../../.venv/bin/python` from a service dir or `.venv/bin/python` from root. The venv lives in the **main repo**, not in worktrees.
- **Branch + commits:** work on `main`; **commit per logical unit with EXPLICIT paths** (`git add <files>`, never `git add -A`; verify `git diff --cached --name-only`). zsh does **not** word-split unquoted vars — pass file paths **literally** to git/ruff. Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Push only when the gate is green.
- **Python codegen (admin):** from `src/admin/`: `../../.venv/bin/python -m grpc_tools.protoc -I . --python_out=. --grpc_python_out=. --pyi_out=. app/routes/pb/<x>.proto` — commit the generated `_pb2.py/.pyi/_pb2_grpc.py`. `**/pb` is ruff-excluded.
- **FE codegen:** after any new/changed `.proto`, from `frontend/`: `npx pnpm@9.15.0 --filter @ip/api-client gen` — commit only the changed `frontend/packages/api-client/src/gen/*_pb.ts`. The `index.ts` quad edits are a **separate FE task** (see Recipe R2).
- **Tenant/identity scope** ALWAYS from the token (`identity["id"]`/`identity["comp_id"]`), NEVER the request. Cross-tenant → `NotFound` (don't leak existence).
- **Errors:** domain errors subclass `AuthDomainError` (`src/admin/app/errors.py`); map to gRPC status in `_STATUS` (`src/admin/app/routes/auth.py`). Already mapped: Conflict→ALREADY_EXISTS, NotFound→NOT_FOUND, Forbidden→PERMISSION_DENIED, Validation/InvalidToken→INVALID_ARGUMENT, RateLimited→RESOURCE_EXHAUSTED, InvalidTransition/LimitExceeded→FAILED_PRECONDITION.
- **Pre-authorized deps:** only `pyotp` (already added). **Any new third-party dependency requires explicit sign-off before adding** — this gates A5 (S3 presign client) and A6 (sandbox runner).

---

## Standard Recipes (referenced by every gap below — do NOT re-paste)

### Recipe R1 — a new or extended **admin gRPC contract** (backend)

Mirror `src/admin/app/routes/decision.py` (servicer) + `resources/decision.py` (logic) + `saved_jobs.py`. For each contract:

1. **Proto:** edit/create `src/admin/app/routes/pb/<x>.proto` (add `rpc` + request/response messages).
2. **protoc:** regenerate `<x>_pb2.py/.pyi/_pb2_grpc.py` (Global Constraints command).
3. **Resource (all logic) — TDD:** `resources/<x>.py` holds authz + validation + DTO. Write the failing resource test (`tests/test_resources_<x>.py`) using faithful in-memory fakes → RED → implement → GREEN. Reuse authz primitives: candidate → `aptitude._owned`; manager → `decision._require_manager` + `decision._scoped`; permission-gated → `resources/permissions.require_permission(identity, scope)`.
4. **Thin servicer:** `routes/<x>.py` — `caller_identity(context, self._tokens)`, the `_grpc_total`/`_grpc_errors` counters, `_abort(context, exc, method)` using `_STATUS`, catch `AuthDomainError`.
5. **Register:** in `routes/web.py` — add the servicer import, the `<x>_pb2_grpc` import, and `add_<X>ServiceServicer_to_server(...)` in `create_web_app`. **Add the registration usage BEFORE the imports** (a PostToolUse hook strips not-yet-used imports).
6. **Bump the smoke test:** `tests/test_web.py` — increment the service count (currently asserts `== 22`) **only if adding a new service** (extending an existing service keeps the count) + add a method assert.
7. **Indexes:** `infra/db.py` `INDEXES` (admin is the single index authority for the whole shared DB).
8. **Eraser:** if it holds **candidate** data, add a repo `delete_by_*` + wire into `CandidateEraser` (`resources/compliance.py`) + `make_eraser` (`routes/web.py`) + the conftest fakes. (Employee/company data → NOT in `CandidateEraser`.)
9. **Over-the-wire test:** `tests/test_<x>_grpc.py` — mirror `test_scheduling_grpc.py` (`GrpcWebASGI` + `_frame`/`_ds`/`_call` framing, status-code asserts).
10. **`pnpm gen`** → commit the changed `*_pb.ts`. **Gate → push.**

### Recipe R2 — wire a gRPC client into the **FE api-client** ("the quad")

In `frontend/packages/api-client/src/index.ts`, four edits (mirror `decisions` exactly), then flip the screen:

```ts
// (a) import block
import { SavedJobsService } from "./gen/saved_jobs_pb.js";
// (b) re-export block
export * from "./gen/saved_jobs_pb.js";
// (c) in AdminClients interface
savedJobs: Client<typeof SavedJobsService>;
// (d) in clientsFromTransport return
savedJobs: createClient(SavedJobsService, transport),
```

Then in the screen's client file, delete the `makeMock*`/`NEXT_PUBLIC_MOCK` branch and use `useAuth().api.savedJobs.*`. Verify: `npx pnpm@9.15.0 --filter @ip/api-client typecheck` → `--filter @ip/{candidate,company} build`. **The `*_pb.ts` already exists for all 26 services** — Bucket B needs NO `pnpm gen`, only these `index.ts` edits.

### Recipe R3 — a **REST surface on ai-agents**

Mirror `src/ai-agents/app/routes/practice_api.py` (FastAPI `create_*_app(deps)` + `_caller_user_id` from `deps["tokens"]`, domain-error→HTTP `_STATUS`) and add a path-prefix branch in `src/ai-agents/app/main.py`'s `_dispatcher`.

---

## Part 1 — Master sequencing, priority & effort

| Gap | What | Type | Effort | Priority | Status |
|---|---|---|---|---|---|
| **A1** | Account security + MFA (ChangePassword, email-change, sessions, Login-MFA, VerifyTotpLogin) | admin gRPC + `lib` change | L (5–6 commits) | **P0 — security** | Planned (ledger); in flight |
| **A2** | Employer branding write (UpsertCompanyProfile + logo presign) | admin gRPC + storage | M (3 commits) | **P1** | New |
| **A3** | No-ghosting KPIs (GetNoGhostingKpis) | admin gRPC | S (1–2 commits) | **P1** | New |
| **A4** | Report enrichment (competency evidence + integrity scalar) | ai-agents | M (3 commits) | P2 | New |
| **A5** | Interview recording URL (presign) | admin + storage + ai-agents capture | M (depends on recording capture) | P2 | New |
| **A6** | Coding-assessment execution (sandbox + typed grading) | new capability + admin | XL (phased) | P3 — future | New |
| **B** | Wire 10 shipped-but-unwired services into the FE | FE-only | M (FE) | **P0 for UX** (no BE work) | Ready |
| **C** | Voice/video productionization, proctoring trust, interview-RPC drift | architectural | varies | P2/P3 | Deferred |

**Recommended order:** A1 (finish) → **B** (unlocks ~10 screens, FE-only, parallelizable) → A3 → A2 → A4 → A5 → C → A6.

---

## Part 2 — Gap A1: Account security + MFA (the L1 contract)

**Scope:** `SettingsService` gains `ChangePassword`, `RequestEmailChange`, `VerifyEmailChange`, `ListSessions`, `RevokeSession`, `RevokeAllSessions`; `AuthService.Login` gains an MFA branch + a new `VerifyTotpLogin`. Spec: `docs/superpowers/plans/v2-screens/settings-security.md` (Part A/B). **Code-verified gotchas in `.superpowers/sdd/progress.md` → "L1 EXPLORATION FINDINGS".**

### A1 file structure

- Modify: `lib/lib/security/sessions.py` (enrich `RefreshSessionStore`), `lib/lib/security/tokens.py` (`sid` claim), `lib/tests/test_sessions.py` (NEW lib test).
- Modify: `src/admin/app/resources/auth.py` (thread `ip`/`user_agent`/`sid`; Login MFA branch; `VerifyTotpLogin`; `caller_identity` adds `sid`), `routes/auth.py` (`Login`/`VerifyTotpLogin` servicer + metadata ip/ua), `pb/auth.proto`.
- Modify: `src/admin/app/resources/settings.py` (+ `change_password`, `request_email_change`, `verify_email_change`, `list_sessions`, `revoke_session`, `revoke_all_sessions`), `routes/settings.py` (+ servicer methods; thread `sessions`/`limiter`/`nonces`/`notifier`/`audit`), `pb/settings.proto`, `routes/web.py` (SettingsServicer wiring).
- Test: `tests/test_resources_settings.py` (extend), `tests/test_settings_grpc.py`, `tests/test_resources_auth.py` (extend, MFA), `tests/test_routes_auth.py`, `src/admin/tests/conftest.py` (FakeRedis `hset`/`hgetall`).

### A1 commit sequence (each its own gate-green commit)

**A1.1 — `lib` RefreshSessionStore enrichment + sid claim (the shared-lib change; do with login/refresh in full view).**
- `RefreshSessionStore.allow(user_id, jti, ttl, *, ip="", user_agent="")` — also write hash `refresh:meta:{jti}` `{ip, user_agent, created_at, last_seen}` sharing the TTL.
- `revoke(jti)` and the `revoke_user` LUA must **also delete the meta key** (else `list_for_user`, which checks meta presence, shows revoked sessions).
- Add `list_for_user(user_id) -> [{jti, meta}]` (skip jtis whose meta is gone) and `revoke_all_except(user_id, current_jti)`.
- `TokenService.access_token(sub, role, comp_id, jti, sid=None)` — additive claim (only included when `sid` is not None; backward-compatible).
- **TDD:** new `lib/tests/test_sessions.py` with a hand-rolled fake redis (NO `fakeredis` installed; `decode_responses=True` → str in/out). Assert meta written on `allow`, `list_for_user` returns one entry per active jti, `revoke_all_except` keeps the current jti, `revoke`/`revoke_user` clear meta. Keep `lib` tests green.
- Extend `src/admin/tests/conftest.py` `FakeRedis` with `hset`/`hgetall` (+ make `delete` pop a `hashes` dict) so the admin auth tests pass once `allow()` writes meta.

**A1.2 — thread ip/ua/sid into login/refresh (touches core login; preserve byte-for-byte).**
- `resources/auth.login(...)`: already has `ip`; add `user_agent=""`; pass `ip=ip, user_agent=user_agent` to `sessions.allow(...)`; mint access with `sid=refresh_jti`.
- `resources/auth.refresh(...)`: add `ip=""`/`user_agent=""` params; pass to `allow`; mint access with `sid=new_jti`. Update the 3rd `allow()` call site (~L434).
- `routes/auth.caller_identity(...)`: add `"sid": claims.get("sid")` to the identity dict.
- Servicer `Login`/`Refresh`: read ip/ua from gRPC metadata (mirror `_client_ip` in `routes/public_api.py`; user-agent from `dict(context.invocation_metadata()).get("user-agent","")`) and pass through.
- **Login response stays byte-for-byte** (`{access_token, refresh_token, token_type}`); the JWT just gains a `sid` claim.

**A1.3 — SettingsService ChangePassword + email-change (additive RPCs).**
- Proto `settings.proto`: `rpc ChangePassword(ChangePasswordRequest) returns (OkResponse);` `rpc RequestEmailChange(RequestEmailChangeRequest) returns (OkResponse);` `rpc VerifyEmailChange(VerifyEmailChangeRequest) returns (OkResponse);` with `ChangePasswordRequest{string current_password=1; string new_password=2;}`, `RequestEmailChangeRequest{string new_email=1;}`, `VerifyEmailChangeRequest{string token=1;}`.
- `resources/settings.py`:
  - `change_password(user_id, current_password, new_password, *, users, sessions, limiter=None, ip=None, audit=None)`: load user; if `password_hash == ""` → `ValidationError` (SSO-only); `verify_password(current_password, hash)` else `ValidationError`; enforce **min length 8** (define `_MIN_PASSWORD = 8` — there is **no backend min-length today**; the spec's "register min-length" does not exist); `hash_password(new)` → `users.update_fields(user_id, {"password_hash": ...})`; rate-limit; audit `password_changed`; then `sessions.revoke_all_except(user_id, current_sid)` (keep-current; falls back to `revoke_user` if `sid` is None). → `{ok: True}`.
  - `request_email_change(user_id, new_email, *, users, tokens, notifier, nonces=None, audit=None)`: normalize + `EmailStr`-validate; `users.get_by_email(new_email)` (other) → `ConflictError`; stage `pending_email` via `update_fields`; mint a `tokens.verification_token(sub=user_id, jti=...)` + `nonces.allow(jti)`; `notifier.send_email(new_email, "Confirm your new email", "/verify-email?token=...")`; audit `email_change_requested`. → `{ok: True}`.
  - `verify_email_change(token, *, users, tokens, nonces=None)`: **NOT caller-gated** (servicer skips `caller_identity`); decode purpose `email_verify`; `nonces.consume(jti)` (replay → raise — see decision below); load user; swap `email = pending_email`, clear `pending_email`, set `email_verified=true` via `update_fields`; audit. → `{ok: True}`.
  - **Replay-status decision (flag at execution):** the existing `verify_email` maps the nonce-consume failure via `InvalidTokenError → INVALID_ARGUMENT`. The spec says UNAUTHENTICATED. **Recommend matching the existing flow (`InvalidTokenError`/INVALID_ARGUMENT)** for consistency unless the FE strictly needs 401.
- Servicer `routes/settings.py`: add the 3 methods. `ChangePassword` needs `sessions`/`limiter`/`audit`; email-change needs `tokens`/`nonces`/`notifier`/`audit`. `VerifyEmailChange` is **pre-auth** (no `caller_identity`). Extend `SettingsServicer.__init__` to accept `sessions`, `limiter`, `nonces`, `notifier`, `audit`.
- `routes/web.py`: thread `sessions=RefreshSessionStore(redis)`, `limiter=RateLimiter(redis)`, `nonces=SingleUseTokenStore(redis)`, `notifier=notifier`, `audit=AuditLogRepository(db)` into `SettingsServicer(...)`.
- TDD `tests/test_resources_settings.py` + `tests/test_settings_grpc.py`.

**A1.4 — SettingsService session management (consumes A1.1).**
- Proto: `rpc ListSessions(ListSessionsRequest) returns (ListSessionsResponse);` `rpc RevokeSession(RevokeSessionRequest) returns (OkResponse);` `rpc RevokeAllSessions(RevokeAllSessionsRequest) returns (OkResponse);` `SessionDTO{string jti=1; string ip=2; string user_agent=3; string created_at=4; string last_seen=5; bool current=6;}` `ListSessionsResponse{repeated SessionDTO sessions=1;}`.
- `resources/settings.py`:
  - `list_sessions(user_id, current_sid, *, sessions)`: `rows = await sessions.list_for_user(user_id)`; map each to `SessionDTO` with `current = (jti == current_sid)`.
  - `revoke_session(user_id, jti, current_sid, *, sessions)`: verify `jti ∈ list_for_user(user_id)` set → else `NotFoundError` (don't leak); `sessions.revoke(jti)`.
  - `revoke_all_sessions(user_id, current_sid, *, sessions)`: `sessions.revoke_all_except(user_id, current_sid)`.
- Servicer: each reads `ident["sid"]` from `caller_identity` for `current`.
- TDD: extend the settings tests (current-flag, NOT_FOUND for a foreign jti).

**A1.5 — AuthService Login MFA branch + VerifyTotpLogin (touches core login; test thoroughly).**
- Proto `auth.proto`: add to `LoginResponse`/`TokenResponse` **additively** `bool mfa_required = 4; string mfa_token = 5;` (the 2FA-off response leaves them default `false`/`"" ` → **byte-for-byte unchanged**). New `rpc VerifyTotpLogin(VerifyTotpLoginRequest) returns (TokenResponse);` with `VerifyTotpLoginRequest{string mfa_token=1; string code=2;}`.
- `resources/auth.login(...)`: after password verify, **if `user.get("totp_enabled")`**, instead of minting tokens, mint a short-lived single-use `mfa_token` (a `TokenService` token purpose `"mfa"` + `nonces.allow(jti, MFA_TTL)`) and return `{mfa_required: True, mfa_token, access_token:"", refresh_token:"", token_type:""}`. The non-2FA tail (mint access+refresh) is unchanged.
- `resources/auth.verify_totp_login(mfa_token, code, *, users, tokens, sessions, nonces, secretbox, totp, refresh_ttl_seconds, ip=None, user_agent="")`: **pre-auth**; decode purpose `mfa`; `nonces.consume(jti)` (replay → InvalidTokenError); load user; `totp.verify(secretbox.decrypt(user["totp_secret"]), code)` **OR** a recovery-code match (`any(verify_password(code, h) for h in user["recovery_codes"])` — mirror `settings.disable_totp`); on success mint access+refresh (login's tail, with `sid`/ip/ua). On failure → `InvalidCredentialsError`.
- Servicer `routes/auth.py`: `VerifyTotpLogin` servicer (pre-auth, no `caller_identity`); thread `totp=PyotpProvider()`, `secretbox=FernetSecretBox(tokens._secret)`, `nonces` into `AuthServicer` (mirror how `SettingsServicer` gets them).
- TDD `tests/test_resources_auth.py`: 2FA-off Login unchanged (byte-for-byte assert on the response dict); 2FA-on Login → `mfa_required` + no tokens; `VerifyTotpLogin` happy path + wrong code + replayed mfa_token + recovery-code path.

### A1 frontend changes

Per `settings-security.md` Part B. After A1.3–A1.5 land + `pnpm gen`:
- **api-client:** wire `settings` (Recipe R2) — it's currently unwired (see Bucket B).
- **Settings screen** (`apps/{candidate,company}/app/settings/*`): flip `settings-client.ts` off mock; add the **Password** tab (`changePassword`), **Email** tab (`requestEmailChange` → "check your inbox"; a `/verify-email` route consuming `verifyEmailChange`), **Sessions** tab (`listSessions` table with the `current` badge + per-row `revokeSession` + a `revokeAllSessions` "log out everywhere else" button).
- **Login flow** (`apps/{candidate,company}/app/login`): on a `mfa_required` response, route to a **2FA step** that calls `auth.verifyTotpLogin({mfa_token, code})` (TOTP or recovery code) and then stores the returned tokens exactly as the normal login does. The 2FA-off path is unchanged.
- **`/verify-email` route:** a thin page calling `settings.verifyEmailChange({token})` from the query string (mirror the existing `/verify` page).

---

## Part 3 — Gap A2: Employer branding write (UpsertCompanyProfile + logo presign)

**Scope:** `CompanyProfileService` gains a manager-only write + a logo-upload presign so the `company/app/branding` screen stops mocking. Spec: `docs/superpowers/plans/v2-screens/company-branding.md`. The read DTO already exposes `about/website/logo/locations` (today always `""`/`[]`).

### A2 backend (Recipe R1)

- **Proto** `src/admin/app/routes/pb/company_profile.proto` — add:
  ```proto
  rpc UpsertCompanyProfile(UpsertCompanyProfileRequest) returns (CompanyProfile);
  rpc PresignLogoUpload(PresignLogoUploadRequest) returns (PresignLogoUploadResponse);

  message UpsertCompanyProfileRequest {
    string about = 1;
    string website = 2;
    string logo = 3;                 // object key returned by PresignLogoUpload (or "")
    repeated string locations = 4;
  }
  message PresignLogoUploadRequest { string content_type = 1; }  // image/png|jpeg|webp
  message PresignLogoUploadResponse {
    string upload_url = 1;           // PUT here
    string object_key = 2;           // echo back to UpsertCompanyProfile.logo
    string public_url = 3;           // the resolvable logo URL after upload
  }
  ```
- **Repository:** `company_profiles` already exists (unique `comp_id`). Add `upsert_branding(comp_id, fields)` to `CompanyProfileRepository`.
- **Resource** `resources/company_profile.py`:
  - `upsert_company_profile(identity, payload, *, profiles)`: `decision._require_manager(identity)`; validate `website` is a URL or `""`; `about` ≤ 4096; `locations` ≤ 20 entries each ≤ 120; `logo` is `""` or a key under the caller's `comp_id` prefix; `profiles.upsert_branding(identity["comp_id"], {...})`; return the merged `GetCompanyProfile` DTO.
  - `presign_logo_upload(identity, content_type, *, storage)`: `_require_manager`; validate `content_type ∈ {image/png,image/jpeg,image/webp}`; `key = f"branding/{comp_id}/logo-{uuid}.{ext}"`; `storage.presign_put(key, content_type, ttl)` → `{upload_url, object_key, public_url}`.
- **Storage:** reuse the existing S3/MinIO storage seam (`ProfileService.UploadResume` already presigns — mirror `infra/storage`). **If a new presign method/dep is needed, STOP and ask** (Global Constraints).
- **Servicer** `routes/company_profile.py`: add the 2 methods (manager auth via `caller_identity` + the resource's `_require_manager`); thread `storage` into `CompanyProfileServicer`.
- **web.py:** thread `storage=storage` into `CompanyProfileServicer(...)`.
- **Tests:** `tests/test_resources_company_profile.py` (manager-only; validation; key-prefix scoping) + `tests/test_company_profile_grpc.py` (the 2 RPCs). `test_web.py` count unchanged (same service).
- **`pnpm gen`** → `company_profile_pb.ts` grows the 2 RPCs + messages.

### A2 frontend

- **api-client:** wire `companyProfile` (Recipe R2).
- **`company/app/branding`** (`branding-client.ts`): replace `makeMockBrandingClient` with `api.companyProfile.{getCompanyProfile, upsertCompanyProfile}`; the logo picker calls `presignLogoUpload(contentType)` → `PUT` the file to `upload_url` → submit `upsertCompanyProfile({about, website, logo: object_key, locations})`. Mirror the resume-upload flow in `candidate/app/profile`.
- **`company/app/companies/[id]` / company-profile read**: already covered by Bucket B (the read + public REST already exist; just flip).

---

## Part 4 — Gap A3: No-ghosting KPIs (Analytics.GetNoGhostingKpis)

**Scope:** the company home dashboard (`company/app/page.tsx`, `dashboard-kpis.ts`) currently runs `makeMockKpis()`. The underlying data — the **Application transition-log** (`{state, at}` entries appended on every funnel CAS) — already exists; only the aggregation RPC is missing. Spec: `docs/superpowers/plans/v2-screens/recruiter-dashboard.md`.

### A3 backend (Recipe R1, extends AnalyticsService)

- **Proto** `analytics.proto` — add:
  ```proto
  rpc GetNoGhostingKpis(NoGhostingKpisRequest) returns (NoGhostingKpis);

  message NoGhostingKpisRequest {}   // comp scope from the token
  message NoGhostingKpis {
    int32 pending_review = 1;          // applications awaiting a first recruiter action
    int32 stale_over_sla = 2;          // pending past the response SLA (e.g. 7 days)
    double median_response_hours = 3;  // median(applied -> first transition)
    double response_rate = 4;          // share of applications that got any decision
    int32 decided_last_7d = 5;
  }
  ```
- **Resource** `resources/analytics.py` — `get_no_ghosting_kpis(identity, *, applications, clock=_utcnow)`: `_require_manager`; pull the comp's applications (capped, projection `{state, created_at, transitions}`); compute from each app's `transitions` array (the median applied→first-transition, the share with ≥1 transition, counts in the last 7d, the count still in `applied`/`aptitude_pending` with no transition, and those past the SLA). **No new collection** — read the transition-log already on the `Application` doc.
- **Servicer** `routes/analytics.py`: add `GetNoGhostingKpis` (mirror `GetFunnelAnalytics`).
- **Tests:** `tests/test_resources_analytics.py` (deterministic transitions → exact KPIs; empty comp → zeros) + extend `tests/test_analytics_grpc.py`. `test_web.py` count unchanged.
- **`pnpm gen`** → `analytics_pb.ts` grows the RPC.

### A3 frontend

- **api-client:** `analytics` is already wired — no quad needed.
- **`company/app/page.tsx`** (`dashboard-kpis.ts`): replace `makeMockKpis()` with `api.analytics.getNoGhostingKpis({})`; render the 5 scalars (pending review, stale-over-SLA, median response, response rate, decided last 7d). Keep the existing `getFunnelAnalytics`/`getJobScoreDistribution` panels.

---

## Part 5 — Gap A4: Candidate report enrichment (competency evidence + integrity scalar)

**Scope:** the candidate report (`candidate/app/...report`, `company/.../applicants/[appId]`) shows free-text strengths/concerns only. Enrich it so each competency carries **evidence** (a transcript-grounded quote/turn ref) and the report surfaces an **integrity scalar** folded from proctoring. Spec: `docs/superpowers/plans/v2-screens/candidate-report.md` (§A.2). All work is in **ai-agents** (+ the admin `ReportService` DTO it reads through).

### A4 backend (ai-agents)

- **Model** `src/ai-agents/app/model/scoring.py`:
  - `CompetencyScore` gains `evidence: list[Evidence] = []` where `Evidence{quote: str; turn_index: int}` (a short transcript-grounded snippet + which Q/A turn it came from).
  - `InterviewReport` gains `integrity: IntegritySummary | None` where `IntegritySummary{score: float; flags: list[str]; auto_terminated: bool}`.
- **Evaluator** `resources/evaluator.py`: extend the prompt so the LLM returns, per competency, 1–2 grounded `evidence` snippets **drawn from the transcript** (enforce the existing 0.0–1.0 score invariant; additionally validate each evidence `turn_index` is in range — drop out-of-range evidence).
- **Report writer** `resources/report_writer.py` / `handlers.handle_interview_completed`: fold the proctoring outcome into the report — read the stored proctoring events for the application (`data.get_*` over the `proctoring_events` store, OR receive the integrity summary the admin `Report.GetIntegrityTimeline` already computes) and set `InterviewReport.integrity = {score, flags, auto_terminated}`. **Decision (flag at execution):** compute the integrity scalar in ai-agents at finalize time vs. let admin's existing `integrity.py` own it and have the report reference it. **Recommend ai-agents reads the events and stamps a snapshot** so the report is self-contained.
- **admin `ReportService`:** widen `report.proto`'s `Report`/competency messages to carry `evidence[]` + an `integrity` sub-message, and pass them through `resources/report.py` (the admin report DTO is a thin read of the ai-agents-written `reports` doc). Regenerate admin pb + `pnpm gen`.
- **Tests:** `src/ai-agents/tests/test_evaluator.py` (evidence present, out-of-range turn_index dropped), `test_report_writer.py` (integrity folded in), `test_handlers.py` (the finalize path stamps integrity); admin `tests/test_resources_report.py` (DTO carries the new fields).

### A4 frontend

Per `candidate-report.md`: the report view renders per-competency **evidence** accordions and an **integrity band** (score + flags + the `auto_terminated` warning). The integrity band already reads `reports.getIntegrityTimeline` (Bucket B flip); A4 adds the **in-report** integrity summary + competency evidence to the existing `ReportView`.

---

## Part 6 — Gap A5: Interview recording URL (presign)

**Scope:** `integrity.recording_url` is hardcoded `""` ("Tier C presign deferred"). Two prerequisites: (1) the recording must actually be **captured** (the voice/video interview must write a recording to storage — ties to Part 9/C1), and (2) a **presigned GET** must be served to authorized recruiters.

### A5 backend

- **Capture (prereq):** the LiveKit room must be configured to **egress** the session to the storage bucket keyed by `application_id` (LiveKit egress → S3/MinIO). This is configuration + a webhook to record the object key on the interview doc. **Gated on C1 (voice/video productionization) and on a recording-storage decision — do not start A5 until recordings exist.**
- **Presign read:** `resources/integrity.py` — replace the hardcoded `recording_url = ""` with: if the interview doc has a `recording_key`, `storage.presign_get(recording_key, ttl)` (manager + comp-scoped, same authz as `GetIntegrityTimeline`); else `""`.
- **Tests:** `tests/test_resources_*integrity*` — with a `recording_key` → a presigned URL; without → `""`.

### A5 frontend

The integrity band (`company/.../applicants/[appId]`) shows a **"View recording"** link when `recording_url` is non-empty (already defensively handled; just becomes live).

---

## Part 7 — Gap A6: Coding-assessment execution (sandbox + typed grading) — PHASED / FUTURE

**Scope:** the FE coding-assessment screen (`candidate/app/aptitude/...`, `coding-assessment.md`) mocks `run` (execute candidate code) + typed-section grading. The shipped `AptitudeService` is **MCQ-only**. A real code-execution path is a **large new capability** and needs explicit product sign-off + a dependency decision (sandbox runner). **Do not start without sign-off.**

### A6 phased plan

- **Phase 0 — decision (BLOCKER):** choose the execution substrate (a sandboxed runner — e.g. a container/firecracker microVM or a hosted code-exec API). **New dependency / infra → STOP and ask.** Until decided, the FE keeps the MCQ path real and the coding path mocked.
- **Phase 1 — contract:** new `admin.coding.v1.CodingService` (or extend `AptitudeService`): `GetCodingTask`, `RunCode(task_id, language, source, stdin) -> {stdout, stderr, exit_code, time_ms}` (ephemeral, no grade), `SubmitCoding(task_id, source) -> {passed, cases_passed, cases_total}` (runs the hidden test cases). Typed sections grade like MCQ (exact/normalized match).
- **Phase 2 — execution worker:** a sandboxed runner service (resource limits, network-off, time/memory caps) behind the contract; `RunCode`/`SubmitCoding` enqueue + await with a hard timeout.
- **Phase 3 — FE:** flip `lib/assessment.ts` off the mock to the real `coding`/`aptitude` client; wire the editor's Run button → `RunCode`, Submit → `SubmitCoding`.
- **Security:** the sandbox is the entire risk surface — untrusted code execution. This is why it's last + sign-off-gated.

---

## Part 8 — Bucket B: wire the 10 shipped-but-unwired services into the FE (FE-only, NO backend work)

These services are **fully implemented, gate-green, and have generated `*_pb.ts`** — they're invisible only because `ApiClients` doesn't instantiate them and screens read `NEXT_PUBLIC_MOCK`. This is the **single biggest UX unlock for zero backend effort**. (This is the FRONTEND session's lane; listed here for completeness.)

### B.1 — api-client quads (Recipe R2), one commit each or batched

Add to `frontend/packages/api-client/src/index.ts` (import + `export *` + `AdminClients` member + `clientsFromTransport` entry) for each admin service:

| Client key | Service (gen file) |
|---|---|
| `savedJobs` | `SavedJobsService` (`saved_jobs_pb.js`) |
| `jobAlerts` | `JobAlertsService` (`job_alerts_pb.js`) |
| `companyProfile` | `CompanyProfileService` (`company_profile_pb.js`) |
| `sourcing` | `SourcingService` (`sourcing_pb.js`) |
| `discovery` | `DiscoveryService` (`discovery_pb.js`) — optional; FE uses public REST for search |
| `messaging` | `MessagingService` (`messaging_pb.js`) |
| `notification` | `NotificationService` (`notification_pb.js`) |
| `scheduling` | `SchedulingService` (`scheduling_pb.js`) |
| `team` | `TeamService` (`team_pb.js`) |
| `settings` | `SettingsService` (`settings_pb.js`) |

> `practice` is **REST** (ai-agents), not gRPC — wire it as `makePracticeClient(AIAGENTS_URL, store)` in `@ip/shared` per `practice-feedback.md` Task 1 (a REST client, NOT an `ApiClients` entry).

### B.2 — flip each screen off the mock

For each, delete the `makeMock*`/`NEXT_PUBLIC_MOCK` branch in the screen's client file and use the real `useAuth().api.<client>.*` (or the REST client for practice). Verify `--filter @ip/{candidate,company} build` green after each.

| Screen / route | Client | File to flip |
|---|---|---|
| `/saved` + SaveJobButton | `savedJobs` | `candidate/.../saved-jobs-client.ts` |
| `/alerts` | `jobAlerts` | `candidate/.../job-alerts-client.ts` |
| `/companies/[id]` + branding read | `companyProfile` (read) + public REST | `*/company-client.ts` |
| `/talent` candidate-search | `sourcing` | `company/.../sourcing-client.ts` |
| messages (both apps) | `messaging` | `*/messages-client.ts` |
| notifications + bell | `notification` | `*/notification-*` |
| `/schedule` + Schedule tab | `scheduling` | `*/lib/scheduling.ts` |
| `/team` | `team` | `company/.../team-client.ts` |
| settings prefs/2FA (then A1 tabs) | `settings` | `*/settings-client.ts` |
| applicants integrity band | `reports` (already wired) | `company/.../integrity-client.ts` (drop the cast) |
| `/practice` + `/feedback/[id]` | `makePracticeClient` (REST) | `candidate/.../practice-client.ts` |

### B.3 — clean up the casts

Remove every `(api as unknown as X)` cast (messaging, scheduling, team, notification, integrity-timeline) once the real client keys exist — they become type-checked.

---

## Part 9 — Bucket C: architectural gaps

### C1 — Live voice/video proctored interview is not end-to-end (this is "Plan H")

- **Server:** the voice-worker (`src/ai-agents/app/service/voice_worker.py`) is fully coded (LiveKit + Groq STT + Edge TTS + Silero VAD) but runs as a **separate process** `main.py serve()` never starts, and cross-replica dedup is in-process-only (`# Redis SETNX deferred to Phase 4`). **Plan:** (a) deploy the voice-worker as its own entrypoint (it already is) + document the LiveKit webhook wiring; (b) add Redis `SETNX` cross-replica dedup before spawning a session; (c) optionally a health/liveness signal the FE can read so `rtcToken` only hands back a token when a worker is reachable.
- **Client (FE):** the proctored room runs LiveKit + MediaPipe detectors on **fake seams** — the deps (`livekit-client`, MediaPipe) are **not installed**. **Plan:** add the FE deps (lockfile touch — **requires user sign-off**), then replace the fake seams in `candidate/app/interview/[applicationId]` with the real `livekit-client` room join + the MediaPipe detectors feeding `recordProctorEvents`.
- **Sequencing:** C1 is the prerequisite for A5 (recording capture). Do C1 before A5.

### C2 — Proctoring is client-trust (no server-side detection)

All gaze/second-face/phone/virtual-camera detection is **client-side**; the server trusts typed events, stamps canonical severity, and auto-terminates on HIGH. This is **by design** (privacy: "no raw frames leave the device"). **Decision (product):** accept client-trust + the server-side severity/auto-terminate as the integrity guarantee, OR invest in a server-side verification path (out of current scope, large). Document the chosen posture; no code change required to keep the current behavior.

### C3 — Interview-RPC drift (text turn-based path unused)

`InterviewService.StartInterview`/`SubmitTurn` are implemented but the FE live interview uses `rtcToken` + the SSE chat-stream instead. **Decision:** either (a) wire a **text-interview fallback** screen that uses `startInterview`/`submitTurn` (useful when voice/video is unavailable — and the deps are already there since practice uses the same brain over REST), or (b) mark those RPCs as intentionally-retained-for-fallback and document it. **Recommend (a)** — a text fallback is cheap (the brain + RPCs exist) and de-risks the voice/video dependency.

---

## Self-Review — spec coverage

- **A1** (settings security + MFA): ✅ Parts 2.1–2.5 cover ChangePassword, email-change, sessions, Login-MFA, VerifyTotpLogin + the `lib` enrichment + sid + FE. Cross-ref: `settings-security.md`, ledger "L1 EXPLORATION FINDINGS".
- **A2** (branding write): ✅ Part 3 — Upsert + PresignLogoUpload + storage + FE. Cross-ref: `company-branding.md`.
- **A3** (no-ghosting KPIs): ✅ Part 4 — GetNoGhostingKpis over the existing transition-log + FE. Cross-ref: `recruiter-dashboard.md`.
- **A4** (report enrichment): ✅ Part 5 — competency evidence + integrity scalar (ai-agents + admin DTO) + FE. Cross-ref: `candidate-report.md`.
- **A5** (recording URL): ✅ Part 6 — presign read, gated on C1 recording capture.
- **A6** (coding execution): ✅ Part 7 — phased, sign-off-gated (new infra/dep).
- **"all other backend functionalities"** → **Bucket B** (Part 8, the 10 done-but-unwired services + practice REST + cast cleanup) and **Bucket C** (Part 9, voice/video, proctoring posture, interview drift).
- **FE changes for each gap:** embedded in each Part (A1 §"frontend changes", A2/A3/A4/A5 §"frontend", A6 Phase 3) + the consolidated Bucket B flip table.

**Open decisions to confirm at execution (do not block planning):** (1) VerifyEmailChange replay status code (INVALID_ARGUMENT vs UNAUTHENTICATED); (2) A4 integrity scalar owner (ai-agents snapshot vs admin reference); (3) A5 recording-storage substrate; (4) A6 sandbox substrate (new infra/dep → sign-off); (5) C1 FE deps `livekit-client`+MediaPipe (lockfile → sign-off); (6) C2 proctoring posture (accept client-trust vs server verification).
