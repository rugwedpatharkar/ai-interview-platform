# Practice feedback — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Replace the existing v2/Midnight `/feedback/[id]` page with an Aperture-Pro **read-only growth feedback** surface for one past practice run: a header summary `.cell`, a per-competency rubric block built from the design-language `.competency + .why` primitive (quoted transcript evidence) for both **strengths** and **gaps**, a **suggested topics** chip card, and a footer of plain-text follow-up links. The whole surface is **private to the candidate** — and the visual guarantee of the redesign is that **nothing on this page resembles a score / verdict / pass-fail**.

The reuse of `.competency + .why` is deliberate: it's the same primitive the real applicant-report (recruiter-facing) uses to render evidence-backed scores. Here we use **only the evidence shape**, never the score. No `.ring`, no `.bar`, no `.pill-good` / `.pill-bad` for verdict, no numeric "70%" anywhere — the upstream `GrowthFeedbackView` doesn't even carry a score, and the render layer is the visual guarantee.

## Route + role

`/feedback/[id]` (the `[id]` is a `practice_id`) · **candidate** (signed-in; `useRequireAuth` + `useRequireRole(["candidate"])`).

## Approved mockup (build to this exactly)

- **Live demo (primitive lives here):** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — see the **"Sample evidence report"** section's `.evidence-card + .competency + .why` blocks. This page consumes the same `.competency + .why` blocks but renders them in two grouped lists (Strengths / Gaps) **without** the `.competency .top .sc` score chip and **without** the `.competency .bar` progress fill.
- **Per-screen mockup:** ✗ none yet → **Task 0 builds** `docs/brand/redesign-v3/screens/practice-feedback.html` against the design-language tokens + primitives: `.app` shell, a `.page-head`, a header summary `.cell`, a 2-column `.grid` (Strengths cells / Gaps cells, each cell using the `.competency + .why` primitive **without** score), a suggested-topics `.cell` of `.pill.pill-neutral` chips, and a footer of plain links (Practice again / Back to dashboard).

The implemented page MUST look 1:1 like the Task 0 mockup. Side-by-side screenshot proof is part of the acceptance criteria.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (assume these files will be re-written from scratch by the new plan):

- `frontend/apps/candidate/app/feedback/[id]/page.tsx` — route shell + the 409 finalizing-poll wrapper.
- `frontend/apps/candidate/components/growth-feedback-panel.tsx` — rebuild as a single panel composing four sub-regions (header summary, strengths grid, gaps grid, suggested topics) — all using the design-language `.cell` + `.competency` + `.why` primitives.

The following are **frozen — do not modify**:

- `frontend/apps/candidate/lib/practice-client.ts` — `practice.feedback(practiceId, signal?)` (shared with `/practice`).
- `frontend/apps/candidate/components/candidate-shell.tsx` — the `.app` shell wrapper.

## Layout & components

**Shell:** `.app` (sidebar + topbar) from `@ip/ui`, mounted by `CandidateShell`. The sidebar's "Prepare" group highlights `Practice` (this page is a sibling of `/practice`).

| Region | Aperture-Pro primitive | Behavior |
|---|---|---|
| **Page header** | `.page-head` (`h2` Schibsted Grotesk display + `.sub`) | "Practice feedback" + sub "Private to you — review and try again." A small `.pill.pill-teal` "Private" sits next to the title. |
| **Header summary** | `.cell` (single large card) | Renders `evaluation_summary` (body) + a leading icon (Schibsted Grotesk `h3` "What you did well, and what to try next") + the upstream `feedback.summary` (`--ink-2`). **No score, no verdict, no pass-fail pill** — single explicit grep test in the acceptance section. |
| **Strengths** | a 1- or 2-column `.grid` of `.competency` cards (no `.top .sc` score chip; no `.bar`) | Each strength becomes a `.competency` cell whose `.top .nm` is a short label (the first sentence or topic), and whose `.why` block carries the full strength text as a quoted body line. A `.pill.pill-good` "Strength" sits in the cell `tag` slot. |
| **Gaps** | a 1- or 2-column `.grid` of `.competency` cards (no `.top .sc` score chip; no `.bar`) | Each gap becomes a `.competency` cell whose `.why` block carries the full gap text as a quoted body line. A `.pill.pill-warn` "Try next" sits in the cell `tag` slot — NOT `.pill-bad` (this is growth feedback, not a fail signal). |
| **Suggested topics** | `.cell` with a `flex-wrap` row of `.pill.pill-neutral` chips | Each suggested topic is a chip. Clicking a chip calls `router.push("/practice?topic={topic}")` — wires the prefilled-topic path on the start form (already supported via the same `topic` query handler the practice page exposes). |
| **Footer links** | a `.toolbar` of two text links | "Practice again →" (`/practice`) and "Back to dashboard" (`/`). Plain text links, `--teal` color, underline-on-hover. |
| **`finalizing` (409 poll)** | `.cell.tight` (centered, mid-page) | "Still scoring your run…" + a `.bar` progress indicator + a `.k-meta` "We'll show your feedback as soon as it lands." Auto-polls per the unchanged query. |
| **`error`** | `.cell` (warn-tone leading icon) | "We couldn't load this feedback." + Retry `.btn.btn-ghost`. |
| **`empty` / `404`** | `.cell` (neutral leading icon) | "This practice run doesn't exist or isn't yours." + Back link. |

