# Phase 2 — FRONTEND-side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or
> superpowers:executing-plans. There is **no FE test runner** — verify every task with
> `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` + packages
> `typecheck`, plus a review pass. **Project is LOCAL-ONLY — never run git/gh.** Autonomous mode.

**Goal:** Surface the Phase 2 intelligence in the two Next.js apps — candidate job
recommendations, company ranked-candidate views, a tenant/role-scoped streaming **chat** panel, the
"improve JD" affordance, a rubric manager, the funnel-analytics dashboard, SSO buttons, and the
talent-pool / bias surfaces — reusing the established `@ip/{ui,shared,api-client}` patterns.

**Scope (this plan owns this):** `frontend/` (pnpm + Turborepo). `apps/candidate` (:3000),
`apps/company` (:3001), `packages/{api-client, shared, ui}`.

**Architecture:** Next.js 15 (App Router, React 19) + TanStack Query v5 + Tailwind v4 + TS over the
typed **gRPC-web** client (`@ip/api-client`, connect-web). AI surfaces that **stream** (chat) use the
**ai-agents REST/SSE** client in `@ip/shared` — the same path the P1 interview uses — not gRPC-web
(the in-house translator is unary-only).

**Tech stack:** unchanged — reuse `@ip/shared` (`errorMessage`, `refetchUntil`, `makeAuth`, the
interview-REST client, `downloadBytes`), `@ip/ui` primitives (`Button`/`Card`/`Badge`/`Table` +
`LoadingState`/`ErrorState`/`EmptyState` + `toast`), and the TanStack Query idioms in
`reports-panel.tsx`.

## Global Constraints
- **No git/gh.** Verify each task: both app `build`s + packages `typecheck` green. No CSP console
  violations on core flows (the P1 strict CSP must keep allowing only `self` + admin + ai-agents).
- Reuse patterns — **do not** introduce a second data-fetching or error-mapping approach.
- New `connect-src` targets (ai-agents SSE) must already be permitted by the P1 CSP
  (`NEXT_PUBLIC_AIAGENTS_URL`); confirm before shipping chat.
- No global `pnpm`/`buf`/`tsx` — use `npx`. Node ≥ 20.

## Where this fits
Sibling plans: `2026-06-18-phase-2-backend.md` (gRPC protos + SSO routes this plan consumes),
`2026-06-18-phase-2-agent.md` (the `/chat/turn` SSE + `/jd/improve` REST endpoints). Umbrella +
reconciliations: `2026-06-18-phase-2.md`; cross-side build order in its Part F. **Every gRPC surface
here is gated on a Backend proto landing + `@ip/api-client` regen (F1); the streaming surfaces are
gated on the Agent REST/SSE endpoints.**

## Decisions that bind this plane (from umbrella Part B)
3. **Chat = ai-agents REST `/chat/turn` + SSE.** The chat client lives in `@ip/shared` and mirrors
   the interview-REST client (Bearer access token, SSE consume). It is **not** a gRPC-web call.
   Privacy is enforced server-side; the UI just renders text + citations within the user's scope.

---

## F1 — Regenerate the API client
**Files:** `frontend/packages/api-client` (`npx pnpm@9.15.0 --filter @ip/api-client gen`).
- **Change:** regen after the Backend protos land — `recommendation` (B2), `analytics` (B4),
  `rubric` (B5). Single source of truth for the new RPC contracts.
- **Depends:** Backend B2 / B4 / B5 `.proto` files exist + stubs regenerated server-side.
- **Verify:** `--filter @ip/api-client typecheck` green.

## F2 — Candidate recommendations
**Files:** candidate `app/recommendations/page.tsx`; new `@ip/ui` recommendation card.
- **Change:** `useQuery` over `GetCandidateRecommendations`; render ranked cards with score + the
  match `reasons[]`; link each to the job. Reuse the `LoadingState`/`ErrorState`/`EmptyState` +
  `errorMessage` idioms from `reports-panel.tsx`. Empty state copy handles "no matches yet."
- **Depends:** F1 + Agent matching data (A6–A8) producing `match_results`.
- **Verify:** both builds + typecheck green.

## F3 — Company ranked candidates
**Files:** company `app/jobs/[id]/ranked/page.tsx` (or a "Ranked" tab on the existing job page).
- **Change:** `useQuery` over `GetJobRankedCandidates`; a `Table` of candidates by score with
  `reasons[]` and a link to the AI report (reuse the `reports-panel.tsx` table idiom +
  `REC_TONE`-style badges).
- **Depends:** F1.
- **Verify:** both builds + typecheck green.

