# Aptura — v2 Completeness Audit (gaps + fitting additions)

> **Goal: make v2 "proper, perfect, accurate — provides everything."** Two parts:
> **Part A** = features that fit v2 perfectly but aren't planned (add these), **Part B** = where the
> existing v2 plans are weak/underspecified (fix these). Verified by reading every v2 doc + the
> codebase. This re-scopes v2 from "the 9 pillars" to "**v2 complete**" = pillars + Part A
> (core/should) + Part B fixes; the *later* tier is a documented backlog.

---

## Part A — Additions that fit v2 (to "provide everything")
*(Each verified NOT already planned. Format: feature — attaches to — why.)*

### Core (needed for a real launch)
1. **Account settings & security** — *new auth-extension* — notification preferences, 2FA, password/
   email change (re-verify), active-session list + revoke. (Today `/account` only has consent + erasure.)
2. **Team & roles/permissions depth** — *Inc 0 / auth* — seat management (active/pending/revoked),
   an RBAC matrix (admin vs recruiter vs hiring-manager: post / review / decide / analytics / team),
   per-job scoping. (Today `InviteRecruiter` is a single email+temp-password.)
3. **Interview scheduling / calendar** — *Pillar C ext / new module* — book a live interview after the
   AI assessment passes; availability, timezone, reminders, reschedule. (The async/voice pillars emit a
   "ready for live" signal but nothing coordinates the next step.)
4. **Rate-limiting + security hardening on the new endpoints** — *cross-cutting (reuse `RateLimiter`)* —
   discovery/search, messaging, notifications, public `/public/*` are new attack surfaces (scrape/DoS/
   brute-force). Wire per-IP + per-user limits + opaque 429s.
5. **Observability & health checks** — *per-pillar (B/C/D)* — structured logging + tracing seams +
   `/health` for the new infra (code sandbox, video transcode, practice agent); error budgets.
6. **Onboarding / first-run** — *Inc 1 + Inc 0* — candidate (profile-completeness checklist, "find
   jobs", practice teaser) and employer (post-first-job wizard, team invite, gate-mode default,
   consent template) guided flows + empty states.

### Should-have (production polish)
7. **Email/SMS channels + digests + preferences + unsubscribe** — *Pillar D ext* — SMS for critical
   alerts; daily/weekly digests; CAN-SPAM/GDPR unsubscribe; templates; delivery analytics.
8. **Employer branding depth** — *Pillar A ext (`company_profiles`)* — about/mission, hiring SLA,
   "actively reviewing" badge, team bios, social links; a recruiter branding editor.
9. **Candidate comparison (side-by-side)** — *recruiter polish* — open 2 reports together for shortlisting.
10. **Bulk actions** — *recruiter polish* — batch reject / batch schedule from the applicant queue.
11. **Job templates** — *Pillar A* — reusable JD + default fields per role.
12. **Offer management / letters** — *new (funnel extension)* — send offer (PDF/email), track accept/
    decline/expire; a natural `ApplicationState` extension after `hired`.
13. **Candidate status / availability** — *profile + Pillar A* — "actively looking / passive"; a search
    + outreach-relevance signal.
14. **Saved-search alert DELIVERY** — *Pillar A + scheduler* — `job_alerts` persistence is designed, but
    the **scheduled "run alerts → notify" job is missing** (bolt onto the existing scheduler loop).
15. **Search at scale** — *Pillar A refinement* — typo tolerance ("pyton"→"python"), query expansion
    ("JS"→"JavaScript"), recency/relevance boosting; the next gate after Qdrant rerank.
16. **Candidate availability windows** — *Pillars C/D* — timezone/window for async-video + practice.

### Later (post-launch backlog — not launch-blocking)
17. Help / support (FAQ, contact). 18. **API / webhooks / ATS integrations** (Greenhouse/Lever/Workable).
19. **i18n / localization** (multi-language, currency, locale). 20. **Accessibility / WCAG 2.1 AA audit**
(formal). 21. **Billing / plans / seats** (Stripe; the `Company.plan` field exists, demo runs free).
22. **Data export & advanced reporting** (candidate transcript PDF, recruiter CSV, GDPR SAR ZIP).

---

