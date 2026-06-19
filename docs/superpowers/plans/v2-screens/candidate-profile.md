# Screen: Candidate profile (enhance) — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 0, reposition + foundation).
> **Route:** `frontend/apps/candidate/app/profile/page.tsx` (enhance existing) · **Mockup:** profile with `ParsedBanner` + completeness meter · **Pillar:** [screens-frontend-build-plan §C](../../v2/2026-06-19-screens-frontend-build-plan.md)
> **Goal:** Enhance the existing résumé-upload + parse + edit profile to the mockup: a **`ParsedBanner`** (resume → AI parse status + filename + re-upload), a **completeness meter** (the existing `completeness` int via `@ip/ui` `Progress`), and tidier **`ExperienceRow`** / **`SkillChips`** editors — **reusing the existing upload/parse/save logic verbatim**.

The profile screen already exists and works (résumé upload → async parse poll → form sync → save), built on the canonical authed pattern (`useAuth` → `useRequireAuth` → `useQuery(["profile"])` + `useMutation`). This is an **enhancement**: extract the resume card into a `ParsedBanner`, add a `Progress` completeness meter, and componentize experience/skills into `ExperienceRow` / `SkillChips`. **No new backend, no new RPC** — the screen consumes the same three `Profile.*` calls it does today.

---

## A. Backend contract (hand this to a backend session)

**Status:** EXISTING · **Service:** `admin` `ProfileService` (gRPC-web), `api.profile.*` — all three already consumed by the current page.

The screen consumes **exactly** these (unchanged):

- **`api.profile.getProfile({})`** → the candidate's profile, or a `NotFound` the page maps to `null` (via `isNotFound(err)`). Response fields the screen renders (verified against the current page + the program spine):
  - `fullName: string`, `age: number`, `location: string`, `willingToRelocate: boolean`, `jobPreference: string`
  - `skills: string[]`
  - `experience: { company: string; title: string; summary: string }[]`
  - `education: { institution: string; degree: string; year: string }[]`
  - `resumeUploaded: boolean` — a résumé file has been received
  - `parsed: boolean` — the async AI parse has completed
  - `completeness: number` — 0–100 int (the meter renders this)
  - *(optional, render-if-present)* `resumeFilename: string` — the original filename, shown in the `ParsedBanner`. If the proto doesn't expose it yet, the banner falls back to a generic "Your résumé" label (see the FE note); adding it is a **trivial EXTEND**, not required for this screen.
- **`api.profile.updateProfile({ fullName, age, location, willingToRelocate, jobPreference, experience, education, skills })`** → persists the edited profile. Response: the updated profile (the page invalidates `["profile"]` and re-reads). Server recomputes `completeness`.
- **`api.profile.uploadResume({ data: Uint8Array, contentType: string })`** → accepts the résumé bytes, kicks off the async parse. Response: ack (the page invalidates `["profile"]` and **polls** `getProfile` every 2.5s — capped at `MAX_PARSE_POLLS` — until `parsed` flips true).

- **Auth/scope:** bearer required (candidate role); the profile is the caller's own (subject from the token; no client-supplied user id).
- **Backed by:** the existing `ProfileService` resource + the candidate profile collection + the résumé parse pipeline (already built; `completeness` already computed server-side).
- **Proto delta:** **none required.** The only *optional* nicety is exposing `resume_filename` on the profile message (EXTEND) so the `ParsedBanner` can show the real filename instead of a generic label — list it as a tiny optional EXTEND, gate the FE on its presence.
- **FE mock shape:** none new — the screen binds to the **existing** `api.profile.*`. (The enhancement is presentational over data already flowing.)

