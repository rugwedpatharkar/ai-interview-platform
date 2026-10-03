# → BE: Backend blockers surfaced by the FE audit

**From:** FE session `claude/candidate-frontend-audit-1ae381`
**Date:** 2026-07-28
**Scope:** The FE audit of every route under `frontend/apps/candidate/app/**`
surfaced 9 P0/P1 defects that cannot be fixed on the frontend alone. This handoff
groups them by the backend surface they touch. Full audit is at
`docs/coordination/frontend/audit/2026-07-28-full-audit.md`.

The FE has landed the frontend-side changes it can (see `frontend/log.md` this
date). This doc is the queue for the BE engineer.

---

## P0 · Onboarding step 1 destroys resume-parsed skills

**FE file:** `frontend/apps/candidate/app/onboarding/page.tsx:254`

The wizard uses one `skills` field to hold both the parsed-resume skill list AND
the wizard's 6 "interest chips". The step-1 save writes `patch.skills` unconditionally,
so a candidate with 20 resume-parsed skills who re-enters the wizard (deep link,
refresh past step 1, coming back from /profile) has their entire skills list
overwritten with just the 6 chips shown.

**What BE needs to do:**
Either (a) add a separate `interests: repeated string` field on the profile so
wizard chips don't collide with `skills`, or (b) change the write semantics of
`updateProfile.skills` from "replace" to "merge (union)" so partial updates don't
truncate. (a) is cleaner — interests and skills are different signals.

---

## P1 · SSO callback has no state/nonce → Login-CSRF surface

**FE file:** `frontend/apps/candidate/app/auth/callback/page.tsx:56`

The callback accepts whatever `#access_token=` arrives, structurally validates
the JWT, and writes it to the token store. There is no state param compared
against a stashed value from the authorize step, no nonce check, no `aud`/`iss`
verification. A crafted link `/auth/callback#access_token=<attacker_token>` sent
to a victim logs the victim into the attacker's account (classic Login-CSRF).

**What BE needs to do:**
- Expose a `POST /auth/sso/start` (or equivalent) that generates a per-flow
  state, returns it to the client to stash in sessionStorage, and stamps it into
  the provider redirect URL.
- Sign the JWT with an `aud` claim matching the app's expected audience and an
  `iss` claim matching the auth service; document both values so the FE can
  verify.
- Ideally issue an HttpOnly refresh cookie so the FE doesn't have to keep the
  access token in localStorage at all.

**FE follow-up:** once the state endpoint lands, the callback will consume the
state param exactly once, reject on mismatch, and verify aud/iss.

---

## P1 · Security tab can't read real TOTP status

**FE file:** `frontend/apps/candidate/components/settings/security-tab.tsx:118`

The tab seeds `enabled=false` and only flips it via local dialog callbacks. On
any refresh or first visit, users who already have 2FA on see "Not enabled" and
are offered "Set up 2FA" — which then fails on the server-side "already enrolled"
error with only a toast, leaving the UI in a permanently wrong state.

**What BE needs to do:**
Add a `totp_enabled: bool` (and ideally `totp_enrolled_at`) to the settings
service `getAccount`/`me`/`whoami` response — whichever the FE already calls on
this page. Or expose a dedicated `getTotpStatus()` RPC.

---

## P1 · Privacy consent has no revoke RPC (GDPR gap)

**FE file:** `frontend/apps/candidate/components/settings/privacy-tab.tsx:79`

The tab renders a "Grant" button for un-granted scopes and a "Granted" Badge for
granted ones — no revoke action. GDPR requires withdrawal to be as easy as
consent; shipping this without a revoke path is a legal-review finding.

**What BE needs to do:**
Add `revokeConsent(scope: string)` to the compliance service, mirroring the
existing `grantConsent`. Idempotent, audit-logged.

**FE follow-up:** wire a "Revoke" outline button next to the Granted badge.

---

## P1 · Onboarding sends `age: 0` on every save

