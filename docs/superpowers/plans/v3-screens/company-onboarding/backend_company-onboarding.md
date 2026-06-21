# Company onboarding — Backend contract (v3 · frozen)

> **Screen.** `/company/onboarding` company first-run wizard. **FE consumer:** [`frontend_company-onboarding.md`](./frontend_company-onboarding.md).
> **Status:** `EXISTING — reuse v2` · **no new backend, no new collection, no new RPC, no proto
> delta.** The wizard is a pure FE composition of three existing services. Restated from
> [`../register-company/backend_register-company.md`](../register-company/backend_register-company.md)
> (post-register handoff) + [`../company-profile/backend_company-profile.md`](../company-profile/backend_company-profile.md)
> (CompanyProfileService) + [`../post-a-job/backend_post-a-job.md`](../post-a-job/backend_post-a-job.md)
> (Job.CreateJob) + [`../team-permissions/backend_team-permissions.md`](../team-permissions/backend_team-permissions.md)
> (TeamService.InviteMember).
> **Anti-fiction reminder:** Aptura is pre-launch. The wizard never auto-creates a fake invite,
> a fake company profile, a fake role, or a fake billing plan. Every server write the wizard
> initiates is something the user typed and submitted. See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today.** Every dependency is **live**: `CompanyProfileService.UpsertCompanyProfile`
> + `GetCompanyProfile` + `GetLogoUploadUrl`, `Job.CreateJob`, `TeamService.InviteMember`, and
> `jd.improveJd` are all in-tree. FE codes the wizard composition; no new mock is needed.

## Functionalities

- **Seed Step 1** with the caller's existing company profile (so refreshing the wizard mid-flow
  doesn't lose what was saved).
- **Step 1 — Upsert company profile** (name, about, website, locations, logo).
- **Step 2 — Create a draft Job** (title + JD only; full additive fields are filled out later on
  `/company/jobs/new`).
- **Step 3 — Invite teammates** (`recruiter` / `hiring_manager` only — admin promotion happens
  on `/company/team`).
- **Step 4 — Render** a truthful "no active subscription" line and a deep-link to
  `/company/billing`. **No backend call** — the billing surface is admin-only and lives at its
  own route.

The wizard's **progress state** (which step the user is on, what they've completed) is
**device-local** (`localStorage`). It is **not** persisted server-side — the server's source of
truth is the four real writes above. Switching devices mid-wizard reloads the wizard at Step 1
with the already-persisted profile / role / invites visible.

## Service & RPCs (every one already exists; no proto delta)

| Step | Function | RPC / endpoint | Status | Auth / scope |
|---|---|---|---|---|
| 1 (seed) | Get company profile | `CompanyProfileService.GetCompanyProfile({ compId })` | EXISTING | bearer, manager (`recruiter` / `company_admin`); `comp_id` derived from the **token**, never the request |
| 1 (logo) | Presign logo upload | `CompanyProfileService.GetLogoUploadUrl()` → `{ uploadUrl, objectKey, expiresAt }` (existing) | EXISTING | manager + comp-scoped |
| 1 (save) | Upsert company profile | `CompanyProfileService.UpsertCompanyProfile({ name, about, website, locations[], logoKey? })` | EXISTING | manager + comp-scoped |
| 2 (AI) | Improve JD with AI | `jd.improveJd(jdText)` → ai-agents REST `{ jd_text, suggestions[] }` (same as post-a-job) | EXISTING | bearer (manager) |
| 2 (save) | Create draft job | `Job.CreateJob({ title, jdText, status: "draft" })` → `JobResponse` (status="draft", proto3 defaults for the additive marketplace fields) | EXISTING (extended in v2) | manager + comp-scoped |
| 3 (save) | Invite teammate | `TeamService.InviteMember({ email, role: "recruiter"\|"hiring_manager", tempPassword })` → `MemberDTO` | EXISTING | **`team:manage`-gated** (⇒ `company_admin` only) + comp-scoped + audited |
| 4 | (no call) | — | — | — |

**Step 3 caveat.** `TeamService.InviteMember` is `team:manage`-gated, which ⇒ `company_admin`
only. A `recruiter` who hits onboarding can fill out Step 3 but the invites will return
`PERMISSION_DENIED` — the FE surfaces a per-row toast and the user is told the truthful
explanation in the failure UI ("Inviting teammates requires an admin — ask your admin or skip
this step"). The wizard does NOT auto-skip Step 3 for recruiters (we want them to see the
invite affordance); they can Skip it cleanly. Admins (which is the typical post-register
caller, since `registerCompany` mints a `recruiter` / `company` identity with the
`company_admin` role — verify in the auth doc) execute Step 3 normally.

## Request / Response structures (camelCase per protobuf-es on the FE)

The wizard's writes ride the **existing** request shapes documented in their per-screen
contracts; this file restates only the fields the wizard fills.

