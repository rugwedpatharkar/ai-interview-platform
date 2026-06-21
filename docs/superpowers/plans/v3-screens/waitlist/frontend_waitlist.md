# Waitlist — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

The **candidate-side waitlist signup**. The primary candidate conversion path: someone reads the
landing, decides Aptura is a thing they want to try, and gives us a single email + role-area to be
notified when the marketplace opens roles they care about. Deliberately minimal — one email field,
one role-area select, one consent checkbox, one button. No CAPTCHA gate above the fold. Submits
via the **mailto fallback today** and is wired so a real RPC (`forms.submitWaitlist`) can drop in
without touching the FE component when the backend session is ready.

## Route + role

`/waitlist` (new file: `apps/candidate/app/(marketing)/waitlist/page.tsx`) ·
**public** (token-free, crawlable, SSR-rendered, indexable). No `.app` shell — uses the marketing
chrome. Centered single-column form layout — the simplest surface in the marketing tree.

## Approved mockup (build to this exactly)

- **Design language source of truth:** [`_design-language.md`](../_design-language.md).
- **Demo reference:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
- **Screenshots to mirror style/density:**
  - Light full: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-full.jpeg`
  - Light hero: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-hero.jpeg`
  - Dark full: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-full.jpeg`
  - Dark hero: `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-hero.jpeg`
- **In-demo regions this page reuses:**
  - The `#early` section's candidate column shape — expanded into a full-page form.
  - The auth split-panel reduced to a single centered card on small screens.

There is no per-screen mockup file yet. Match the design language exactly; iterate via side-by-side
screenshot proof committed under `docs/brand/redesign-v3/verify/waitlist-{light,dark}.jpeg`.

## Existing code being REPLACED (not modified)

**This is a NEW screen — no existing code to replace.** Gap #40 in the Tier-1 missing-pages audit
([`../_missing-pages-audit.md`](../_missing-pages-audit.md)). Reuse the shared marketing chrome
from the landing plan's Task 1 + Task 2:

- `<UtilityRule />` (shared)
- `<MegaNav />` (shared)
- `<MegaFooter />` (shared)

Page-specific section components live under `apps/candidate/components/marketing/waitlist/`.

> **Form primitives reused** from `@ip/ui` per the `request-pilot` plan Task 2 — `<TextField />`,
> `<SelectField />`, `<CheckboxField />`, `<FieldHelper />`, `<FieldError />`. Do not re-create
> them here; this page only assembles them.

## Layout & components

Single-column centered card. Section spine, in order:

| # | Section | Component (new) | Primitives / tokens |
|---|---|---|---|
| 0 | Top utility rule | `<UtilityRule />` *(shared)* | `.toprule` |
| 1 | Mega-nav | `<MegaNav />` *(shared)* | `.nav` |
| 2 | Centered intake | `<WaitlistCard />` | Single `.cell.anchor` (teal-soft gradient), max-width 540px, centered. Contains `<WaitlistBrief />` + `<WaitlistForm />` stacked. |
| 3 | Reassurance band | `<WaitlistTrustStrip />` | Compact 3-up: *No spam · Unsubscribe in one click · Every applicant gets an answer* |
| 4 | Cross-link strip | `<WaitlistCrossLinks />` | 3 small text links, centered: "Read the trust architecture →" / "See a sample report →" / "Browse current openings →" (the marketplace) |
| 5 | Mega-footer | `<MegaFooter />` *(shared)* | `.bigfoot` |

### `<WaitlistBrief />` (inside the card)

| Element | Primitive | Notes |
|---|---|---|
| Coral pill | `.pill-coral` | "Candidates" |
| Display headline | `<h1 class="display">` | "Get notified when roles open." |
| Lead | `.lead` (60ch cap) | "We'll email you when a role in your area is listed. No spam, no recruiters in your inbox unless you say yes." |

### `<WaitlistForm />`

