# Request a Pilot — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

The **company-side pilot intake form**. The primary conversion path for hiring managers and
talent leaders who land on `/`, click the top-utility-rule announcement "Request a pilot →", and
expect a serious, no-bullshit form that signals *this is a real product team*. Captures the
minimum information needed to triage a pilot conversation; never asks for fields we don't need
(no "How did you hear about us" five-option box, no "Please describe your hiring challenges in
500 words"). Submits via the **mailto fallback today** and is wired so a real RPC
(`forms.submitPilot`) can drop in without touching the FE component when the backend session is
ready.

## Route + role

`/pilot` (new file: `apps/candidate/app/(marketing)/pilot/page.tsx`) ·
**public** (token-free, crawlable, SSR-rendered, indexable). No `.app` shell — uses the marketing
chrome. The page is a single-column form-led layout; no two-column hero — this is a conversion
surface, not a marketing surface.

## Approved mockup (build to this exactly)

- **Design language source of truth:** [`_design-language.md`](../_design-language.md).
- **Demo reference:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
- **Screenshots to mirror style/density:**
  - Light full: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-full.jpeg`
  - Light hero: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-hero.jpeg`
  - Dark full: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-full.jpeg`
  - Dark hero: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-hero.jpeg`
- **In-demo regions this page reuses:**
  - The `#early` section's pilot column shape inspires the page layout; we expand it into a
    full-page form rather than a 2-up panel.
  - The auth split-panel pattern (form on the right, brand context on the left at ≥1100px) — at
    smaller breakpoints, the brand context becomes a single panel above the form.

There is no per-screen mockup file yet. Match the design language exactly; iterate via side-by-side
screenshot proof committed under `docs/brand/redesign-v3/verify/request-pilot-{light,dark}.jpeg`.

## Existing code being REPLACED (not modified)

**This is a NEW screen — no existing code to replace.** Gap #39 in the Tier-1 missing-pages audit
([`../_missing-pages-audit.md`](../_missing-pages-audit.md)). The landing CTA currently uses a
`mailto:` constant; this page elevates that into a real intake surface. Reuse the shared
marketing chrome from the landing plan's Task 1 + Task 2:

- `<UtilityRule />` (shared)
- `<MegaNav />` (shared)
- `<MegaFooter />` (shared)

Page-specific section components live under `apps/candidate/components/marketing/pilot/`.

> **Form primitives.** Inputs, selects, labels, error helpers, success states must use the design
> language's form primitives — added to `@ip/ui` in this plan's Task 2 if not yet present (see
> `_design-language.md` "Forms" pattern). These primitives are shared with `waitlist` (and the
> auth screens use the same shapes).

## Layout & components

Single-page intake form with a right-rail "What happens next" panel and a small trust strip
below. Section spine, in order:

| # | Section | Component (new) | Primitives / tokens |
|---|---|---|---|
| 0 | Top utility rule | `<UtilityRule />` *(shared)* | `.toprule` |
| 1 | Mega-nav | `<MegaNav />` *(shared)* | `.nav` |
| 2 | Split-panel intake | `<PilotIntake />` | 2-col split (≥1100px): left = `<PilotBriefPanel />`; right = `<PilotForm />`. Below 1100px the brief stacks above the form. |
| 3 | Trust strip | `<PilotTrustStrip />` | Wide `.trust-band` reused at compact scale: 4 truthful chips (`Strictly proctored · Evidence-based · Advisory by design · Every applicant answered`) |
| 4 | FAQ (intake-specific) | `<PilotFaq />` | Native `<details>/<summary>` with audience pill; 4–6 items ("How many seats does a pilot include?" / "Is there a price?" / "What does Aptura provide vs. what do we provide?" / "What's the data residency posture?") |
| 5 | Mega-footer | `<MegaFooter />` *(shared)* | `.bigfoot` |

### `<PilotBriefPanel />` (left rail)

| Element | Primitive | Notes |
|---|---|---|
| Eyebrow | single short word, teal | "Pilot" |
| Display headline | `<h1 class="display">` | "Run a verified interview, end-to-end." |
| Lead | `.lead` (62ch cap) | One paragraph: what a pilot includes, that it's a real engagement, that we set expectations together — not a sales pitch. |
| Bullet list | unordered `<ul>` with sprite check icons | 4 truthful bullets: *Up to 5 candidates · A real proctored interview each · A real evidence report · A debrief with your team*. |
| Reassurance row | small `.status` chip | "We respond in 2 business days." (truthful target — adjust if needed.) |

### `<PilotForm />` (right rail)

| Field | Type | Required | Notes |
|---|---|---|---|
| Work email | `<input type="email" inputMode="email" autoComplete="work email">` | Yes | Validates: non-empty, RFC-5322 shape, NOT a free-mail domain (gmail/yahoo/hotmail/outlook etc.) — soft-warn rather than block; helper text explains why. |
| Company name | `<input type="text">` | Yes | Trim; min 2 chars. |
| Your name | `<input type="text" autoComplete="name">` | Yes | Trim; min 2 chars. |
| Your role | `<select>` | Yes | Options: `Hiring manager · Talent / recruiting · Founder / CEO · People ops · Engineering lead · Other`. |
| Role you want to pilot | `<input type="text">` | Yes | Free-text; the specific role title. Helper text: "e.g. Backend engineer, Customer success rep, Sales BDR". |
| Team size | `<select>` | No | Options: `1–10 · 11–50 · 51–200 · 201–1000 · 1000+`. |
| When you'd start | `<select>` | No | Options: `This month · Next month · This quarter · Exploring`. |
| What you're solving (optional) | `<textarea>` | No | 0–500 chars; counter shown live. |
| Consent | `<input type="checkbox">` | Yes | "I agree to be contacted about a pilot. See our [Privacy policy](/privacy)." — required to submit. |
| Submit | `.btn.btn-primary.btn-lg` | — | Label: "Request a pilot →". Loading: spinner + "Sending…". Success: replaces form with a `<PilotSuccess />` panel. |
| Mailto fallback | `<a class="btn btn-ghost">` below the primary | — | "Or email us directly →" — `mailto:pilot@aptura.ai?subject=Pilot%20request&body=…` (pre-fills the body with the typed answers if any). Always visible. |

### Submit behaviour (today)

- **Default seam:** `submitPilot({…})` is a single function imported from
  `@ip/api-client/forms` (alias to be added). Its current implementation is a **mailto open**:
  builds a `mailto:` URL with the typed answers and triggers `window.location.href = …`. Returns
  `{ ok: true }` synchronously after open (we can't observe mail-client success). The form then
  switches to the success state.
- **When the backend session lands `forms.submitPilot`:** the function body switches to a real
  `fetch('/api/forms/pilot')` or gRPC-web call — **the form component does not change**. The
  contract (success/error shape) is documented in
  [`./backend_request-pilot.md`](./backend_request-pilot.md).
- **No analytics tracking** beyond a single `pilot_form_submitted` event hook (using the
  project's existing analytics seam, if any). No third-party scripts.

### `<PilotSuccess />`

| Element | Primitive | Notes |
|---|---|---|
| Coral pill | `.pill-coral` | "Submitted" |
| Display headline | `<h2 class="display">` | "Thanks — we got it." |
| Body | `.lead` | "We'll be in touch within 2 business days." |
| Next-steps card | `.cell.anchor` (teal-soft) | Three steps with mono numerals: 1. Quick call to confirm scope · 2. Set up your workspace · 3. Run the pilot end-to-end. |
| Cross-links | inline `next/link` row | "Read the trust architecture →" / "See a sample report →" / "Back to home →" |

## Data wiring / seam

- **Form submission seam:** `submitPilot({...PilotFormDTO}): Promise<{ ok: true; ref?: string }>`
  exported from `@ip/api-client/forms`. **Today this is a mailto open;** tomorrow it's a real
  RPC. The component never knows the difference.
- **No fetch on page load.** Pure static + the form's submit handler.
- **Static content lives in `content.ts`** (new:
  `apps/candidate/app/(marketing)/pilot/content.ts`):
  ```ts
  BRIEF:    { eyebrow; h1; lead; bullets: string[]; reassurance: string }
  FORM:     { fields: FieldDef[]; submitLabel; mailtoFallback: { label; href } }
  SUCCESS:  { pill; h2; lead; steps: { n: 1|2|3; html: string }[]; xlinks: { label; href }[] }
  TRUST:    { label: string }[]                                                            // 4 chips
  FAQ:      { aud: "comp"; q; a }[]                                                        // 4–6 items
  ```
- **Backend:** see [`./backend_request-pilot.md`](./backend_request-pilot.md) — minimal forms-intake
  contract, mailto fallback today, RPC TBD with the backend session.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Reference design is the design language.** The form primitives (input, select,
> textarea, label, helper, error) are added to `@ip/ui` in Task 2 below if not yet present.
> Match the design language's "Forms" pattern exactly.

- **Task 1 — Route scaffold + shared chrome + content seed.** Add
  `apps/candidate/app/(marketing)/pilot/page.tsx`, render
  `<UtilityRule /> + <MegaNav /> + <main> … </main> + <MegaFooter />`. Wire metadata (title, OG,
  canonical, `noindex=false`). Create `content.ts` skeleton. Verify the route is reachable +
  SSR'd. Commit.
- **Task 2 — Form primitives in `@ip/ui` (idempotent).** If not yet present, add `<TextField />`,
  `<SelectField />`, `<TextAreaField />`, `<CheckboxField />`, `<FieldHelper />`, `<FieldError />`
  to `@ip/ui` with the tokens + 46px height + 12px radius + 1px `--line-2` border + 2px / 4px
  `--teal` focus halo per the design language. Min font-size 16px (iOS no-zoom). Storybook-style
  smoke check or a one-page demo route under `app/(dev)/forms` (dev-only, behind
  `process.env.NODE_ENV !== "production"`). Commit `frontend/packages/ui/src/forms/*`.
- **Task 3 — `<PilotBriefPanel />` + split shell.** Build the left rail (eyebrow / display
  headline / lead / bullet list / reassurance chip) and the 2-col split shell. Verify the brief
  stacks above the form at <1100px and that the form remains a single column at all widths.
  Commit.
- **Task 4 — `<PilotForm />` — fields + client-side validation.** Build the form with all fields,
  required-field validation, RFC-5322 email validation, free-mail-domain soft-warn, consent
  checkbox required-to-submit. No submission yet; show a transient state when "Submit" is
  clicked. Verify keyboard tab order, focus rings, helper text. Commit.
- **Task 5 — `submitPilot` mailto seam + `<PilotSuccess />` + error path.** Add
  `@ip/api-client/forms` with `submitPilot()` returning `{ ok: true; ref?: string }`. Wire the
  form's submit handler: validate → call `submitPilot` → on `ok`, switch to
  `<PilotSuccess />`; on `!ok`, show a `<FieldError />` summary above the submit button + keep
  the form filled in. Today `submitPilot` opens `mailto:`; success state renders immediately
  after window.location.href. Also wire the visible "Or email us directly →" ghost button to a
  fully-populated mailto. Commit.
- **Task 6 — Trust strip + Pilot FAQ + assembly.** Build `<PilotTrustStrip />` (compact
  `.trust-band` variant) and `<PilotFaq />`. Assemble the page. Run `--filter @ip/candidate
  build` and `tsc --noEmit` clean. Commit.
- **Task 7 — Final assembly + Responsive verification + side-by-side fidelity.**
  1. Side-by-side screenshot vs. the design language reference at 1440×900 in both themes;
     iterate any divergence until 1:1.
  2. **Responsive verification (verbatim from [`_design-language.md`](../_design-language.md)):**
     1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
        820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
        1920 × 1080.
     2. **No horizontal scroll** at any width ≥ 320 px (test with `document.documentElement.scrollWidth`).
     3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
     4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
        `visualViewport.height` check).
     5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts gracefully,
        no clipped content.
     6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion
        in DevTools).
     7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari /
        Chrome / Firefox / Edge — at minimum Safari + Chrome on every OS.
     8. **Save side-by-side proof** to
        `docs/brand/redesign-v3/verify/<slug>-{mobile,tablet,desktop}.jpeg`.
  3. Confirm the `<PilotSuccess />` panel is shown on submit and that the mailto opens in a new
     tab / triggers the native client.
  4. Confirm "Or email us directly →" works even if JavaScript is disabled (SSR'd mailto link).

## States & a11y

- **States.** Idle · validating · submitting · success · error. All form fields:
  - **Idle:** placeholder text via `placeholder` attr; never replaces visible `<label>`.
  - **Validating (live):** errors appear only after the field is blurred at least once, OR after
    the user clicks submit. No mid-typing red.
  - **Submitting:** primary button shows spinner + "Sending…"; all fields are
    `disabled+aria-busy`.
  - **Success:** `<PilotSuccess />` replaces the form. Focus moves to the success headline
    (`aria-live="polite"` region).
  - **Error:** `<FieldError />` summary above the submit button; focus moves to the first
    invalid field.
- **Responsive.** Split shell stacks below 1100px (brief on top, form below). Form fields
  remain single-column at all widths. Submit + mailto buttons become full-width below 540px.
  Per the responsive matrix, on mobile the submit + mailto row sits in a sticky bottom band
  with `padding-bottom: max(env(safe-area-inset-bottom), 12px)`.
- **Dark + light.** All colors via tokens. Submit button uses `.btn-primary` (teal); mailto uses
  `.btn-ghost`. Focus halo uses `--teal`. Error text uses `--danger`. No hard-coded hex.
- **A11y.** Real `<label for="…">` for every field; helpers via `aria-describedby`; errors via
  `aria-describedby` + `aria-invalid="true"`. The form is a single `<form>` with a clear
  `<fieldset>/<legend>` for the consent block. The submit button announces its state
  (`aria-busy`, `aria-disabled`). The success region uses `role="status" aria-live="polite"`.
  Touch targets ≥44×44 (every field's clickable area is the full row). All `<input>`s have
  `font-size ≥ 16px` (iOS no-zoom). Contrast ≥4.5:1; placeholder ≥4.5:1. Focus rings use
  `--teal` 2px / 4px halo. Honors `prefers-reduced-motion`.

## Acceptance

- Matches [`_design-language.md`](../_design-language.md) 1:1 in tokens, type, spacing, motion,
  rhythm; side-by-side proof committed under
  `docs/brand/redesign-v3/verify/request-pilot-{light,dark}.jpeg`.
- `--filter @ip/candidate build` green; `tsc --noEmit` green; no console warnings.
- **Anti-fiction enforced:** no fake "Trusted by N companies" line; no fake testimonials; no
  pricing claims; no claimed ATS integrations. The trust strip carries only architectural truths.
- The form **works today** via mailto fallback and is **wired to swap** to a real
  `submitPilot()` RPC by changing only the implementation of
  `@ip/api-client/forms/submitPilot.ts`. No FE component change.
- The "Or email us directly →" ghost button works with JavaScript disabled (real SSR'd `mailto:`
  href).
- Free-mail-domain soft-warn fires for `gmail/yahoo/hotmail/outlook/icloud/proton` (configurable
  list) and does NOT block submit.
- Responsive verification (8-step list above) is complete — proofs committed.
- Privacy-policy link in the consent line resolves (Tier 2 page; placeholder route acceptable
  until that plan ships).