**No new logic components.** The `.competency + .why` blocks are reused as-is from `@ip/ui` (lifted from the landing's evidence section); the variant used here drops the `.top .sc` score child and the `.bar` progress child via a `noScore` prop. No score ring, no progress bar, no verdict pill — load-bearing visual guarantee.

## Data wiring / seam (preserved verbatim)

- **Client/seam:** `practice.feedback(id, signal?)` via `useQuery`. **Unchanged.**
- **Query key (unchanged):** `["practice-feedback", id]` — `retry` on `409` (`n < 12`), `refetchUntil((d) => d !== undefined, 2500)`. The 409 finalizing-poll is the same as today.
- **Fields consumed** (see [`backend_practice-feedback.md`](./backend_practice-feedback.md)):
  - `PracticeFeedbackResult { evaluation_summary, feedback }` where
  - `feedback = GrowthFeedbackView { summary, strengths[], gaps[], suggested_topics[] }`.
  - The upstream type has **no `score`, no `recommendation`, no `verdict`** field — server-stripped (test-locked). The render layer is the second guarantee.
- **No verdict (load-bearing).** No score ring, no bar, no hire/reject pill, no numeric percentage. The chip `tag`s use `.pill-good` (Strength) / `.pill-warn` (Try next) — `.pill-bad` is intentionally banned on this page.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Build the screen mockup.**

- **Task 0 — Mockup.** Build `docs/brand/redesign-v3/screens/practice-feedback.html` against the design-language tokens + primitives: `.app` shell (sidebar with `Practice` `aria-current`), `.page-head` + `.pill.pill-teal` "Private", header summary `.cell`, Strengths grid of `.competency`-no-score cells (`.pill.pill-good` "Strength" tag), Gaps grid of `.competency`-no-score cells (`.pill.pill-warn` "Try next" tag), suggested-topics `.cell` of `.pill.pill-neutral` chips, footer toolbar of plain links. Verify NO score ring, NO `.bar` progress, NO `.pill-bad`. Verify in both themes on the `:4173` preview. Commit.
- **Task 1 — Rebuild `growth-feedback-panel.tsx`.** Compose the four sub-regions per the Layout table. Accept the existing `result: PracticeFeedbackResult` prop and render `evaluation_summary` + `feedback.{summary, strengths, gaps, suggested_topics}` — **never any score / verdict**. Use the design-language `.competency` primitive in `noScore` mode (drop `.top .sc` + `.bar`). Suggested-topic chips call `router.push("/practice?topic={topic}")` on click. Browser-verify both themes. Commit.
- **Task 2 — Rebuild `app/feedback/[id]/page.tsx`.** New body: `.page-head`, the loading / finalizing / error / 404 wrappers, the growth panel mount. **Keep `useRequireAuth` / `useRequireRole`, the `useParams` `practice_id` read, and the 409-poll query (`["practice-feedback", id]`, retry-on-409, refetchUntil) byte-for-byte identical.** Browser-verify (dark + light, `NEXT_PUBLIC_MOCK=1`). Commit.
- **Task 3 — Verify against the mockup.**
  1. Build `--filter @ip/candidate build` is green; `tsc --noEmit` is green.
  2. Navigate `/feedback/{id}` signed-in, screenshot both themes at 1440×900 and 390×844.
  3. **Side-by-side fidelity check** against `docs/brand/redesign-v3/screens/practice-feedback.html`. Iterate until 1:1.
  4. **No-verdict audit** — grep the new components for `Ring`, `score`, `bar`, `recommendation`, `verdict`, `pass`, `fail`, `pill-bad`. The only matches allowed are inside type imports or comments documenting the ban. Zero rendered occurrences.

## States & a11y

- **States.**
  - `loading` (`.cell.tight` skeleton).
  - `finalizing` (409 → "Still scoring your run…" `.cell.tight` + auto-poll).
  - `error` (warn `.cell` + Retry; not-found / not-yours variant uses neutral tone).
  - `success` (header + strengths + gaps + suggested topics).
- **No-verdict (load-bearing).** The panel renders strengths / gaps / suggested topics only — **never** a score, ring, percentage, or hire/reject pill. `.pill-bad` is banned on this page.
- **Responsive.** Strengths + Gaps grids collapse to one column at `<= 760px` (`auto-fit minmax(280px, 1fr)` per the design language). Suggested-topic chips wrap. The header summary `.cell` stays single-column at all widths.
- **Dark + light.** All colors via tokens — `--surface`, `--ink-deep`, `--teal-soft`, `--good`, `--warn`. No hard-coded color anywhere.
- **A11y.** One `<h1>`. Strengths / Gaps lists are semantic `<ul>/<li>` wrapped in `.competency` cells (the cell is the `<li>` semantically). Suggested-topic chips are real `<a>` / `<button>` elements with visible focus rings. Decorative leading icons `aria-hidden="true"`. Touch targets ≥44×44. Contrast ≥4.5:1.

## Acceptance

- Looks 1:1 like `docs/brand/redesign-v3/screens/practice-feedback.html` (the Task 0 mockup) — `.app` shell, `.page-head` with `.pill.pill-teal` "Private", header summary `.cell`, Strengths grid of `.competency`-no-score cells (`.pill.pill-good` "Strength" tag), Gaps grid of `.competency`-no-score cells (`.pill.pill-warn` "Try next" tag), suggested-topics chip row, footer plain-link toolbar. Side-by-side screenshot proof committed under `docs/brand/redesign-v3/verify/practice-feedback-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings; reduced-motion is honored.
- **Zero functional diff.** Same `practice.feedback` client, same `["practice-feedback", id]` query key, same 409-retry + 2500ms refetch-until, same `useParams` read.
- **No-verdict guarantee holds** — grep audit passes (no `Ring`, no `.bar` render, no `recommendation` / `pass` / `fail` text, no `.pill-bad` on this page); the upstream `GrowthFeedbackView` type has no `score` field; the render layer enforces the guarantee.
- Mock→real path unchanged: `NEXT_PUBLIC_MOCK=1` still drives the full success / 409-finalizing / error paths; real `practice.feedback` binds the same way once ai-agents is live.
