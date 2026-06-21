# Candidate profile — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Candidate's general recruiting profile editor: résumé upload → async AI parse → editable basics / skills / experience / education, with a server-computed completeness score. Rebuild inside the **Aperture Pro** app shell as a bento of `.cell` editor cards anchored by a `.ring`-driven completeness gauge and a parse-state `.cell.anchor` for the résumé. **The data layer is FROZEN** — the `["profile"]` parse poll, the `touched` ref, the `beforeunload` guard, and `profile.{getProfile,updateProfile,uploadResume}` all continue exactly as today; only the UI is new. **Data scope is unchanged**: general recruiting profile only (name / age / location / prefs / skills / experience / education / résumé) — **no official or sensitive documents**.

## Route + role

`/profile` · **candidate**. Rendered inside the new candidate `.app` shell (sidebar `Profile` `aria-current="page"`).

## Approved mockup (build to this exactly)

- **Reference demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — the design system at landing altitude. The profile editor uses the same tokens, type scale, primitives (`.cell`, `.cell.anchor`, `.ring`, `.bar`, `.pill-*`, `.status`, `.badge`, `.btn-*`), motion vocabulary, and rhythm.
- **No per-screen mockup file.** Build directly against the design language doc; Task 0 captures a fidelity reference screenshot.

## Existing code being REPLACED (not modified)

Assume these will be rewritten from scratch:

- `frontend/apps/candidate/app/profile/page.tsx` — markup rebuilt; the data layer (queries, mutations, parse poll, `touched` ref, `beforeunload` guard, validation) is **lifted verbatim** into the new file.
- `frontend/apps/candidate/components/profile/parsed-banner.tsx` — replaced by a new `.cell.anchor` parse-state component consuming the same props (`resumeUploaded`, `parsed`, `resumeFilename`, `onFile`).
- `frontend/apps/candidate/components/profile/completeness-meter.tsx` — replaced by a `.ring`-driven gauge (and a redundant `.bar` for low-vision users) consuming the same `completeness` int.
- `frontend/apps/candidate/components/profile/experience-row.tsx` — replaced by an in-cell row primitive consuming the same `{ company, title, summary }` shape.
- `frontend/apps/candidate/components/profile/skill-chips.tsx` — replaced by a `.badge`-based chip row consuming the same `string[]`; **the pure helpers (`addSkill`, `removeSkill`, dedupe) and `skill-chips.test.ts` are kept verbatim** — the new component imports them unchanged.

## Layout & components

**Shell:** `.app` sidebar + topbar (candidate audience, `Profile` active).

| Region | Markup / class | Notes |
|---|---|---|
| Sidebar | `.app > .side` | Candidate nav; `Profile` `aria-current="page"`. |
| Topbar | `.topbar` | `.crumb` "Home / Profile". `.toolbar` with audience pill, searchbox, `NotificationBell`, avatar. |
| Page head | `.page-head` | `<h1 class="display">Your profile</h1>` (Schibsted 700, `--step-3`) + `.sub` ("This is what employers see. Keep it sharp."). Right side: `.status` pill that reflects save state ("Unsaved changes" coral / "All changes saved" teal / "Saving…" spinner) + a `.btn-primary` "Save changes" (disabled when `!touched`). |
| Completeness anchor | `.cell.anchor` (`grid-column: span 4`) — **Profile readiness** | `.ring` (`--pct: completeness`) on the left with the percentage as a large display number; on the right, a short narrative ("Add a recent role to reach 80% — that's the threshold employers search above.") + the next-action `.btn-ghost` ("Add experience", "Add a skill", etc., chosen client-side from missing fields). A `.bar` below the ring gives a redundant low-vision-friendly progress view. |
| Résumé / parse | `.cell.c2` (`grid-column: span 2; grid-row: span 2`) — **Résumé** | `<h3>Résumé</h3>` + a `.who` row (filename icon swatch + `{resumeFilename ?? "Your résumé"}` + `.sub` for upload date if available). Parse-state `.pill-*` (`uploading`/`parsing` → `.pill-teal`; `parsed` → `.pill-good`; stalled (poll cap reached) → `.pill-warn`). A `.cell-visual` block lists parse-extracted highlights once `parsed` ("5 roles · 12 skills · 3 schools"). Footer: sr-only `<input type="file">` + a `.btn-ghost` label ("Replace résumé" / "Choose résumé"). MIME / size validation in `onFile` (unchanged). |
| Basics | `.cell.c1` (`grid-column: span 2`) — **Basics** | Form fields stacked as labelled `.input`s: full name, age, location, job preference (select). `willingToRelocate` rendered as a `.chip-toggle` ("Open to relocation" — coral when on). |
| Skills | `.cell.c5` (`grid-column: span 4`) — **Skills** | `<h3>Skills</h3>` + `.sub` ("Add what you've used in the last 3 years."). Chip row of `.badge` chips with an inline remove button per chip (`aria-label="Remove {skill}"`); below, an `.input` + `.btn-ghost` "Add" that calls the unchanged pure `addSkill` helper. |
| Experience | `.cell.c3` (`grid-column: span 3`) — **Experience** | `<h3>Experience</h3>` + a vertical stack of in-cell rows. Each row: `.input`s for company + title, a `<textarea class="input">` for summary, and a `.btn-ghost.btn-sm` "Remove". Footer: `.btn-ghost` "Add experience" (calls existing handler). Validation: the existing `expIncomplete` check shows a `.pill-warn` "Missing fields" inline on the offending row. |
| Education | `.cell.c4` (`grid-column: span 3`) — **Education** | `<h3>Education</h3>` + a stack of in-cell rows: `.input`s for institution, degree, year, and a `.btn-ghost.btn-sm` "Remove". Footer: `.btn-ghost` "Add education". |