> **Contract seam:** nothing to mock. All three RPCs ship today; the work is componentizing the existing render + adding the `Progress` meter over the existing `completeness` field.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/apps/candidate/components/profile/parsed-banner.tsx` (resume state: idle / uploading / parsing / parsed + filename + re-upload, extracted from the current resume `Card`)
- Create: `frontend/apps/candidate/components/profile/completeness-meter.tsx` (`Progress` + percent + a "what's missing" hint)
- Create: `frontend/apps/candidate/components/profile/experience-row.tsx` (one experience entry editor — extracted from the inline `fieldset`)
- Create: `frontend/apps/candidate/components/profile/skill-chips.tsx` (chip add/remove over the skills array, replacing the comma-string `Input`)
- Create: `frontend/apps/candidate/components/profile/skill-chips.test.tsx` (add/remove/dedup is pure + testable)
- Modify: `frontend/apps/candidate/app/profile/page.tsx` (compose the new components; **keep** the existing query/mutation/poll/`touched` logic)

**Components:** new `ParsedBanner`, `CompletenessMeter`, `ExperienceRow`, `SkillChips`; reuse `@ip/ui` `Card`/`CardContent`/`CardHeader`/`CardTitle`, `Progress`, `Badge`, `Button`, `Field`, `Input`, `Textarea`, `Alert`, `Spinner`, `buttonVariants`, `cn`. Icons: `lucide-react` (`Upload`, `FileText`, `CheckCircle2`, `X`, `Trash2`, `Sparkles`) — in the app.
**Query keys:** `["profile"]` (existing — unchanged).

> **Enhancement discipline:** do **not** change the `useQuery(["profile"])` shape, the `refetchInterval` parse-poll (`MAX_PARSE_POLLS`), the `touched` ref / form-sync `useEffect`, the `beforeunload` guard, the `upload`/`save` `useMutation`s, or the MIME/size validation in `onFile`. Those are correct and load-bearing. The components are **presentational shells** the page feeds existing state into. (Per the global rule: behavior preservation; this is a restyle + extraction, not a rewrite.)

### Task 1: `SkillChips` — the one piece with real logic (TDD)

The current screen stores skills as a comma-separated string in an `Input`. The mockup wants chips. Extract a small controlled component with pure add/remove/dedup so it's testable; the page still serializes to/from `string[]` on save (the `updateProfile` contract is unchanged — `skills: string[]`).

- [ ] **Step 1: Write the failing test** — `frontend/apps/candidate/components/profile/skill-chips.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { addSkill, removeSkill } from "./skill-chips";

