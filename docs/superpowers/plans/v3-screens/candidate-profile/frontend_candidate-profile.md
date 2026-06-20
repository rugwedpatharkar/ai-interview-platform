# Frontend — Candidate profile (v3 Midnight reskin)

> **Screen:** Candidate profile editor — résumé upload + AI parse + general recruiting profile.
> **Goal:** Port the existing profile screen to the **Midnight Intelligence** look inside the `.app` shell:
> a **ParsedBanner** (résumé → parse status + filename + re-upload), a **completeness meter** (the existing
> `completeness` int as a Midnight bar/ring), and tidy **experience / skills** editors — **appearance only.** The
> upload → async-parse poll → form-sync → save flow, the `["profile"]` poll, and the `beforeunload` guard stay identical.
> **Scope:** general recruiting profile only (name/age/location/prefs/skills/experience/education/résumé) — **NO
> sensitive or official documents.**

- **Unified route(s) + role:** `/profile` · **candidate**.
- **Mockup:** ✗ — **build in Task 0** (`docs/brand/redesign-v2/candidate-profile.html`).
- **Existing code it reskins:**
  - `frontend/apps/candidate/app/profile/page.tsx` (query/upload/save/poll/`touched`/`beforeunload` — **keep verbatim**)
  - `frontend/apps/candidate/components/profile/parsed-banner.tsx`
  - `frontend/apps/candidate/components/profile/completeness-meter.tsx`
  - `frontend/apps/candidate/components/profile/experience-row.tsx`
  - `frontend/apps/candidate/components/profile/skill-chips.tsx` (+ `skill-chips.test.ts` — pure add/remove/dedup; unchanged)
- **Backend:** `backend_candidate-profile.md` (EXISTING — reuse v2 `../v2-screens/candidate-profile.md`).
  Consumes `profile.getProfile`, `profile.updateProfile`, `profile.uploadResume` — all unchanged.

---

## Layout & components

**Shell:** the `.app` sidebar+topbar product shell (Profile active in the sidebar). Regions:

| Mockup region | Markup / `@ip/ui` + `app.css` classes | Source today |
|---|---|---|
| Sidebar | `.side` · `.navitem[aria-current]` on Profile · `.side .foot` `.avatar` | candidate shell |
| Topbar | `.topbar` · `.crumb` `Home / Profile` · `.toolbar` | shell topbar |
| Page head | `.page-head` (`h2` "Your profile" + `.sub`) + `.btn-primary` "Save changes" | heading + save button |
| Completeness | a Midnight meter: `.card.tight` + `.bar > i` (width = `completeness`%) **or** `.ring` (`--p: completeness`) + `.tnum` %, with the next-action hint | `CompletenessMeter` restyle |
| Résumé / parse | `.card` "ParsedBanner": `.who`-style row (icon swatch + filename/`.sub`) + `.pill-accent`/`.pill-good` parse state + `.btn-ghost.btn-sm` Replace/Choose; `.pill-warn` when stalled | `ParsedBanner` restyle |
| Basics | `.card` form: `.input`s for name/age/location, `.chip-toggle` willing-to-relocate, job-preference `.input`/select | inline form fields |
| Skills | `.card` + chip row: `.badge`-style removable chips + add `.input` | `SkillChips` restyle |
| Experience | `.card` + repeated `ExperienceRow` (company/title `.input` + summary textarea + `.btn-ghost.btn-sm` Remove); "Add experience" `.btn-ghost` | `ExperienceRow` restyle |
| Education | `.card` + education rows (institution/degree/year) | inline rows |

> **Component classes (reference):** `.app · .side · .topbar · .content · .page-head · .card(.tight) · .bar(>i) ·
> .ring · .input · .badge · .pill(.pill-accent/-good/-warn) · .chip-toggle · .btn(.btn-primary/.btn-ghost/.btn-sm)`
> from `app.css`; tokens from `tokens.css`.

**New vs reused:** no new logic components. `ParsedBanner`, `CompletenessMeter`, `ExperienceRow`, `SkillChips` keep
their props/logic and are **restyled** to the Midnight classes above.

---

## Data wiring (identical to today)

- **Client/seam:** `app/profile/page.tsx` uses `useAuth().api.profile.*` via the canonical authed query/mutation
  pattern. **Unchanged.**
- **Query keys:** `["profile"]` — including the **parse poll** (`refetchInterval` every ~2.5s capped at
  `MAX_PARSE_POLLS` until `parsed` flips true) and the form-sync `useEffect` / `touched` ref / `beforeunload` guard.
  **All unchanged** — the reskin must not touch the query/mutation config.