> **Primitives reference (do NOT redefine):** `.app · .side · .topbar · .crumb · .toolbar · .page-head · .cell · .cell.anchor · .cell.{c1..c5} · .who · .ring · .bar · .pill · .pill-{teal,good,warn} · .badge · .chip-toggle · .input · .status · .btn · .btn-{primary,ghost,sm}` — defined in `@ip/ui/src/app.css`. Tokens via `@ip/ui/src/tokens.css`.

**New presentational pieces to build:** `.cell-visual` block reused from the landing demo's mini-data tiles (lives in `app.css`); in-cell row primitive (reused with the dashboard's `.cell-row`).

## Data wiring / seam (FROZEN — preserve every existing seam)

- **Client/seam:** `useAuth().api.profile.*` over the existing protobuf-es gRPC-web client. **Unchanged.**
- **Query keys (unchanged):**
  - `["profile"]` — `profile.getProfile({})`, with the existing **parse poll** (`refetchInterval` every ~2.5s, capped at `MAX_PARSE_POLLS`, until `parsed === true` flips it off). **Do not touch the poll config.**
- **Mutations (unchanged):**
  - `profile.updateProfile({...})` — invalidates `["profile"]`; the server **recomputes `completeness`** which the new `.ring` reads on the next render.
  - `profile.uploadResume({ data, contentType })` — invalidates `["profile"]` and re-triggers the parse poll.
- **Form-sync (unchanged):** the existing `useEffect` rehydrates the form from `data` only when `!touchedRef.current`, so server values never clobber user edits.
- **`beforeunload` guard (unchanged):** fires while `touchedRef.current === true` and the form is dirty.
- **Fields consumed** (per [`backend_candidate-profile.md`](./backend_candidate-profile.md)): `fullName`, `age`, `location`, `willingToRelocate`, `jobPreference`, `skills[]`, `experience[]`, `education[]`, `resumeUploaded`, `parsed`, `completeness` (0–100 → `--pct` on the ring), optional `resumeFilename` (render-if-present → falls back to "Your résumé").
- **Client-derived (no new RPC):** the "next action" hint in the anchor cell is computed client-side from which field group is most missing (no résumé → "Upload résumé"; no experience → "Add a role"; low skill count → "Add a skill"; otherwise "All set"). The save-state `.status` pill mirrors the `touched` ref + the in-flight mutation flag.

## Tasks

> **Task 0 — Fidelity baseline.** Confirm the Aperture Pro demo loads in the launch-preview panel; capture reference shots at 1440×900 (light + dark) into `docs/brand/redesign-v3/verify/profile-{light,dark}-reference.jpeg`. The profile build is screenshot-diffed against the design-language primitives in Task 5.