```ts
// Step 1 — UpsertCompanyProfile request (subset the wizard supplies; the editor on
// /company/company-profile may carry more fields like socials, brand colors, etc.)
interface OnboardingProfileInput {
  name: string;          // required, ≤ 200 chars
  about?: string;        // optional, ≤ 600 chars
  website?: string;      // optional, must start with https?://
  locations: string[];   // parsed via parseSkills (comma-split + trim + dedupe)
  logoKey?: string;      // optional, from GetLogoUploadUrl response (objectKey)
}

// Step 2 — CreateJob request (subset the wizard supplies; post-a-job adds the rest)
interface OnboardingDraftJobInput {
  title: string;         // required
  jdText: string;        // required; may be seeded from jd.improveJd
  status: "draft";       // fixed — wizard never publishes
  // Additive marketplace fields (city / region / country / remote_mode / employment_type /
  // salary_* / skills / gate_mode) are intentionally OMITTED; the server applies proto3
  // defaults (gate_mode → "auto" per proto3, but the post-a-job form re-saves with the
  // FE-default "advisory" when the user finishes posting).
}

// Step 3 — InviteMember request (per row; the wizard sends N of these in Promise.all)
interface OnboardingInviteRow {
  email: string;                                  // EMAIL_RE validated client-side
  role: "recruiter" | "hiring_manager";           // curated — never company_admin
  tempPassword: string;                            // client-generated (≥ 12 chars, mixed)
}
```

**Step 4 has no request — it's a deep-link only.** The billing surface owns its own contract;
the wizard never calls billing today.

## Data required

- **No new collection.** Every write lands on collections already owned by their respective
  services:
  - `company_profiles` (`CompanyProfileService`).
  - `jobs` (`Job.CreateJob` — `status="draft"`, no `posted_at`, additive marketplace fields
    proto3 default).
  - `users` (`TeamService.InviteMember` — extended `User` with `status="pending"` /
    `last_active_at=""` / `invited_by=<caller>`); audited via `AuditLogRepository`
    (`member_invited`).
- **Device-local progress key** — `localStorage["aptura.onboarding.progress.v1"]`. FE only,
  never round-trips to the server.
- **No new index, no new event, no new metric.** Onboarding completion is **not** reported as a
  product metric server-side today; if a future analytics need arises, derive it from
  `company.created_at` + `company_profiles.updated_at` + the first `Job` + the first
  `member_invited` audit event — all already in-tree. **Out of scope for this wizard.**

## Errors & edge cases

| Step | Surface | Behavior |
|---|---|---|
| 1 | `INVALID_ARGUMENT` (name empty / website not URL / about too long) | inline field error + step does not advance |
| 1 | `UNAVAILABLE` (object storage down on logo PUT) | retryable toast "Upload failed — please try again"; profile save still succeeds without logo |
| 2 | `INVALID_ARGUMENT` (title empty / JD empty) | inline field error |
| 2 | `UNAVAILABLE` (ai-agents JD-improve down) | toast "AI suggestions unavailable right now — your draft is fine"; the JD textarea remains editable, the user can submit unchanged |
| 3 | `PERMISSION_DENIED` (caller is a recruiter, not an admin) | per-row toast "Inviting teammates requires an admin — ask your admin or skip this step" |
| 3 | `ALREADY_EXISTS` (duplicate email) | per-row error inline; other rows continue |
| 3 | `INVALID_ARGUMENT` (bad role somehow — should never happen since the FE select is curated) | per-row error inline |
| 4 | — | no server call; truthful "No active subscription — talk to us about a pilot" copy + deep-link to `/company/billing` |
| Any | network error / 5xx | the failed step does not advance; the wizard preserves the form values; the progress key is **not** mutated until success |
| Any | refresh / device change | localStorage rehydrates the step; the form re-fetches `["company-profile","me"]` to repopulate Step 1; the wizard does not lose user input |

## Cross-references

- Restates / reuses verbatim:
  - [`../register-company/backend_register-company.md`](../register-company/backend_register-company.md) — the upstream handoff (post-register lands here, optionally).
  - [`../company-profile/backend_company-profile.md`](../company-profile/backend_company-profile.md) — `CompanyProfileService.UpsertCompanyProfile` + `GetCompanyProfile` + `GetLogoUploadUrl`.
  - [`../post-a-job/backend_post-a-job.md`](../post-a-job/backend_post-a-job.md) — `Job.CreateJob` (status="draft" branch).
  - [`../team-permissions/backend_team-permissions.md`](../team-permissions/backend_team-permissions.md) — `TeamService.InviteMember`.
  - [`../company-billing/backend_company-billing.md`](../company-billing/backend_company-billing.md) — Step 4's deep-link target (NEW scope, contract TBD).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- Pillar: this wizard surfaces the **post-register handoff** for the company-side flow; the
  candidate-side handoff is owned by `register-candidate` + its first-login experience.
