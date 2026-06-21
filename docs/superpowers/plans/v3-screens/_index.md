# Aptura v3 — Per-screen implementation plans · Index

> **What this is.** One folder per page, each holding a **frontend plan** + **backend plan**.
> The redesign is a **complete rebuild** in the **Aperture Pro** design language —
> NOT a reskin in place. Backend contracts are **frozen** (separate session owns
> `src/`, `*.proto`, `packages/api-client/src/gen/*`); these docs describe the UI to build
> and the contracts the UI consumes.

## How to use this folder

When implementing a screen, open its folder:
1. Read [`_design-language.md`](./_design-language.md) — single source of truth for tokens,
   type, components, motion, the mandatory revamp rule, the anti-fiction rule, and the
   **responsive mandate** (every screen must work on iPad / mobile / all aspect ratios).
2. Read the per-screen `frontend_<slug>.md`.
3. Read the per-screen `backend_<slug>.md` for the contract.
4. Build the backend per the contract. Build the frontend per the plan (against a typed
   mock until the BE lands).
5. Verify side-by-side against the design language demo +
   [`screenshots/`](../../../brand/redesign-v3/directions/screenshots/) at the 7 reference
   viewport sizes. Save proof under
   [`docs/brand/redesign-v3/verify/`](../../../brand/redesign-v3/verify/).

## Folder structure (per screen)

```
docs/superpowers/plans/v3-screens/
  _design-language.md       ← tokens, components, motion, responsive mandate, mandatory rebuild rule
  _index.md                 ← this spine
  _missing-pages-audit.md   ← complete flow audit (Tier 1 / 2 / 3)
  <slug>/
    frontend_<slug>.md      ← FE implementation plan (UI from scratch in Aperture Pro)
    backend_<slug>.md       ← contract the FE consumes (frozen)
```

## Prerequisites (assumed by every page)

- **Single-app unification** —
  [`../2026-06-20-aptura-single-app-unification.md`](../2026-06-20-aptura-single-app-unification.md)
  (one URL; company area under `/company/*`; role-guarded by `useRequireRole`).
- **Per-user Appearance** (theme `system | light | dark` default device, base, accent) —
  the locked Aptura defaults map to `base: aperture` + `accent: teal` from the design
  language tokens.