## F4 — Chat UI (SSE)
**Files:** `@ip/shared` chat client (`createChatClient` — SSE consume + Bearer, mirroring the
interview-REST client); `@ip/ui` `ChatWindow` + a cited `ChatMessage` (renders text + a citations
list); a chat panel mounted in **both** candidate and company apps (scoped by the logged-in role).
- **Change:** open `POST /chat/turn`, stream `{text}` / `{citation}` SSE events into the message
  list; show a typing/streaming state; render citations inline. Use a `useRef` in-flight latch (the
  P1 interview ref-latch pattern) so StrictMode + same-tick submits don't double-send.
- **Depends:** Agent A12 (`/chat/turn`). Confirm `NEXT_PUBLIC_AIAGENTS_URL` is in the CSP `connect-src`.
- **Verify:** both builds + typecheck green; no CSP violation when the panel opens.

## F5 — "Improve JD" affordance
**Files:** company job-create form (+ an "Improve with AI" button) + a small `@ip/shared` client for
ai-agents `POST /jd/improve`.
- **Change:** send the current brief/draft, populate the JD textarea with the returned `jd_text` +
  show `suggestions[]`. Disable while pending; map errors via `errorMessage` + `toast`.
- **Depends:** Agent A13 (`/jd/improve`).
- **Verify:** both builds + typecheck green.

## F6 — Rubric manager
**Files:** company rubric CRUD surface (list/create/edit/delete) over the rubric RPCs; reuse `@ip/ui`
form primitives + `ConfirmDialog` (the controlled-dialog from the P1 audit fix) for deletes.
- **Depends:** F1 (rubric proto).
- **Verify:** both builds + typecheck green.

## F7 — Company analytics dashboard
**Files:** company `app/analytics/page.tsx` — per-funnel-state counts + a conversion chart.
- **Change:** `useQuery` over `GetFunnelAnalytics`; render counts + conversion. Keep the chart
  dependency-light (reuse existing UI primitives or a tiny inline bar; avoid a heavy chart lib unless
  one is already in the workspace).
- **Depends:** F1 (analytics proto) + Backend B4.
- **Verify:** both builds + typecheck green.

## F8 — SSO buttons
**Files:** "Continue with Google / Microsoft" on **both** login pages → redirect to admin
`/auth/oauth/authorize?provider=…`; handle the callback return (read tokens, seed the auth store via
`makeAuth`, route to the app home).
- **Change:** the redirect leaves the SPA, returns to a callback route that finalizes the session.
  Reuse the existing token-store + `onAuthLost` wiring.
- **Depends:** Backend B3 (`/auth/oauth/*`). Confirm the admin origin is in the CSP.
- **Verify:** both builds green; the login pages render the buttons; no CSP violation on redirect.

## F9 — Talent pool + bias surfaces
**Files:** company talent-pool list + a bias **score-distribution** chart (spread/quartiles).
- **Change:** `useQuery` over the talent-pool + bias RPCs; comp-scoped lists; the bias view shows
  score-distribution stats only (no protected attributes — matches the backend's v1 scope).
- **Depends:** Backend B6 / B7.
- **Verify:** both builds + typecheck green.

---

## Build order (within this plane)
```
F1 (regen)  →  F2, F3 (matching)            [after Backend B2 + Agent matching data]
F4 (chat)                                    [after Agent A12]
F5 (JD)                                      [after Agent A13]
F6 (rubric) · F7 (analytics) · F8 (SSO) · F9 (talent/bias)   [after the matching Backend tasks]
```

## Cross-side handoffs (what each task waits on)
| FE task | Waits on |
|---|---|
| F1 | Backend B2/B4/B5 protos + server-side regen |
| F2 | F1 + Agent A6–A8 (`match_results` populated) |
| F3 | F1 |
| F4 | Agent A12 (`/chat/turn` SSE) + CSP `connect-src` includes ai-agents |
| F5 | Agent A13 (`/jd/improve`) |
| F6 | F1 (rubric proto) |
| F7 | F1 (analytics proto) + Backend B4 |
| F8 | Backend B3 (`/auth/oauth/*`) |
| F9 | Backend B6 / B7 |

## Verification
1. Per task: `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` +
   `--filter @ip/ui --filter @ip/shared --filter @ip/api-client typecheck` — all green.
2. No CSP console violations on the core flows (especially F4 chat SSE + F8 SSO redirect).
3. Reuse audit: confirm no second data-fetch/error-mapping pattern was introduced.
4. Transport sanity for the gRPC surfaces stays covered by the backend smoke
   (`scripts/smoke_login.py --selftest`).
5. Deferred to live: full funnel + AI E2E against the compose stack (admin + ai-agents + Qdrant).

---

# POST-IMPLEMENTATION REVISION (2026-06-18)

F1–F9 shipped and build/typecheck green, but a two-agent audit (code + backend-contract) found the
plan over-promised in three areas relative to backend reality, plus a backlog of FE bugs. **User
decisions:** SSO → harden to production (most robust/secure/scalable); chat → keep SSE + add backend
token-streaming; score-dist → build percentiles. This revision supersedes the F1–F9 one-liners where
noted.

## A. Reconciliation (plan now matches what shipped)
- **F1** wired **4** services (recommendation, analytics, rubric, **talent**) — not 3.
- **F2** is a **dashboard section** (`recommended-roles.tsx`) that **prefills the apply box**, not a
  separate route with a job link (no public candidate job view exists). Headline is an opaque
  `Job {jobId}` → blocked on **R4** (public job view) before it's truly candidate-ready.
- **F3** is a **"Ranked" tab** on the job page; no per-row report link (the ranked `Match` has no
  `application_id`).
- **F4** is `ChatWindow` (citations inline); no separate `ChatMessage` component.
- **F9** shipped count/min/mean/max — quartiles were never built (→ **R3**).
- **F8** seeds access + an empty refresh (Slice 6 moved refresh to an HttpOnly cookie) → **R1**.

## B. Production-hardening tracks (new work; each backend slice is TDD + `bash scripts/check.sh`
green, FE verified by builds + typecheck)

