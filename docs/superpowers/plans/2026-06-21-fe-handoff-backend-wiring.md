# FE Handoff — Backend wiring (2026-06-21)

**From:** backend session (branch `claude/laughing-wing-6c1f81`, all commits pushed, full gate green).
**To:** the frontend session.
**TL;DR:** the backend is complete for v2 **and** v3. Two NEW/CHANGED contracts landed today that need FE wiring (**preferences**, **practice**), plus a backlog of already-shipped admin services that still read mocks. All work below is **frontend-only** — no backend changes needed. Every gRPC client is already generated under `frontend/packages/api-client/src/gen/*_pb.ts`.

---

## 0. The wiring pattern ("the quad")

`frontend/packages/api-client/src/index.ts` is the single wiring point. To expose a generated service, add it in **four** places. Admin services go on the **admin** transport (`AdminClients` / `clientsFromTransport`); ai-agents services go on the **ai-agents** transport (`AiAgentsClients` / `aiAgentsClientsFromTransport`, `NEXT_PUBLIC_AIAGENTS_URL`). Apps consume everything via `useAuth().api.<name>.*`.

```ts
// (a) import        — with the other admin (or ai-agents) imports
import { SettingsService } from "./gen/settings_pb.js";
// (b) re-export
export * from "./gen/settings_pb.js";
// (c) interface     — AdminClients (admin) OR AiAgentsClients (ai-agents)
settings: Client<typeof SettingsService>;
// (d) factory       — clientsFromTransport (admin) OR aiAgentsClientsFromTransport (ai-agents)
settings: createClient(SettingsService, transport),
```

Then flip the screen: delete its `makeMock*()` / `NEXT_PUBLIC_MOCK` branch and call `useAuth().api.<name>.*`.

**Gotchas:** protobuf-es accessors are **camelCase** (proto `accent_hue` → `accentHue`, `jd_text` → `jdText`). Errors are **gRPC status codes** (via `ConnectError.code`), not HTTP status. Per project memory: keep `lucide-react` imports inside the app (not `@ip/ui`); never run `next build` while `pnpm dev` is live.

**Verify after each change:** `npx pnpm@9.15.0 --filter @ip/api-client typecheck` then `--filter @ip/{candidate,company} build`.

---

## 1. NEW — `preferences` (v3 Appearance) · admin transport

Backs the v3 **Appearance** settings tab. Persisted per user, token-scoped (serves candidate + company). Gen: `gen/preferences_pb.ts`.

**Service** `admin.preferences.v1.PreferencesService` →
- `getAppearance(GetAppearanceRequest{})` → `Appearance`
- `updateAppearance(Appearance)` → `Appearance` (returns the stored value)