- **Design demo to match 1:1** —
  [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  + screenshots under
  [`docs/brand/redesign-v3/directions/screenshots/`](../../../brand/redesign-v3/directions/screenshots/).

## The 56 screens — by flow

### Public / marketing (12)

| # | Slug | Route | Status |
|---|---|---|---|
| 1 | [`landing`](./landing/frontend_landing.md) | `/` | ✅ |
| 2 | [`marketplace-search`](./marketplace-search/frontend_marketplace-search.md) | `/jobs` | ✅ live `discovery.searchJobs` |
| 3 | [`job-detail`](./job-detail/frontend_job-detail.md) | `/jobs/[id]` | ✅ |
| 4 | [`company-profile`](./company-profile/frontend_company-profile.md) | `/companies/[id]` | ✅ |
| 5 | [`trust-architecture`](./trust-architecture/frontend_trust-architecture.md) | `/trust` | 🆕 |
| 6 | [`ai-explainability`](./ai-explainability/frontend_ai-explainability.md) | `/ai-explainability` | 🆕 |
| 7 | [`what-aptura-doesnt-do`](./what-aptura-doesnt-do/frontend_what-aptura-doesnt-do.md) | `/what-we-dont-do` | 🆕 |
| 8 | [`sample-report`](./sample-report/frontend_sample-report.md) | `/sample-report` | 🆕 |
| 9 | [`request-pilot`](./request-pilot/frontend_request-pilot.md) | `/pilot` | 🆕 |
| 10 | [`waitlist`](./waitlist/frontend_waitlist.md) | `/waitlist` | 🆕 |
| 11 | [`aptura-vs-take-home`](./aptura-vs-take-home/frontend_aptura-vs-take-home.md) | `/compare/take-home` | 🆕 |
| 12 | [`accessibility-statement`](./accessibility-statement/frontend_accessibility-statement.md) | `/accessibility` | 🆕 |

### Legal / utility (4)

| # | Slug | Route | Status |
|---|---|---|---|
| 13 | [`privacy-policy`](./privacy-policy/frontend_privacy-policy.md) | `/privacy` | 🆕 |
| 14 | [`terms-of-service`](./terms-of-service/frontend_terms-of-service.md) | `/terms` | 🆕 |
| 15 | [`dpa`](./dpa/frontend_dpa.md) | `/dpa` | 🆕 |
| 16 | [`status-page`](./status-page/frontend_status-page.md) | `/status` | 🆕 (status contract TBD) |

### Auth (7)

| # | Slug | Route | Status |
|---|---|---|---|
| 17 | [`login`](./login/frontend_login.md) | `/login` | ✅ |
| 18 | [`register-candidate`](./register-candidate/frontend_register-candidate.md) | `/register` | ✅ |
| 19 | [`register-company`](./register-company/frontend_register-company.md) | `/company/register` | ✅ |
| 20 | [`forgot-password`](./forgot-password/frontend_forgot-password.md) | `/forgot` | ✅ |
| 21 | [`reset-password`](./reset-password/frontend_reset-password.md) | `/reset` | ✅ |
| 22 | [`verify-email`](./verify-email/frontend_verify-email.md) | `/verify` | ✅ |
| 23 | [`auth-callback`](./auth-callback/frontend_auth-callback.md) | `/auth/callback` | ✅ |

### Candidate (15)

| # | Slug | Route | Status |
|---|---|---|---|
| 24 | [`candidate-onboarding`](./candidate-onboarding/frontend_candidate-onboarding.md) | `/onboarding` | 🆕 |
| 25 | [`candidate-dashboard`](./candidate-dashboard/frontend_candidate-dashboard.md) | `/` (signed-in) | ✅ |
| 26 | [`candidate-profile`](./candidate-profile/frontend_candidate-profile.md) | `/profile` | ✅ |
| 27 | [`saved-jobs`](./saved-jobs/frontend_saved-jobs.md) | `/saved` | ✅ live `savedJobs.*` |
| 28 | [`job-alerts`](./job-alerts/frontend_job-alerts.md) | `/alerts` | ✅ |
| 29 | [`application-detail`](./application-detail/frontend_application-detail.md) | `/applications/[id]` | 🆕 |
| 30 | [`application-outcome`](./application-outcome/frontend_application-outcome.md) | `/applications/[id]/outcome` | 🆕 |
| 31 | [`scheduling`](./scheduling/frontend_scheduling.md) | `/schedule` | ✅ |
| 32 | [`practice`](./practice/frontend_practice.md) | `/practice` | ✅ |
| 33 | [`practice-feedback`](./practice-feedback/frontend_practice-feedback.md) | `/feedback/[id]` | ✅ |
| 34 | [`coding-assessment`](./coding-assessment/frontend_coding-assessment.md) | `/aptitude/[applicationId]` | ✅ |
| 35 | [`interview-lobby`](./interview-lobby/frontend_interview-lobby.md) | `/interview/[id]/lobby` | 🆕 |
| 36 | [`proctored-interview`](./proctored-interview/frontend_proctored-interview.md) | `/interview/[applicationId]` | ✅ |
| 37 | [`interview-completed`](./interview-completed/frontend_interview-completed.md) | `/interview/[id]/done` | 🆕 |
| 38 | [`messaging-inbox`](./messaging-inbox/frontend_messaging-inbox.md) | `/messages` | ✅ (also at `/company/messages`) |
| 39 | [`message-thread`](./message-thread/frontend_message-thread.md) | `/messages/[applicationId]` | ✅ |
| 40 | [`notifications`](./notifications/frontend_notifications.md) | `/notifications` | ✅ (also at `/company/notifications`) |

### Company (16)

| # | Slug | Route | Status |
|---|---|---|---|
| 41 | [`company-onboarding`](./company-onboarding/frontend_company-onboarding.md) | `/company/onboarding` | 🆕 |
| 42 | [`recruiter-dashboard`](./recruiter-dashboard/frontend_recruiter-dashboard.md) | `/company` | ✅ |
| 43 | [`jobs-list`](./jobs-list/frontend_jobs-list.md) | `/company/jobs` | ✅ |
| 44 | [`post-a-job`](./post-a-job/frontend_post-a-job.md) | `/company/jobs/new` | ✅ |
| 45 | [`job-edit`](./job-edit/frontend_job-edit.md) | `/company/jobs/[id]/edit` | 🆕 |
| 46 | [`job-pipeline`](./job-pipeline/frontend_job-pipeline.md) | `/company/jobs/[id]` | ✅ |
| 47 | [`applicant-report`](./applicant-report/frontend_applicant-report.md) | `/company/jobs/[id]/applicants/[appId]` | ✅ |
| 48 | [`applicant-schedule`](./applicant-schedule/frontend_applicant-schedule.md) | `…/applicants/[appId]/schedule` | 🆕 |
| 49 | [`talent-sourcing`](./talent-sourcing/frontend_talent-sourcing.md) | `/company/talent` | ✅ |
| 50 | [`company-branding`](./company-branding/frontend_company-branding.md) | `/company/branding` | ✅ |
| 51 | [`team-permissions`](./team-permissions/frontend_team-permissions.md) | `/company/team` | ✅ |
| 52 | [`analytics`](./analytics/frontend_analytics.md) | `/company/analytics` | ✅ |
| 53 | [`rubrics`](./rubrics/frontend_rubrics.md) | `/company/rubrics` | ✅ |
| 54 | [`company-billing`](./company-billing/frontend_company-billing.md) | `/company/billing` | 🆕 (contract TBD) |
| 55 | [`company-audit-log`](./company-audit-log/frontend_company-audit-log.md) | `/company/audit` | 🆕 (contract TBD or derived) |

### Settings (1, dual-role)

| # | Slug | Route | Status |
|---|---|---|---|
| 56 | [`settings`](./settings/frontend_settings.md) | `/settings` + `/company/settings` | ✅ + Appearance tab |

## Status legend

- ✅ — Plan written (existing 34 from the prior wave or carried-forward).
- 🆕 — Plan written this wave (22 new screens).

## Roll-up

- **Total screens with plans:** 56 (34 + 22).
- **Total plan files:** 112 (`frontend_*.md` + `backend_*.md` for every screen).
- **Sequenced for v3 launch:** every screen above ships as part of v3.
- **Out of scope this wave:** the 8 Tier-2 and 14 Tier-3 pages catalogued in
  [`_missing-pages-audit.md`](./_missing-pages-audit.md) — held for a follow-up wave
  pending user sign-off.

## Mandatory rules (re-stated from `_design-language.md`)

1. **Complete rebuild.** This is NOT a reskin in place. Each screen is built from scratch
   to match the Aperture Pro design language exactly.
2. **Backend contracts are frozen.** Every existing RPC, message shape, query key, and
   mock seam is reused verbatim. Backend changes are owned by a separate session.
3. **Responsive mandate.** Every screen must render correctly on iPhone SE through iPad
   Pro 12.9" in both orientations, and through 4K desktop. Every frontend plan ends with
   the verbatim 8-step Responsive verification subtask.
4. **Anti-fiction posture.** Aptura is pre-launch. No fake customer logos, fake outcomes,
   fake testimonials, fake certifications, or fake integrations. Sample data is labelled
   "Sample" / "Example".
5. **Strict proctored-interview invariants.** Camera + mic required; no mute; no
   camera-off; fullscreen-locked; on-device detectors only; HIGH-severity auto-end is
   server-authoritative. The UI must never add a control that violates these.

## Build order (waves)

1. **Foundation:** `@ip/ui` design system → tokens, sprite, fonts, shared components
   (from the landing plan's Task 1). All other plans depend on this.
2. **Public / marketing:** landing → trust-architecture → ai-explainability →
   what-aptura-doesnt-do → sample-report → request-pilot → waitlist →
   aptura-vs-take-home → accessibility-statement → privacy-policy / terms / dpa /
   status-page.
3. **Auth:** login → register-* → forgot / reset / verify / auth-callback.
4. **Candidate dashboards:** candidate-onboarding → candidate-dashboard →
   candidate-profile → saved-jobs → job-alerts.
5. **Candidate application flow:** application-detail → application-outcome → scheduling.
6. **Interview ecosystem:** practice → practice-feedback → coding-assessment →
   interview-lobby → proctored-interview → interview-completed.
7. **Messaging + notifications:** messaging-inbox → message-thread → notifications.
8. **Settings (dual-role) + Appearance.**
9. **Company:** company-onboarding → recruiter-dashboard → jobs-list → post-a-job →
   job-edit → job-pipeline → applicant-report → applicant-schedule.
10. **Company ops:** talent-sourcing → company-branding → team-permissions → analytics →
    rubrics → company-billing → company-audit-log.