**FE file:** `frontend/apps/candidate/app/onboarding/page.tsx:183` (also
`frontend/apps/candidate/app/profile/page.tsx:431`)

The save mutation always passes `age: p?.age ?? 0`. New candidates who haven't
opened /profile have no age set, so the RPC receives 0. `/profile` UI enforces
`min=16 max=100`, so the moment the backend adds the same rule, first-run
onboarding fails on every wizard advance.

**What BE needs to do:**
Make `age` optional on the profile proto (drop the required assertion, treat 0
as "unset"), OR add a distinct "unset" sentinel. Either way the RPC should
accept a partial update that omits `age` entirely.

**FE follow-up:** the FE will send `age: form.age || undefined` once the field is
optional on the wire.

---

## P1 · Status page has no real healthcheck

**FE file:** `frontend/apps/candidate/app/status/page.tsx:27`

Landed for now: the page has been re-styled to say "Monitoring is not yet live"
with grey "Not monitored" pills and a build-time timestamp — the visual
misrepresentation is fixed on FE. But the actual healthcheck data still needs a
backend source.

**What BE needs to do:**
Stand up a `/public/status` endpoint that returns per-service status +
last-checked timestamp. Cache-friendly (60s), no auth. Options: mirror the
existing observability signals; or write a lightweight prober that pings each
service's /healthz.

---

## P1 · Company branding: Display name field discarded

**FE file:** `frontend/apps/candidate/app/company/branding/branding-client.ts:107`

The company branding form has a "Display name" input, but the save adapter drops
it — the proto has no `display_name` field.

**What BE needs to do:**
Add `display_name` to the company profile proto and thread it through the
`updateBranding` / `updateCompany` RPC. Persist alongside the existing `name`
(legal name vs display name).

---

## P1 · Company onboarding invites ship with empty tempPassword

**FE file:** `frontend/apps/candidate/app/company/onboarding/page.tsx:171`

The invite mutation always sends `tempPassword: ""`. Either the RPC requires a
real value (and every invite fails silently), or the field is dead weight and
should be removed. Either way, invitees currently can't sign in.

**What BE needs to do:**
Confirm the intended flow — email magic-link OR temp password. If magic link:
drop `tempPassword` from the proto. If temp password: have the server generate
one (client shouldn't be inventing entropy) and return it in the response so the
UI can display it once.

---

## P1 · Company audit page hard-wired to mock client

**FE file:** `frontend/apps/candidate/app/company/audit/page.tsx:60`

The page reads from a static mock array — the real audit log is unreachable from
this screen even in production. Real compliance/audit needs are legally scoped.

**What BE needs to do:**
Stand up a `listAuditEvents(companyId, filters, cursor)` RPC — filter by actor,
action, target, and time range. Pagination is required (audit tables grow
without bound). Recruiter-role authz.

**FE follow-up:** swap the mock client for the real one; add cursor pagination
UI + filter controls.

---

## Also on this queue (P2, non-blocking but real)

- **Waitlist form** (`app/waitlist/page-client.tsx`) — needs a real
  `forms.submitWaitlist` endpoint. FE has fixed the "always shows success" lie
  in the meantime, but the mailto handoff still loses every signup on browsers
  without a mail client.
- **Data-export before erase** (`components/settings/privacy-tab.tsx`) — GDPR
  right-to-portability needs an `exportMyData` endpoint (profile + consents +
  applications + reports as JSON). The FE will wire a "Download my data" card
  above the destructive erase button once it exists.
- **Job edit save silently no-ops under mock** (`app/company/jobs/[id]/edit`) —
  a real `updateJob` RPC would land the field-drop fix for edit alongside the
  create-path fix already shipped.
- **Company dashboard "Applicants this week"** — the FE is counting all-time
  applicants and double-counting scored ones because the RPC doesn't return
  time-bucketed counts. Needs a real `getCompanyStats(since_ms)` endpoint.

Details for each are in the full audit doc.