- **Fields consumed** (from `backend_candidate-profile.md`, identical): `fullName`, `age`, `location`,
  `willingToRelocate`, `jobPreference`, `skills[]`, `experience[]`, `education[]`, `resumeUploaded`, `parsed`,
  `completeness` (0–100), optional `resumeFilename` (render-if-present → ParsedBanner label, else "Your résumé").

---

## Tasks (bite-sized; restyle + shell)

### Task 0: Build the mockup (mockup ✗)
- [ ] Create `docs/brand/redesign-v2/candidate-profile.html` against `tokens.css` + `app.css`: the `.app` shell +
  completeness meter + ParsedBanner + basics/skills/experience/education cards, matching the family of the other
  Midnight screens (`data-theme="dark"`).
- [ ] Browser-verify on the :4173 preview (dark + light); commit the mockup.

### Task 1: Wrap `/profile` in the `.app` shell
- [ ] Render the profile page inside the candidate `.app` shell (Profile `aria-current`), topbar `.crumb`
  `Home / Profile`, content under `.content`. **Keep** the entire page data layer mounted unchanged.
- [ ] Build (`--filter @ip/candidate build`, stop dev first) + browser-verify; commit.

### Task 2: Completeness meter (Midnight `.bar`/`.ring`)
- [ ] Restyle `CompletenessMeter` to the Midnight meter (`.bar > i` width = `value`%, or `.ring` with `--p`), `.tnum` %,
  hint text. Drive from the **existing** `completeness` int; no new field. Build + browser-verify (updates after save); commit.

### Task 3: ParsedBanner (résumé state + re-upload)
- [ ] Restyle `ParsedBanner` to a `.card` with the icon swatch + filename, the parse-state `.pill-*` badges
  (uploading/parsing → `.pill-accent`; parsed → `.pill-good`; stalled → `.pill-warn`), and the sr-only file input + a
  `.btn-ghost.btn-sm` label (Replace/Choose). **Keep** `onFile` (MIME/size validation) + the upload mutation untouched.
- [ ] Build + browser-verify upload → parsing → parsed transitions (existing poll drives it); commit.

### Task 4: Basics / skills / experience / education cards
- [ ] Wrap each section in a `.card`; swap ad-hoc Tailwind to `.input` / `.chip-toggle` / `.btn-*`. Restyle `SkillChips`
  to `.badge`-style removable chips (pure helpers unchanged — `skill-chips.test.ts` still passes). Restyle `ExperienceRow`
  to `.input`s + textarea + Remove. **Keep** `skills: string[]`, the `expIncomplete` validation, the Add buttons, and
  the `onSubmit` guard — all unchanged.
- [ ] Build + `--filter @ip/{ui,shared,api-client} typecheck` green; browser-verify the full flow (upload → parse →
  chips → edit row → save → toast + meter update; `beforeunload` still fires); commit.

---

## States & a11y
- **States (all preserved):** **loading** (`LoadingState` "Loading your profile…"), **résumé idle/uploading/parsing/
  parsed/stalled** (ParsedBanner pills + `.pill-warn` stalled alert), **save busy** (button loading), **validation**
  (incomplete experience/education → error alert), **completeness** (0–100 meter). No empty state (fresh profile renders
  the form + "upload your résumé").
- **Responsive:** cards stack; experience/education rows keep their `grid-cols-1 sm:grid-cols-2` rhythm; chips wrap;
  sidebar hides ≤1000px.
- **Dark + light:** **dark-first**; all colors via tokens — **no hardcoded color**; reads per-user accent/base.
- **A11y:** file input stays `sr-only` with a labelled `<label>` button; the meter has `aria-label`/`aria-valuenow`;
  each chip's remove is an `aria-label`ed button; experience inputs keep their `aria-label`s; `beforeunload` protects
  unsaved parsed edits; focus rings via tokens; contrast ≥4.5:1.

## Acceptance
- Matches the Task 0 `candidate-profile.html` (ParsedBanner + completeness meter + chip skills + tidy experience rows),
  in the Midnight family.
- Build + typecheck green for `@ip/candidate` (+ `@ip/ui`/`shared`/`api-client`).
- **Zero functional diff:** same `Profile.GetProfile/UpdateProfile/UploadResume`, same `["profile"]` parse poll,
  same `skills: string[]` contract, same `beforeunload` guard. Meter renders the **existing** `completeness`. No new
  backend (optional `resumeFilename` EXTEND degrades gracefully). **Scope unchanged: general recruiting profile only.**
