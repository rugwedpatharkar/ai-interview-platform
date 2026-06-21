# Candidate onboarding — Backend contract (v3 · frozen)

> **Screen.** `/onboarding` (first-run candidate wizard — 4 steps: role prefs → location/work-pref
> → résumé upload → consent + done). **FE consumer:** [`frontend_candidate-onboarding.md`](./frontend_candidate-onboarding.md).
> **Status:** `EXISTING — reuse v2` · **no proto delta, no new RPC, no new collection, no new
> event.** Restated from the v2 `onboarding.md` reference noted under
> [`../candidate-dashboard/backend_candidate-dashboard.md`](../candidate-dashboard/backend_candidate-dashboard.md)
> (first-run surfaces); this contract documents only what the new wizard UI consumes today.
> **Anti-fiction reminder:** Aptura is pre-launch. Any sample placeholder text inside the wizard
> (e.g., parsed-preview hints) uses generic phrasing — never fabricated company names, never
> "**Sample employer** matched your résumé." Sample data is labelled "Sample" upstream where it
> appears at all. See the anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Functionalities (what the backend provides for this page)

- **Read** the caller's current profile (so the wizard hydrates to the right starting step and
  pre-fills any prior values).
- **Update** the caller's profile in small per-step slices (so the wizard doesn't lose progress
  if the candidate closes the tab mid-flow).
- **Upload** a résumé file and return the stored object URL (step 3 only).
- *(Implicit)* The post-register router push lands on `/onboarding` when `getMyProfile()` returns
  the default-empty profile; returning candidates with `onboardingCompletedAt` set are routed
  straight to `/`. This is a 1-line FE decision in `lib/auth.tsx` — **not** a server change.

## Service & RPCs (gRPC-web; `admin` candidate-scoped — subject from bearer token)

| Function | RPC | Auth/scope |
|---|---|---|
| Get my profile | `api.profile.getMyProfile({})` → `{ profile: Profile }` | bearer, candidate; own only |
| Update my profile (per-step partial) | `api.profile.updateMyProfile({ ...partial: Partial<Profile> })` → `{ profile: Profile }` | bearer, candidate; own only |
| Upload résumé | `api.profile.uploadResume({ filename, contentBase64 })` → `{ resumeUrl: string; resumeUploadedAt: string }` | bearer, candidate; own only |

> **No new RPC.** `updateMyProfile` already accepts a partial profile; each wizard step submits
> only the fields that step owns (FE composition, no server change). The presigned-upload path
> for `uploadResume` is the **existing** profile-service path used by the regular profile screen
> today — the wizard simply calls it from step 3.

## Request / Response structures (camelCase per protobuf-es on the FE)

```ts
// profile.getMyProfile({}) →
interface Profile {
  candidateId: string;
  email: string;
  // Step 1 — role prefs
  desiredRoles?: string[];           // e.g., ["engineering","data"]
  seniority?: string[];              // e.g., ["mid","senior"]
  preferredRoleTitle?: string;
  // Step 2 — location + work pref
  location?: string;
  workPreference?: "remote" | "hybrid" | "onsite" | "flexible";
  relocateTo?: string[];
  // Step 3 — résumé
  resumeUrl?: string;
  resumeUploadedAt?: string;         // ISO timestamp
  // Step 4 — consent
  consentedAt?: string;              // ISO timestamp
  onboardingCompletedAt?: string;    // ISO timestamp — the only field the FE uses to gate the redirect-away check
}
interface GetMyProfileResponse { profile: Profile }

// profile.updateMyProfile({ ...partial: Partial<Profile> }) → { profile: Profile }
// profile.uploadResume({ filename: string, contentBase64: string }) → { resumeUrl, resumeUploadedAt }
```

- **FE mock shape:** none new — binds to the **existing** `api.profile.*` (real today). The wizard
  codes against the same shapes; nothing to mock.
- **Per-step write granularity** is a pure FE composition pattern. The server stores whatever
  partial it receives and returns the full `Profile` so the FE can refresh its cache.

## Data required

- **Read:** the `candidates` / `profiles` collection (caller-scoped; the fields above).
- **Write:** the same collection (partial updates). Reuses existing indexes — no new index.
- **Derived (FE, no backend):** the `currentStep` index (jump-to-first-incomplete logic), the
  "skipped" vs "uploaded" state on the résumé step, and the post-finish redirect — all pure
  functions of the returned `Profile`.

## Errors & edge cases

- **Auth:** missing/invalid bearer → `UNAUTHENTICATED`; non-candidate role → `PERMISSION_DENIED`.
- **Empty profile (fresh candidate)** → `getMyProfile` returns a default-empty `Profile` (no
  fields beyond `candidateId` + `email`); the FE renders the wizard on step 1.
- **Partial profile (returning candidate)** → FE hydrates to the first incomplete step (`step 1`
  if no `desiredRoles`, `step 2` if no `location`/`workPreference`, `step 3` if no `resumeUrl`
  AND not skipped, otherwise `step 4`); prior steps are marked complete in the progress strip.
- **Complete profile (already onboarded)** → `onboardingCompletedAt` is set; the FE
  defensively redirects to `/` on mount (so a bookmarked `/onboarding` URL doesn't show a stale
  wizard).
- **`updateMyProfile` error** → step-local `<Alert tone="danger">` with `errorMessage(err)`; the
  step does not advance; the form re-enables. No partial write to client state.
- **`uploadResume` error** (e.g., presign failure, network) → step-3 inline `<Alert>`; the
  candidate can retry the upload or click the "skip — I'll add this later" `.btn-ghost.btn-sm`
  link and advance to step 4 without `resumeUrl`.
- **File too large / wrong type** — caught client-side (10 MB cap; `.pdf,.doc,.docx`) and never
  reaches the network.
- **Skipped résumé** → `resumeUrl` stays empty; the recommendation engine still fires on
  step-1/step-2 signal (the dashboard's "Recommended for you" cell will be sparser but not
  broken).

## Cross-references

- Restates: v2 `onboarding.md` (first-run candidate wizard) — same fields, same partial-write
  semantics.
- Sibling screen: [`../candidate-dashboard/backend_candidate-dashboard.md`](../candidate-dashboard/backend_candidate-dashboard.md)
  (the surface candidates land on after the wizard; consumes the recommendations that this
  wizard's signals power).
- Shared service: `ProfileService` (`getMyProfile` / `updateMyProfile` / `uploadResume`) — also
  consumed by the standalone `/profile` screen (existing).
- Design language: [`../_design-language.md`](../_design-language.md). Reference demo:
  [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
