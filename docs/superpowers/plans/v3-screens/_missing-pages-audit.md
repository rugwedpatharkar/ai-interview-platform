# Aptura v3 — Missing-pages audit

> **Purpose.** The v3-screens index documents 34 screens. End-to-end audit of the
> candidate + recruiter flows (and the public/legal surfaces a real product needs)
> identifies **22 more screens** that must ship for the product to feel complete.
> This doc maps every gap by tier and parent flow.

## Methodology

Walked the **complete candidate journey** (discovery → register → onboard → apply →
assessment → interview → outcome → re-engage) and the **complete recruiter journey**
(register → workspace setup → post role → review pipeline → decide → schedule → audit →
billing) against the existing 34 screens. Identified each surface a real user expects
but the v3-screens index doesn't currently plan for.

Tiering rule:
- **Tier 1 (10 pages)** — without this page, the flow is BROKEN. Write now.
- **Tier 2 (8 pages)** — the flow works without it but feels incomplete. Write next.
- **Tier 3 (14 pages)** — utility / brand / legal / standard. Write when needed for launch.

The cross-cutting public/marketing pages the user already approved as "the 8 extras"
are folded in below — they're Tier 1 by virtue of being directly linked from the
landing.

---

## Candidate flow — end to end

```
PUBLIC          AUTH               ONBOARD       APPLY               ASSESS                 INTERVIEW                       OUTCOME                        ONGOING
landing      → login           → onboarding* → marketplace-search → coding-assessment  → interview-lobby*  → outcome → application-detail* → re-engage
jobs/[id]    → register         (NEW)          job-detail            practice              interview/[id]   (NEW)     (NEW)               messaging
companies/   → forgot/reset                    application-detail*   practice-feedback     interview-done*                                  notifications
              verify/callback                  (NEW)                                       (NEW)                                            settings
                                                                                           interview-resume**                              candidate-profile
                                                                                                                                            saved-jobs
                                                                                                                                            job-alerts
                                                                                                                                            scheduling
```

`*` = Tier 1 (writing now)  ·  `**` = Tier 2 (write next)

### Candidate gaps identified

| # | Slug | Route | Tier | Parent flow | Rationale |
|---|---|---|---|---|---|
| 43 | `candidate-onboarding` | `/onboarding` | **1** | After `/register` | Without it, new candidates land on a dashboard with nothing populated. Wizard: role prefs · location · resume parse · consent · first-time tour. |
| 44 | `application-detail` | `/applications/[id]` | **1** | Per-application | Today the dashboard lists applications but there is no per-application detail surface. Carries timeline / status history / scheduled events / messages / report (when published). |
| 45 | `application-outcome` | `/applications/[id]/outcome` | **1** | Post-decision | The literal "every applicant answered" surface. Verdict + reason + (optional) report + re-score CTA. Makes the no-ghosting promise tangible. |
| 46 | `interview-lobby` | `/interview/[id]/lobby` | **1** | Before the live room | Device check + ID match + acknowledgement gate. Currently folded into `proctored-interview`; splitting it makes the flow + plan testable. |
| 47 | `interview-completed` | `/interview/[id]/done` | **1** | After the live room | Clean exit surface: "interview captured · report due in ~X · what to expect next." Counterpart to the lobby. |
| — | `interview-resume` | `/interview/[id]/resume` | 2 | Connection-drop recovery | Re-entry surface when the candidate drops mid-interview. Could be modal inside `proctored-interview` or its own route. |
| — | `rescore-request` | `/applications/[id]/rescore` | 2 | Post-outcome | Re-score request with new context (changed role / new evidence). |
| — | `application-withdraw` | `/applications/[id]/withdraw` | 2 | Per-application | Withdrawal confirmation. Could be a modal inside `application-detail` — call here for completeness. |
| — | `candidate-help` | `/help` | 2 | Cross-cutting | Help center / FAQ for candidates. |
| — | `data-export` | `/settings/export` | 3 | Privacy | Right-to-erase + data export. Could be a tab inside `settings`. |

---

## Recruiter / company flow — end to end

```
PUBLIC          AUTH                  ONBOARD             POST                 PIPELINE              REVIEW + DECIDE             OPS                              BILLING + LEGAL
landing      → /company/register   → company-          → post-a-job        → job-pipeline        → applicant-report          → talent-sourcing             → company-billing*
companies/     login                  onboarding*       jobs-list            applicant-           [report + integrity         company-branding              audit-log* (NEW)
                                      (NEW)             job-edit*            schedule*            timeline + decision]        team-permissions              integrations**
                                                        (NEW)                (NEW)                                            rubrics                        privacy/terms/dpa*
                                                                                                                              analytics                      (NEW)
                                                                                                                              messaging                      
                                                                                                                              notifications                  
                                                                                                                              recruiter-dashboard            
                                                                                                                              settings                       
```

`*` = Tier 1 (writing now)  ·  `**` = Tier 2 (write next)

### Recruiter gaps identified