| Field | Type | Required | Notes |
|---|---|---|---|
| Email | `<input type="email" inputMode="email" autoComplete="email">` | Yes | Validates: non-empty, RFC-5322 shape. NO free-mail-domain warn (candidates often use personal email — this is correct). |
| Role area | `<select>` | Yes | Options: `Engineering · Product · Design · Data · Sales · Marketing · Customer success · People & ops · Finance · Other`. |
| Consent | `<input type="checkbox">` | Yes | "Email me when matching roles are listed. See our [Privacy policy](/privacy)." — required to submit. |
| Submit | `.btn.btn-coral.btn-lg` | — | Label: "Join the waitlist →". Loading: spinner + "Joining…". Success: replaces card with a `<WaitlistSuccess />` panel. |
| Mailto fallback | `<a class="btn btn-ghost">` below the primary | — | "Or email us →" — `mailto:waitlist@aptura.ai?subject=Waitlist&body=…`. Always visible. |

### Submit behaviour (today)

- **Default seam:** `submitWaitlist({ email, roleArea, consent })` is a single function imported
  from `@ip/api-client/forms` (added in the `request-pilot` plan). Today: opens `mailto:`. Returns
  `{ ok: true }` synchronously; the form switches to success.
- **Tomorrow:** the seam's implementation flips to a real backend call. No FE component change.
  See [`./backend_waitlist.md`](./backend_waitlist.md).
- **No analytics tracking** beyond a single `waitlist_submitted` event hook (using the project's
  existing analytics seam, if any).

### `<WaitlistSuccess />`

| Element | Primitive | Notes |
|---|---|---|
| Coral pill | `.pill-coral` | "Joined" |
| Display headline | `<h2 class="display">` | "You're on the list." |
| Body | `.lead` | "We'll email you when a role in [role area] is listed. Unsubscribe any time." |
| Next-action row | inline `next/link` row | "Browse current openings →" / "See a sample report →" / "Back to home →" |

## Data wiring / seam

- **Form submission seam:** `submitWaitlist({ email, roleArea, consent }): Promise<{ ok: true; ref?: string }>`
  exported from `@ip/api-client/forms` (same module as `submitPilot`).
- **No fetch on page load.** Pure static + the form's submit handler.
- **Static content lives in `content.ts`** (new:
  `apps/candidate/app/(marketing)/waitlist/content.ts`):
  ```ts
  BRIEF:    { pill; h1; lead }
  FORM:     { fields: FieldDef[]; submitLabel; mailtoFallback: { label; href } }
  SUCCESS:  { pill; h2; leadTemplate: (roleArea: string) => string; xlinks: { label; href }[] }
  TRUST:    { label: string }[]                                    // 3 chips
  XLINKS:   { label: string; href: string }[]                      // 3 cross-links
  ```
- **Backend:** see [`./backend_waitlist.md`](./backend_waitlist.md) — minimal forms-intake
  contract, mailto fallback today, RPC TBD with the backend session.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Reference design is the design language.** The form primitives live in `@ip/ui` per
> the `request-pilot` plan Task 2. This page only assembles them.

- **Task 1 — Route scaffold + shared chrome + content seed.** Add
  `apps/candidate/app/(marketing)/waitlist/page.tsx`, render
  `<UtilityRule /> + <MegaNav /> + <main> … </main> + <MegaFooter />`. Wire metadata. Create
  `content.ts` skeleton. Verify reachable + SSR'd. Commit.
- **Task 2 — `<WaitlistCard />` shell + `<WaitlistBrief />`.** Build the centered teal-soft
  anchor cell with the brief inside. Verify the card centers correctly at all widths and that
  the card max-width does not exceed 540px. Commit.
- **Task 3 — `<WaitlistForm />` fields + client-side validation.** Build the email field, role
  area select, consent checkbox. Required-field validation. RFC-5322 email validation. No
  free-mail-domain warn for candidates. Submit button is `.btn-coral` (candidate-accent),
  full-width inside the card. Commit.
