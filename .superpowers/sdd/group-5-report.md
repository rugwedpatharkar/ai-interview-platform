# Group 5 Report — Company Onboarding Finish RPC Wiring

## RPCs Used

### 1. `api.companyProfile.upsertCompanyProfile`
- **Gen file:** `frontend/packages/api-client/src/gen/company_profile_pb.ts`, line 217
- **Request shape:** `{ about: string, website: string, logo: string, locations: string[] }`
- **Mapping:** `companyName` → `about`, `companyWebsite` → `website`, `companyLogoUrl` → `logo`, `locations: []` (wizard collects no location data)

### 2. `api.jobs.createJob`
- **Gen file:** `frontend/packages/api-client/src/gen/job_pb.ts`, line 452
- **Request shape:** `{ title, jdText, skills[], city, region, country, remoteMode, employmentType, salaryMin: bigint, salaryMax: bigint, salaryCurrency, gateMode }`
- **Mapping:** `roleTitle` → `title`, `roleSkillsRaw` (comma-split, lowercased) → `skills[]`, all other fields sent as empty/zero (optional per proto comment "Additive marketplace fields (all optional)")

### 3. `api.team.inviteMember`
- **Gen file:** `frontend/packages/api-client/src/gen/team_pb.ts`, line 236
- **Request shape:** `{ email: string, role: string, tempPassword: string }`
- **Mapping:** each valid email from `teamEmails`, `role: "recruiter"` (wizard has no role picker), `tempPassword: ""`

## Wizard Fields That Did NOT Map

| Wizard field | Reason not mapped |
|---|---|
| `companyName` | Not in `UpsertCompanyProfileRequest` — name is set at company registration; `about` is the closest field and is used for the company "about" blurb. The profile name is derived from auth/registration. |
| `locations` | Wizard has no location input — sent as `[]` |
| `roleSkillsRaw` (as raw string) | Split into array and lowercased before sending as `skills[]` |
| All job marketplace fields (city, region, remoteMode, etc.) | Wizard doesn't collect them — sent as empty strings / `BigInt(0)` |
| `teamEmails` role | Wizard has no role picker — defaulted to `"recruiter"` |
| `tempPassword` | Wizard doesn't generate/collect one — sent as `""` (server likely handles this) |

## Partial-Failure Behavior

- Profile failure → `toast.error(errorMessage(err))`, `setSaving(false)`, return early; state is NOT cleared so user can retry
- Profile success → `clearState()` immediately (so state is safe regardless of what follows)
- Job or invite failure → tracked in `failures[]` array; after all best-effort calls complete, if `failures.length > 0` show `toast.warning(...)` listing what to retry from Settings, then `router.push('/company')` — user is never stranded mid-onboarding

## Typecheck Summary

- `@ip/api-client`: 0 errors
- `@ip/candidate`: 1 pre-existing error in `hiring-teams-sections.tsx` (line 1121, type mismatch in unrelated marketing component, committed in `a7f7a0c`); 0 errors in `onboarding/page.tsx`
- `@ip/company`: 2 pre-existing errors in `packages/ui/src/layout.tsx` and `notification-bell.tsx` (committed in `182210c`); unrelated to this change

All errors are pre-existing. No errors introduced by this change.