### R1 — SSO production-grade (backend admin + both FE apps) [user: harden now]
Closes audit **C1** (one redirect for two apps), **C2** (empty-refresh zombie session), **H1** (dead
buttons).
- **Backend (admin):** (a) bind the OAuth `state` to an **allow-listed** target FE redirect so per-app
  callbacks route correctly (config gains an allow-list; `authorize` takes/validates a `redirect`);
  (b) `authorize` on unknown/misconfigured provider → 302 to `<fe>/auth/callback#error=...` (never a
  raw JSON 404); (c) a **provider-discovery** read (e.g. `AuthService.ListAuthProviders` or a public
  GET) returning only configured providers; (d) the **Refresh path reads the HttpOnly refresh
  cookie** — a cookie-credentialed refresh endpoint so SSO sessions silently refresh; cookie stays
  `HttpOnly+Secure+SameSite=Lax`, path-scoped.
- **FE (both apps):** gate SSO buttons on the discovered provider list (no dead buttons); the auth
  transport, when localStorage has no refresh, calls the cookie-refresh endpoint with
  `credentials:'include'`; remove the empty-refresh zombie (auth-loss → `onAuthLost` → login).
- **Verify:** `smoke_login.py --selftest` PASS; new admin tests for state↔redirect binding +
  provider discovery + cookie-refresh; FE builds green; no CSP violation on the redirect.

### R2 — Chat token streaming (ai-agents + FE) [user: keep SSE + stream]
Closes audit **H2** (one-shot "stream"). The FE `ChatWindow` already appends `text` deltas — keep it.
- **Backend (ai-agents):** the LLM seam gains a streaming method (fake seam yields tokens offline);
  `assistant_turn` streams the answer; `/chat/turn` emits incremental `text` deltas, then `citation`*,
  then `done`. Keep prompt-fencing + scope + the 502 mapping. Plan answer + citations still resolve
  before/around the stream as today.
- **FE:** keep the incremental render; add a visible streaming indicator; reconcile the error path so
  a mid-stream failure offers retry without losing the user's message (audit **H3**).
- **Verify:** ai-agents tests for streamed deltas (fake seam) + the SSE frames; gate green.

### R3 — Score-distribution percentiles (admin + FE) [user: build percentiles]
- **Backend (admin):** `ScoreDistribution` proto gains `p25/p50/p75`; the analytics resource computes
  them from the sorted scores; regen stubs (`pb`); update the servicer + tests.
- **FE:** `score-distribution-panel.tsx` renders a box-plot-style spread (min · p25 · median · p75 ·
  max) instead of just the mean marker.
- **Verify:** admin analytics tests for the percentile math; FE build green.

### R4 — Public candidate job view (admin + candidate FE) [makes F2 candidate-ready]
A read-only, candidate-safe `GetPublicJob(job_id)` (title + JD summary, comp-scoped to published
jobs) + a candidate `app/jobs/[id]` route, so recommendations show titles + a real apply link instead
of an opaque id. (Previously documented as a follow-up; promote to a tracked item.)

## C. FE code-fix backlog (no plan/contract change — fix in the implemented code)
- Invalidate `["recommendations"]` on a successful apply (candidate dashboard).
- Broaden the decision-control invalidation to `["ranked"|"reports"|"score-dist", jobId]`.
- De-duplicate `ChatCitation` (hoist to one shared type; `@ip/ui` re-declares it).
- Rubric weight: treat a cleared field as unset / validate `> 0` instead of silently coercing to `0`.
- Analytics zero-total → use the `EmptyState` component (consistency).
- Reason `<li>` keys: composite key, not the raw reason string.

## Execution order
**C** (quick FE fixes) → **R3** (percentiles) → **R2** (chat streaming) → **R1** (SSO hardening) →
**R4** (public job view). R1 is largest and most security-sensitive; it goes last so the smaller wins
land first and the backend gate stays green throughout.