## Part B — Gaps in the existing v2 plans (make them accurate)
*(40+ concrete fixes from the audit. Resolve each in its pillar's plan before that pillar is built.)*

### 🔴 Blocking (fix before implementing the affected pillar)
- **Inc 0 — erasure cascade:** define delete **order + atomicity** (single Mongo txn?) + the failure/
  recovery model; add the "skips an absent/None repo gracefully" test.
- **Inc 1 — `$text` search:** define the **secondary sort / tie-break** when textScore ties (recency?).
- **Inc 1 — `posted_at` migration:** **backfill** legacy jobs (no `posted_at`) or the `recent` sort breaks.
- **Inc 2 — grader error contract:** `grade_coding` on sandbox failure must surface **ungraded/retryable,
  never score 0** — name the exception + how the caller handles "ungraded."
- **Sandbox — error taxonomy:** crisp boundary between `SandboxError` (infra) and a candidate failure
  (compile error/timeout); container-crash case classified.
- **Inc 4 messaging — read state:** reconcile **message-level `read_at` vs thread-level unread counters**;
  add `IndexSpec("messages", [("thread_id",1),("created_at",1)])`.

### 🟠 High (clarify before design sign-off)
- **Inc 1:** name **every field excluded** from each public DTO (+ grep-test); Qdrant rerank **freshness/
  consistency** (edit storms, upsert-fail desync); **logo upload** type/size validation; define the
  `SearchCandidates` universe; document `/public/*` **CDN staleness** (60s) tradeoff.
- **Inc 2:** **per-section weighting** formula + pass-threshold worked examples; **coding test-case
  weighting** exact formula (visible vs hidden); **free-text rubric** format + grading prompt + a test;
  **mixed-bank per-kind idempotency** logic (how it knows which kinds exist).
- **Sandbox:** name the **output cap N**; the **language→image** map (exact image URIs); justify the
  resource limits; assert **one-container-per-run**; add a **cross-tenant leak** test.
- **Inc 4 notifications:** **email retry** policy; the `_MESSAGES` **schema**; **dedup/idempotency** on
  redelivery; **deep-link** resolution per kind; `unread_count` freshness.
- **Inc 5:** the **feedback calc** (what score = a "gap") + an example; the **topic→JD synthesis** prompt;
  the **skill-gap UX surface** (a `/feedback/[id]` page?); a **practice-history** list API; the
  status-transition order.
- **Inc 6 video:** **airtight `object_key`** ownership validation (+ test); **codec enforcement**
  (Safari AAC vs Chrome Opus); **STT error vs empty** differentiation; **presigned size limit**; **clip
  retention/erasure**; a **`test_no_frame_processing`** guard (never analyze video frames).
- **Integrity-by-design:** the **generic-answer heuristic + threshold**; the **consistency-severity**
  algorithm; **define the watermark**; rotation **seed immutability** when the bank grows; where the
  **tunable threshold** lives.

### ⚪ Cross-cutting / data-model / testing
- Erasure **atomicity** (above); **retention/TTL** for `notifications` + practice + video (unbounded
  growth); **index migration** strategy (online builds block writes on big collections); a **forged-
  `comp_id` rejection** integration test; the **`Notifier` contract is too narrow** — pass the full
  notification row, not just `(subject, body, recipient)`; a **consolidated rate-limit** policy table;
  **observability/alerting** for best-effort async ops; **UTC** timezone discipline; **capacity/growth**
  estimates; **denormalization staleness** rules; **E2E**, **legacy-migration**, **concurrency**, and
  **load** tests named.

---

## How to fold this in (recommendation)
1. **Amend each pillar plan** with its Part B fixes (mostly resolve its "Open questions/risks" + add a
   task or two). Small, surgical edits — no rewrites.
2. **Add new module specs** for the Part A *core* items that don't attach cleanly:
   `settings-and-security`, `team-and-permissions`, `interview-scheduling`, `onboarding`, and a
   cross-cutting `platform-hardening` (rate-limits + observability + retention + index-migration + the
   Notifier-contract widening).
3. **Re-scope v2 → "v2 complete":** the 9 pillars + Part A (core + should-have) + Part B fixes. The
   *later* tier (billing, i18n, a11y, API/webhooks, export) is a tracked backlog, not in the launch cut.
4. Build order is unchanged (the additions attach to their pillars); the new modules slot as: hardening
   + onboarding alongside Inc 0–1, scheduling alongside Pillar C, settings/team early.

> **Net:** with Part A (core/should) added and Part B resolved, v2 goes from "a strong feature set" to
> "a complete, production-grade product that provides everything" — minus only the deliberately-cut
> compliance features (ID verification, background checks, biometric proctoring) and the *later* backlog.