**`Appearance`** (camelCase): `mode`, `base`, `accent`, `accentHue: number`.
- `mode`: `system | light | dark` (default `system`)
- `base`: `midnight | azure | mint | slate` (default `midnight`)
- `accent`: `cyan | lime | emerald | amber | coral | azure | custom` (default `cyan`)
- `accentHue`: 0–359; **only meaningful when `accent === "custom"`** (the server sends `0` and ignores it otherwise — don't render the hue picker unless accent is custom).
- A fresh user → defaults `{system, midnight, cyan, 0}`. A bad enum → `INVALID_ARGUMENT`.

**FE work:** wire the `preferences` quad (admin). Build the Appearance tab (segmented mode control, base + accent swatch pickers, custom-hue slider shown only for `custom`, live preview). Bind `useAuth().api.preferences.{getAppearance, updateAppearance}`. Apply to the pre-paint `appearanceScript` so there's no FOUC. Spec: `docs/superpowers/plans/2026-06-20-v3-redesign-and-appearance.md` Phase C + `docs/superpowers/plans/v3-screens/settings/backend_settings.md` Part 2.

---

## 2. CHANGED (BREAKING) — `practice` is now gRPC, not REST · ai-agents transport

The candidate practice mock-interview **moved off REST**. The old `/practice/*` FastAPI endpoints are **gone**; the existing practice REST seam (`makePracticeClient` / direct `fetch` to `/practice/...`) must be **removed** and replaced with the gRPC client. Gen: `gen/practice_pb.ts`.

**Service** `aiagents.practice.v1.PracticeService` (on the **ai-agents** transport) →
- `startPractice(StartPracticeRequest{topic, jdText})` → `QuestionResponse{practiceId, question}` — provide **exactly one** of `topic` / `jdText` (else `INVALID_ARGUMENT`).
- `submitPracticeTurn(SubmitPracticeTurnRequest{practiceId, answer})` → `TurnResponse{done, question}`.
- `listPracticeSessions(ListPracticeSessionsRequest{})` → `PracticeSessionList{sessions: {practiceId, roleLabel, createdAt}[]}`.
- `getPracticeFeedback(GetPracticeFeedbackRequest{practiceId})` → `PracticeFeedback{evaluationSummary, feedback: GrowthFeedback{summary, strengths[], gaps[], suggestedTopics[]}}`.

**Error mapping changed (HTTP → gRPC code):**
- blank / oversized answer: was HTTP 422 → now `INVALID_ARGUMENT`.
- not your session: was 403 → `PERMISSION_DENIED`.
- not found: was 404 → `NOT_FOUND`.
- **still finalizing** (poll for feedback): was 409 → `FAILED_PRECONDITION` — keep the "feedback not ready, retry" polling on this code.

**FE work:** wire the `practice` quad into **`AiAgentsClients` / `aiAgentsClientsFromTransport`** (NOT AdminClients). Delete the REST practice client/seam. Flip the practice screen + feedback view to `useAuth().api.practice.*`. The response shape is unchanged in spirit; just map camelCase fields.

---

## 3. BACKLOG — shipped admin services still on mocks (wire the quad + flip)

These are fully implemented + gate-green on the backend; the FE just needs the quad + a mock→real flip per screen. All are **admin** transport. Grep each app for `makeMock*` / `NEXT_PUBLIC_MOCK` to find the flip site.

| Client (quad name) | gen file | Service | Screen(s) to flip |
|---|---|---|---|
| `settings` | `settings_pb.ts` | `SettingsService` (notif prefs, TOTP 2FA, password/email change, sessions) | `*/app/settings` (Account / Email / Sessions / 2FA tabs) |
| `team` | `team_pb.ts` | `TeamService` | `company/app/team` roster + invite/role |
| `scheduling` | `scheduling_pb.ts` | `SchedulingService` | `*/app/schedule` (propose/choose/ICS) |
| `messaging` | `messaging_pb.ts` | `MessagingService` | messaging inbox + conversation |
| `notification` | `notification_pb.ts` | `NotificationService` | bell + notifications center |
| `savedJobs` | `saved_jobs_pb.ts` | `SavedJobsService` | candidate `/saved` + SaveJob button |
| `jobAlerts` | `job_alerts_pb.ts` | `JobAlertsService` | candidate `/alerts` |
| `sourcing` | `sourcing_pb.ts` | `SourcingService` | `company/app/talent` |
| `companyProfile` | `company_profile_pb.ts` | `CompanyProfileService` (Get + **Upsert** + **PresignLogoUpload**) | company branding editor; authed company page (public page already uses `/public/companies/{id}` SSR) |
| `coding` | `coding_pb.ts` | `CodingService` (GetCodingTask / RunCode / SubmitCoding) | candidate coding-assessment (Run + Submit) |
| `discovery` | `discovery_pb.ts` | `DiscoveryService` (authed SearchJobs) | optional — the marketplace already uses the public `/public/jobs` SSR; only needed for an authed deep-link path |

Notes: `companyProfile.presignLogoUpload(content_type)` returns `{uploadUrl, objectKey}` — `PUT` the logo bytes to `uploadUrl`, then `upsertCompanyProfile({about, website, logo: objectKey, locations})`. `coding.runCode` is ephemeral (no grade); `submitCoding` grades hidden cases + typed answers (the answer key never crosses the wire).

---

## 4. What stays HTTP (do NOT try to call over gRPC)

These remain REST by design — clients should keep using them as-is:
- **`/public/*`** (marketplace SEO/SSR) — crawlable JSON; the candidate marketplace SSR already consumes it.
- **`/auth/oauth/*`** (SSO) — browser redirect dance + the HttpOnly refresh cookie + `/auth/oauth/refresh` (POST, credentialed). Unchanged.
- The LiveKit webhook + `/health` are server-internal (no FE involvement).

---

## 5. Definition of done

- `api-client` typechecks with `preferences` + `practice` + the backlog clients wired.
- Both apps build green (`--filter @ip/{candidate,company} build`).
- The practice screen no longer references the old REST `/practice/*` path; it uses `api.practice.*` and handles `FAILED_PRECONDITION` as "feedback finalizing, poll".
- The Appearance tab reads/writes `api.preferences.*` and applies mode/base/accent (+ custom hue) with no FOUC.
- Each flipped screen renders real data (mock branch removed).