| # | Slug | Route | Tier | Parent flow | Rationale |
|---|---|---|---|---|---|
| 48 | `company-onboarding` | `/company/onboarding` | **1** | After `/company/register` | Without it, new companies can't set up the workspace. Wizard: company profile · first role · invite team · billing setup. |
| 49 | `job-edit` | `/company/jobs/[id]/edit` | **1** | Per-job | Dedicated edit surface — `/company/jobs/[id]` is the pipeline view, can't be both. |
| 50 | `applicant-schedule` | `/company/jobs/[id]/applicants/[appId]/schedule` | **1** | Per-applicant | Recruiter-side scheduling for a specific applicant. Sister to candidate `/schedule`. |
| 51 | `company-billing` | `/company/billing` | **1** | Workspace | Subscription / invoices / payment method / usage. Needed for paid pilots even at pre-launch. |
| 52 | `company-audit-log` | `/company/audit` | **1** | Workspace | The decision audit trail viewer. Directly backs the "every decision is logged" promise the landing makes. Without it the promise is hollow. |
| — | `company-integrations` | `/company/integrations` | 2 | Workspace | ATS connector setup — even as "Coming soon" the roadmap surface is needed. |
| — | `workspace-settings` | `/company/settings/workspace` | 2 | Workspace | Company-level locale · timezone · data-residency · default rubric. Separate from per-user `/company/settings`. |
| — | `team-roles-config` | `/company/team/roles` | 2 | Workspace | Define custom roles (beyond `recruiter` / `company_admin`). |
| — | `company-help` | `/help` (recruiter slant) | 2 | Cross-cutting | Recruiter help center. |
| — | `company-webhooks` | `/company/webhooks` | 3 | Integrations | Webhook config. Likely rolls under `company-integrations`. |
| — | `job-preview` | `/company/jobs/[id]/preview` | 3 | Per-job | Preview before publish. Probably a modal inside `post-a-job`, not a route. |
| — | `applicant-bulk-actions` | within pipeline | 3 | Per-job | Bulk-export / bulk-decline. Probably an action bar in pipeline, not a route. |

---

## Cross-cutting / public / legal — directly linked from landing

| # | Slug | Route | Tier | Parent flow | Rationale |
|---|---|---|---|---|---|
| 35 | `trust-architecture` | `/trust` | **1** | Landing mega-nav | "How proctoring works — and what it doesn't do." The privacy-architecture page. |
| 36 | `ai-explainability` | `/ai-explainability` | **1** | Landing mega-nav | The AI Explainability Statement surface. |
| 37 | `what-aptura-doesnt-do` | `/what-we-dont-do` | **1** | Landing mega-nav | The constraints-as-features / privacy-inversion page. |
| 38 | `sample-report` | `/sample-report` | **1** | Landing hero CTA | Public viewer of the sample evidence report shown in the landing demo. Directly linked from the hero "See a sample report" button. |
| 39 | `request-pilot` | `/pilot` | **1** | Landing CTA | Pilot-intake form (company side). The primary conversion path. |
| 40 | `waitlist` | `/waitlist` | **1** | Landing CTA | Candidate waitlist signup. The primary candidate conversion path. |
| 41 | `aptura-vs-take-home` | `/compare/take-home` | **1** | Landing footer | The "vs the old way" comparison page (footer link). |
| 42 | `accessibility-statement` | `/accessibility` | **1** | Landing footer | Public a11y statement (WCAG 2.2 AA target). |
| 53 | `privacy-policy` | `/privacy` | **2** | Footer · legal | Required for any production product. |
| 54 | `terms-of-service` | `/terms` | **2** | Footer · legal | Required. |
| 55 | `dpa` | `/dpa` | **2** | Footer · legal | Data Processing Agreement — B2B legal required for company pilots. |
| 56 | `status-page` | `/status` | **2** | Footer | System status / incident history. Pre-launch can be a static "All systems normal" page. |
| — | `cookie-policy` | `/cookies` | 3 | Footer · legal | Cookie disclosure. |
| — | `about` | `/about` | 3 | Brand | About Aptura. |
| — | `careers` | `/careers` | 3 | Brand | Aptura's own hiring page (use Aptura to hire for Aptura). |
| — | `press` | `/press` | 3 | Brand | Press kit (post-launch). |
| — | `changelog` | `/changelog` | 3 | Brand | Public product changelog. |
| — | `not-found` | `/_not-found` | 3 | Utility | 404 page (Aperture-branded). |
| — | `forbidden` | `/_forbidden` | 3 | Utility | 403 / role-denied. |
| — | `error` | `/_error` | 3 | Utility | 500 / unexpected error. |
| — | `logout` | `/logout` | 3 | Utility | Sign-out confirmation. |

---

## Roll-up

| Tier | Count | Status |
|---|---|---|
| **Existing v3-screens** | 34 | ✅ Plans written |
| **Tier 1 (this wave)** | 22 | 🟢 Writing now — 8 public/marketing + 5 candidate + 5 company + 4 legal |
| **Tier 2 (next wave)** | 8 | ⏳ Awaiting sign-off |
| **Tier 3 (eventually)** | 14 | ⏳ Awaiting sign-off |
| **Grand total** | **78** | The complete product surface |

This wave delivers 34 + 22 = **56 screens with plans** — the v3 launch baseline. Tier 2
and Tier 3 follow per the user's go-ahead.

## Glossary — flow conventions

- **Tier 1**: removing this page breaks the user's ability to complete a core task. Must
  ship for v3 launch.
- **Tier 2**: the flow works but feels incomplete. Ship for v3 launch if time allows;
  otherwise post-launch.
- **Tier 3**: legal compliance, branding, or graceful-degradation surfaces. Ship when
  needed; not blocking.

## What to read next

- The 22 new plans live one folder up per screen: `docs/superpowers/plans/v3-screens/<slug>/`.
- Single source of truth: [`_design-language.md`](./_design-language.md) — now includes the
  hard responsive mandate that every plan inherits.
- Worked example template: [`landing/frontend_landing.md`](./landing/frontend_landing.md).
- Design demo: [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