- **Task 1 — `/profile` mounted inside the candidate shell.** Wrap the page in `<CandidateShell />` (from `@ip/ui`, introduced by the landing task) with `Profile` `aria-current`. Topbar `.crumb` "Home / Profile". Verify the existing data layer mounts unchanged inside the shell; no visual regression on the still-old form below. Commit `apps/candidate/app/profile/page.tsx`.
- **Task 2 — Page head + completeness anchor.** Rebuild the page head (greeting + `.status` save-state pill + `.btn-primary` "Save changes"). Build the `.cell.anchor` with the `.ring` (driven by `completeness`), the next-action hint (derived client-side), and the redundant `.bar`. Verify: `Save changes` is disabled when `!touched`; clicking save shows "Saving…" then "All changes saved" once the mutation settles; `beforeunload` fires while dirty. Commit.
- **Task 3 — Résumé cell + parse states.** Build the `.cell.c2` parse-state cell using the existing `onFile` handler + the upload mutation. Implement the parse-state pill (`.pill-teal` parsing → `.pill-good` parsed → `.pill-warn` stalled). The sr-only file input is labelled by a visible `.btn-ghost`. Verify upload → parsing → parsed transitions live as the existing poll drives them, and a stalled poll surfaces the warning + a re-upload affordance. Commit.
- **Task 4 — Basics / skills / experience / education cells.** Build the four editor cells using `.input`, `.chip-toggle`, `.badge`-chip row, and the in-cell row primitive. **Import the unchanged pure helpers** (`addSkill`, `removeSkill`, dedupe) from `skill-chips.tsx`'s module; the existing test (`skill-chips.test.ts`) must still pass against them. Wire the validation (`expIncomplete`) to render `.pill-warn` "Missing fields" inline on incomplete experience rows. Verify the existing `onSubmit` save guard blocks submission while invalid, and the meter updates after a successful save. Commit.
- **Task 5 — Full assembly + fidelity verify.**
  1. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is green; the `skill-chips.test.ts` unit test is green.
  2. Run the dev server, sign in as a candidate with a partial profile.
  3. Screenshot at 1440×900 in both themes; visually diff against the Aperture Pro design-language primitives — iterate until the editor reads as the same product as the landing.
  4. Confirm: upload → parse → parsed pill transitions; skill add / remove updates the chip row + meter on save; experience-row Add / Remove; the `beforeunload` guard fires only while dirty; save updates `completeness` and re-renders the ring.
  5. Save final screenshots to `docs/brand/redesign-v3/verify/profile-{light,dark}.jpeg`.

## States & a11y

- **States (all preserved):**
  - **Loading** — page-wide `LoadingState` ("Loading your profile…") covering the body until `["profile"]` resolves.
  - **Résumé idle / uploading / parsing / parsed / stalled** — parse-state `.pill-*` in the résumé cell; stalled (poll cap reached) shows the `.pill-warn` + an explicit "Re-upload your résumé" affordance.
  - **Save busy** — the `.status` pill flips to "Saving…" with a token-driven spinner; save button disabled; form inputs remain interactive.
  - **Validation** — incomplete experience / education rows show inline `.pill-warn`; the page-wide save guard surfaces a `.cell`-framed error alert above the editor cells.
  - **Completeness** — the `.ring` reads the server's 0–100 int; no client-side recomputation.
  - **Empty (fresh user)** — `getProfile` `NotFound` maps to `null`; the page renders the empty editor + a `.pill-coral` "Upload your résumé to get started" prompt in the résumé cell.
- **Responsive:**
  - ≥ 1100px — full sidebar + bento (anchor full-row, c1/c2 right column, c3/c4 bottom, c5 full-row skills).
  - 760–1099px — bento collapses to 2-column.
  - ≤ 760px — sidebar collapses to a drawer; all cells stack to a single column; experience / education rows preserve their `grid-cols-1` rhythm.
- **Dark + light:** all colors via tokens; the `.ring` and `.bar` fills use `--teal` (resolves to the per-user accent).
- **Reduced motion:** `prefers-reduced-motion: reduce` disables the save-state spinner pulse and any `.rise` reveal.
- **A11y:**
  - One `<h1>` (the greeting); editor cells use `<h3>` + `aria-labelledby`.
  - `.ring` carries `aria-label="Profile completeness {pct} percent"`; redundant `.bar` carries `role="progressbar"` + `aria-valuemin/max/now` for low-vision users.
  - The sr-only `<input type="file">` is bound to a labelled `.btn-ghost`.
  - Each chip carries an `aria-label`ed remove button.
  - Experience / education `.input`s are labelled; the inline `.pill-warn` is `aria-live="polite"`.
  - The `beforeunload` guard protects unsaved parsed edits.
  - Focus rings via tokens; touch targets ≥ 44×44; body contrast ≥ 4.5:1.

## Acceptance

- The editor reads as the same product as the Aperture Pro landing — same tokens, type scale, primitives (`.cell` / `.ring` / `.bar` / `.badge` / `.pill-*` / `.status` / `.input`). Side-by-side screenshot proof committed at `docs/brand/redesign-v3/verify/profile-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; `skill-chips.test.ts` is green; no console errors / warnings; reduced-motion is honored.
- **Zero functional diff vs. today:** same `profile.{getProfile, updateProfile, uploadResume}` round-trips; same `["profile"]` parse poll (~2.5s cadence, `MAX_PARSE_POLLS` cap); same `touched` ref + form-sync `useEffect`; same `beforeunload` guard; same skill / experience pure helpers; same `expIncomplete` validation.
- The completeness ring renders the **existing** server-computed `completeness` int — no client-side recomputation.
- **Data scope unchanged:** general recruiting profile only (name / age / location / prefs / skills / experience / education / résumé). No UI control introduced that would prompt for sensitive or official documents.
- Pre-launch posture is preserved: example copy in empty / hint states uses generic phrasing ("Add a recent role"), never fake employer names.