- **Task 4 — `submitWaitlist` mailto seam + `<WaitlistSuccess />` + error path.** Use the same
  `@ip/api-client/forms` module as `submitPilot`; add `submitWaitlist()` returning the same
  shape. Wire the form's submit handler: validate → call `submitWaitlist` → on `ok`, switch to
  `<WaitlistSuccess />`; on `!ok`, show a `<FieldError />` summary above the submit + keep the
  fields filled. Always-visible "Or email us →" mailto. Commit.
- **Task 5 — Trust strip + cross-links + assembly.** Build `<WaitlistTrustStrip />` (3 chips) and
  `<WaitlistCrossLinks />` (3 text links). Assemble. Run `--filter @ip/candidate build` and
  `tsc --noEmit` clean. Commit.
- **Task 6 — Final assembly + Responsive verification + side-by-side fidelity.**
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
  3. Confirm the `<WaitlistSuccess />` panel renders correctly with the chosen role area
     interpolated.
  4. Confirm "Or email us →" works with JavaScript disabled (SSR'd mailto link).

## States & a11y

- **States.** Idle · validating · submitting · success · error. Same model as `request-pilot`:
  - **Idle:** placeholder text via `placeholder`; never replaces visible `<label>`.
  - **Validating (live):** errors after blur or submit-click, not mid-typing.
  - **Submitting:** primary button shows spinner + "Joining…"; fields are `disabled+aria-busy`.
  - **Success:** `<WaitlistSuccess />` replaces the form. Focus moves to the success headline
    (`aria-live="polite"`).
  - **Error:** `<FieldError />` summary above submit; focus moves to the first invalid field.
- **Responsive.** Card stays centered at all widths. Submit + mailto become full-width below
  540px. On mobile the submit + mailto row sits in the natural flow (no sticky bottom band —
  the form is short enough that the user sees both buttons without scrolling).
- **Dark + light.** All colors via tokens. Submit uses `.btn-coral` (candidate accent); mailto
  uses `.btn-ghost`. Focus halo uses `--teal`. Error text uses `--danger`. No hard-coded hex.
- **A11y.** Real `<label for="…">` for every field; helpers via `aria-describedby`; errors via
  `aria-describedby` + `aria-invalid="true"`. The form is a single `<form>` with a clear
  `<fieldset>/<legend>` for the consent block. Submit button announces its state
  (`aria-busy`, `aria-disabled`). Success region uses `role="status" aria-live="polite"`.
  Touch targets ≥44×44. All `<input>`s have `font-size ≥ 16px` (iOS no-zoom). Contrast ≥4.5:1;
  placeholder ≥4.5:1. Focus rings use `--teal` 2px / 4px halo. Honors `prefers-reduced-motion`.

## Acceptance

- Matches [`_design-language.md`](../_design-language.md) 1:1 in tokens, type, spacing, motion,
  rhythm; side-by-side proof committed under
  `docs/brand/redesign-v3/verify/waitlist-{light,dark}.jpeg`.
- `--filter @ip/candidate build` green; `tsc --noEmit` green; no console warnings.
- **Anti-fiction enforced:** no "Join N,000 candidates already on the waitlist" line; no fake
  testimonials; no claimed match-rate. The reassurance band carries only architectural
  promises ("Every applicant gets an answer" is true by product design today).
- The form **works today** via mailto fallback and is **wired to swap** to a real
  `submitWaitlist()` RPC by changing only `@ip/api-client/forms/submitWaitlist.ts`. No FE
  component change.
- The "Or email us →" ghost button works with JavaScript disabled (real SSR'd `mailto:` href).
- Responsive verification (8-step list above) is complete — proofs committed.
- Privacy-policy link in the consent line resolves (Tier 2 page; placeholder route acceptable
  until that plan ships).