describe("skill chip ops", () => {
  it("adds a trimmed, deduped skill", () => {
    expect(addSkill(["react"], "  TypeScript ")).toEqual(["react", "TypeScript"]);
    expect(addSkill(["react"], "react")).toEqual(["react"]);          // case-exact dedup
    expect(addSkill(["react"], "  ")).toEqual(["react"]);             // empty ignored
  });
  it("removes by value", () => {
    expect(removeSkill(["react", "go"], "react")).toEqual(["go"]);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test skill-chips` → FAIL. *(Wire `vitest`/RTL into `apps/candidate` if not present — mirror whatever the saved-jobs/marketplace tasks establish; fold into this step.)*
- [ ] **Step 3: Implement** `skill-chips.tsx` (pure helpers + the `"use client"` controlled component):
```tsx
"use client";
import { Badge, Input } from "@ip/ui";
import { X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

export function addSkill(skills: string[], raw: string): string[] {
  const v = raw.trim();
  if (!v || skills.includes(v)) return skills;
  return [...skills, v];
}
export function removeSkill(skills: string[], value: string): string[] {
  return skills.filter((s) => s !== value);
}

/** Controlled skill editor: chips with remove, plus an input that commits on Enter/comma.
 * Parent owns the `string[]` (the same array updateProfile takes). */
export function SkillChips({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");
  function commit() {
    const next = addSkill(value, draft);
    if (next !== value) onChange(next);
    setDraft("");
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
    else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((s) => (
          <Badge key={s} tone="info" variant="subtle" className="gap-1 pr-1">
            {s}
            <button type="button" aria-label={`Remove ${s}`} onClick={() => onChange(removeSkill(value, s))}
              className="rounded-sm p-0.5 hover:bg-foreground/10">
              <X className="size-3" aria-hidden />
            </button>
          </Badge>
        ))}
      </div>
      <Input value={draft} placeholder="Add a skill and press Enter"
        onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={commit}
        aria-label="Add a skill" />
    </div>
  );
}
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test skill-chips` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(profile): SkillChips controlled editor + pure add/remove/dedup"`.

### Task 2: `ParsedBanner` (resume status + filename + re-upload)

Extract the current "Resume" `Card` into a banner that reflects the four resume states the page already computes (`upload.isPending`, `parsing`, `parseStalled`, `profile.data?.parsed`). It owns no logic — the page passes state + the file-`onChange` in.

- [ ] **Step 1:** Create `parsed-banner.tsx`:
```tsx
import { Alert, Badge, Spinner, buttonVariants, cn } from "@ip/ui";
import { CheckCircle2, FileText, Upload } from "lucide-react";
import type { ChangeEvent } from "react";

const RESUME_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface Props {
  resumeUploaded: boolean;
  parsed: boolean;
  parsing: boolean;          // resumeUploaded && !parsed && !stalled
  parseStalled: boolean;
  uploading: boolean;
  filename?: string;         // optional — falls back to "Your résumé"
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;   // the page's existing onFile, verbatim
}

/** Resume → AI-parse status banner. Reflects the page's existing resume state; the
 * file input reuses the page's existing onFile handler (MIME/size validation lives there). */
export function ParsedBanner({ resumeUploaded, parsed, parsing, parseStalled, uploading, filename, onFile }: Props) {
  const label = filename || "Your résumé";
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <FileText className="size-4" aria-hidden />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              {resumeUploaded ? label : "Upload your résumé"}
            </span>
            <span className="text-xs text-muted-foreground">
              {resumeUploaded ? "We extract your experience, education & skills with AI." : "PDF or Word — we'll fill in the rest."}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {parsed && <Badge tone="success" variant="subtle"><CheckCircle2 className="mr-1 size-3" aria-hidden />Parsed</Badge>}
          {(parsing || uploading) && <Badge tone="info" variant="subtle"><Spinner /> {uploading ? "Uploading" : "Parsing"}</Badge>}
          <input id="resume-file" type="file" aria-label="Upload résumé" accept={RESUME_ACCEPT}
            onChange={onFile} disabled={uploading} className="sr-only" />
          <label htmlFor="resume-file"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer", uploading && "pointer-events-none opacity-50")}>
            <Upload className="size-4" aria-hidden />
            {resumeUploaded ? "Replace" : "Choose file"}
          </label>
        </div>
      </div>
      {parseStalled && (
        <Alert tone="warning">
          Extraction is taking longer than expected. Keep filling in your details below, or re-upload to try again.
        </Alert>
      )}
    </div>
  );
}
```
- [ ] **Step 2:** In `app/profile/page.tsx`, replace the resume `Card`'s body with `<ParsedBanner resumeUploaded={!!profile.data?.resumeUploaded} parsed={!!profile.data?.parsed} parsing={parsing && !parseStalled} parseStalled={parseStalled} uploading={upload.isPending} filename={profile.data?.resumeFilename} onFile={onFile} />`. **Keep** `parsing`/`parseStalled` computation, `onFile`, the upload mutation — unchanged. (`resumeFilename` is `undefined` until/unless the proto exposes it — the banner falls back gracefully.)
- [ ] **Step 3: Verify** — `--filter @ip/candidate typecheck` clean; preview the upload → parsing → parsed transitions (the existing poll drives it). Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(profile): ParsedBanner (resume status + re-upload)"`.

### Task 3: `CompletenessMeter` (the existing `completeness` int)

- [ ] **Step 1:** Create `completeness-meter.tsx`:
```tsx
import { Progress } from "@ip/ui";

/** Profile completeness, driven by the server's `completeness` (0–100). The meter is
 * the screen's one focal point (violet Progress). The hint nudges the next best action. */
export function CompletenessMeter({ value }: { value: number }) {
  const hint =
    value >= 100 ? "Your profile is complete — you'll get the best matches."
    : value >= 60 ? "Almost there — add any missing experience or skills."
    : "Add your experience, education and skills to improve your matches.";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Profile completeness</span>
        <span className="font-display text-sm font-semibold text-brand-600">{value}%</span>
      </div>
      <Progress value={value} aria-label="Profile completeness" />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
```
- [ ] **Step 2:** In `app/profile/page.tsx`, render `<CompletenessMeter value={completeness} />` near the top of the form (the page already computes `const completeness = profile.data?.completeness ?? 0;`). Remove the old inline `Profile completeness: <strong>{completeness}%</strong>` text (now redundant).
- [ ] **Step 3: Verify** — `--filter @ip/candidate typecheck` clean; preview: the meter reflects the server value, updates after a save (the `["profile"]` invalidate re-reads). Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(profile): CompletenessMeter over existing completeness field"`.

### Task 4: `ExperienceRow` extraction (tidy the repeated `fieldset`)

- [ ] **Step 1:** Create `experience-row.tsx` — a controlled row taking `{ value: Exp; onChange: (patch) => void; onRemove: () => void; index }`, rendering the company/title `Input`s + the summary `Textarea` + a Remove `Button` (exactly the current inline `fieldset` markup). No logic change — the page's `update({ experience: … })` map stays in the page; the row just calls `onChange(patch)`/`onRemove()`.
- [ ] **Step 2:** In `app/profile/page.tsx`, replace the inline experience `fieldset.map` with `form.experience.map((exp, i) => <ExperienceRow key={exp._key} index={i} value={exp} onChange={(patch) => update({ experience: form.experience.map((x, j) => j === i ? { ...x, ...patch } : x) })} onRemove={() => update({ experience: form.experience.filter((_, j) => j !== i) })} />)`. **Keep** the `expIncomplete` validation, the "Add experience" button, and the `onSubmit` guard. *(Education can stay inline or get the same treatment — optional; experience is the named deliverable.)*
- [ ] **Step 3:** Replace the comma-string skills `Input` with `<SkillChips value={form.skills /* now string[] */} onChange={(skills) => update({ skills })} />`. **Important:** the form currently stores `skills` as a comma-separated **string**; switching to `SkillChips` means `form.skills` becomes a `string[]`. Update the `Form` type's `skills: string` → `skills: string[]`, the form-sync `useEffect` (`skills: p.skills` instead of `p.skills.join(", ")`), and the `save` mutation (`skills: form.skills` instead of the `.split(",").map(trim).filter(Boolean)`). This is the one structural change — keep `updateProfile`'s `skills: string[]` contract identical.
- [ ] **Step 4: Verify** — `--filter @ip/candidate build` clean (stop dev first); preview the full flow: upload → parse → chips populate from parsed skills → add/remove a chip → edit an experience row → save → toast + meter updates + `["recommendations"]`-adjacent freshness. The `beforeunload` unsaved-edits guard still fires. Screenshot.
- [ ] **Step 5: Commit** — `git commit -am "feat(profile): ExperienceRow + SkillChips wired (skills now string[])"`.

---

## C. States & acceptance
- **States:** preserved + enhanced — **loading** (`LoadingState` "Loading your profile…", existing), **resume idle/uploading/parsing/parsed/stalled** (now in `ParsedBanner`: `Spinner` badge while uploading/parsing, `warning` alert when stalled, `success` badge when parsed), **save busy** (`Button loading`), **validation** (`Alert tone="danger"` on incomplete experience/education rows — existing), **completeness** (the `Progress` meter, 0–100). No empty state needed (a fresh profile renders the form + the "upload your résumé" banner).
- **Responsive:** the cards stack; experience/education rows use the existing `grid-cols-1 sm:grid-cols-2` (and `…[1fr_1fr_6rem]` for education); chips wrap.
- **Dark mode:** tokens only → automatic (the brand-100/brand-500-15 resume icon swatch already has the dark variant).
- **A11y:** the file input stays `sr-only` with a labelled `<label>` button; `Progress` has `aria-label`; each chip's remove is an `aria-label`ed button; experience inputs keep their `aria-label`s; the `beforeunload` guard protects unsaved parsed edits.
- **Acceptance:** matches the profile mockup (`ParsedBanner` + completeness meter + chip skills + tidy experience rows); **the upload → async-parse → poll → form-sync → save flow is unchanged** (same `Profile.GetProfile/UpdateProfile/UploadResume`, same `["profile"]` poll); the meter renders the **existing** `completeness` int; `--filter @ip/candidate build` + `typecheck` green; no new backend (the optional `resume_filename` EXTEND is the only backend nicety, and the FE degrades without it).
