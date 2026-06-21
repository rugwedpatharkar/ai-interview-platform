# Company billing — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Build the **company billing** workspace at `/company/billing` — the surface a `company_admin`
opens to see the company's subscription, invoice history, payment method, and current usage.
Today this is unbuilt; the company-onboarding wizard's Step 4 deep-links here, and the company
sidebar's **Billing** nav entry routes here. The page is a 4-section workspace inside the
`.app` company shell:

1. **Current plan** — the active subscription card (`.cell.anchor`) with plan name, monthly
   usage `.bar`, next bill date.
2. **Invoice history** — `.table-wrap > table.data` with date / amount / status / download.
3. **Payment method** — a Stripe-style card display `.cell` with brand + last4 + expiry +
   "Update" CTA.
4. **Usage detail** — a `.stats-grid` showing interviews this month, audit-log retention,
   seats.

**Backend status: NEW scope, contract TBD.** Today no `BillingService` exists in-tree. This
plan documents the **surface** the FE will build against — a typed mock client that the
backend session will implement against the real `BillingService` (likely a thin wrapper around
Stripe). FE codes against `NEXT_PUBLIC_MOCK=1` today; flipping to real is the existing
1-line client swap. **Until the backend lands, the page renders truthful empty states** —
"No active subscription — talk to us about a pilot" + an "Open Stripe-style billing portal"
placeholder. No fake invoices, no fake usage, no fake credit-card numbers.

## Route + role

`/company/billing` (`apps/company/app/billing/page.tsx`) · **company — ADMIN ONLY**, guarded
by `useRequireRole(["company_admin"])` (the stricter gate — recruiters and hiring managers
cannot see billing). The sidebar **Billing** nav entry is only rendered for admins. A
recruiter who hits the route via the onboarding wizard's deep-link sees the in-page
`<AdminGate />` fallback (the shell already redirects; the in-page fallback is the bypass
fallback only).

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — `.cell.anchor` for the active subscription card, `.table-wrap > table.data` for invoice
  history, `.bar` for usage progress, `.stats-grid` for the usage detail row, `.pill-good /
  .pill-warn / .pill-danger` for invoice status pills.
- **Sibling reference:** the team-permissions plan
  ([`../team-permissions/frontend_team-permissions.md`](../team-permissions/frontend_team-permissions.md))
  — same `.app` company shell with the same admin-only gate; the `<AdminGate />` fallback
  pattern is identical.
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

No per-screen mockup yet — Task 0 builds it.

## Existing code being REPLACED (not modified)

**NEW screen — no existing code is being replaced.** The route does not exist today; there is
no `BillingService` client and no existing billing UI to delete.

What is **NOT** touched: `CompanyShell` (existing `.app` shell + role gate), the
`useRequireRole` hook (used as-is with the stricter `["company_admin"]` scope), the toast +
ConfirmDialog primitives in `@ip/ui`, or any `*.proto` / generated client. This screen
**creates new FE files only**, no edits to existing services.

## Section spine — 5 regions, in order

Build each as its own component under `frontend/apps/company/components/billing/`.

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. Sidebar **Billing** entry (admin-only) carries `aria-current="page"`. Topbar crumb = `<Company> / Billing`. |
| 1 | Page head | `<BillingHead />` | h1.display "Billing" + `.sub` "Manage your company's subscription, invoices, and payment method." Trailing `.btn.btn-ghost` **Contact billing** (mailto: link to a configurable billing email — uses an env-driven `NEXT_PUBLIC_BILLING_EMAIL` so we don't hard-code a brand address). |
| 2 | Admin gate | `<AdminGate />` | When the caller is not a `company_admin`, render a calm `.cell` (same pattern as team-permissions): `.tag` mono "ADMINS ONLY", h3 "Billing is managed by your company admin", truthful copy ("Only company admins can view subscriptions, invoices, and payment methods. Ask your admin if you need access."), Link back to `/company`. The shell already redirects; this is the bypass fallback. |
| 3 | Current plan | `<CurrentPlanCard />` | `.cell.anchor` (teal-tinted, 24px radius). Left: plan name (Schibsted h2 — e.g., "Pilot · No billing today") + `.sub` next-bill line (e.g., "No active subscription" / "Next bill on <date>"). Center: a `.bars` mini-summary row showing **Interviews this month** (label · `.bar > i` width = `usage.interviewsThisMonth / usage.interviewsIncluded * 100`% · mono `.v` "<N> / <N>"). Right: `.btn.btn-primary` **Manage subscription** (calls the deep-link to the Stripe-style billing portal — a presigned URL fetched from `BillingService.GetBillingPortalUrl` when the contract lands). |
| 4 | Invoice history | `<InvoiceHistoryTable />` | One `.cell.tight` wrapping a `.table-wrap > table.data`. Columns: **Date** (mono `.tnum` `formatLocal(invoice.createdAt, "d MMM yyyy")`) · **Amount** (`.tnum` `formatMoney(invoice.amountCents, invoice.currency)`) · **Status** (`.pill-good` paid · `.pill-warn` open · `.pill-danger` failed · `.pill` void / refunded) · **Download** (`.btn.btn-ghost.btn-sm` "PDF" → opens `invoice.pdfUrl` in a new tab when present). Empty state: "No invoices yet." (truthful — no fake invoices, no "your first invoice will appear here" trial copy). Sorted desc by `createdAt`. |
| 5 | Payment method + Usage | `<PaymentAndUsage />` | A 2-column grid (1-column ≤960px). Left `.cell` = `<PaymentMethodCard />` — Stripe-style card display with `card.brand` (Geist Mono uppercase) + "•••• •••• •••• {card.last4}" + "Expires {card.expMonth}/{card.expYear}" + `.btn.btn-ghost` "Update" CTA. Right `.cell` = `<UsageStats />` — `.stats-grid` (3 columns) of `.stat` cells: **Interviews this month** (display number + `.l` "of {included}") · **Audit-log retention** (display number + `.l` "days" — typically 365 on pilot, configurable per plan) · **Seats** (display number + `.l` "active / {included}" — pulled from `TeamService.ListMembers` count, derived). |

## Layout & components — map to `@ip/ui` and tokens

Pull every primitive from `@ip/ui` per [`_design-language.md`](../_design-language.md).

| Region | Primitive | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens via the design-language Task 1 |
| Page head | `h1.display` + `.sub` + `.btn.btn-ghost` | typography + button tokens |
| Admin gate | `.cell` + `.tag` mono + `h3` + `.btn.btn-ghost` | semantic tokens; no scary red — calm explanation, not an error |
| Current plan card | `.cell.anchor` (24px radius, gradient teal-soft) + `.bars` + `.btn.btn-primary` | `--teal-soft`, `--surface`, `--teal` |
| Usage bar | `.bar > .t > i` (5px tall) | `--teal` fill, `--surface-3` track; tones to `--warn` when `usage > 90%` of included |
| Invoice table | `.cell.tight` + `.table-wrap > table.data` | `--surface`, `--line`; `tr:hover` uses `--surface-2` |
| Invoice status pill | `.pill-good` (paid) / `.pill-warn` (open) / `.pill-danger` (failed) / `.pill` (void / refunded) | semantic tokens only — never `bg-emerald-*` raw |
| Mono columns (date, amount) | `.tnum` (Geist Mono) | `--ink` |
| Payment method card | `.cell` with card brand + last4 + expiry; mono `.tnum` for the masked number | `--surface-2`, `--ink-deep`, `--ink-3` |
| Update CTA | `.btn.btn-ghost` | button tokens |
| Usage stats | `.stats-grid` + `.stat` (3 columns at ≥1100px) | as design language |

All new primitives live in `@ip/ui/src/app.css` (one shared file). **No new tokens.**
**Anti-slop ban** — no side-stripe borders on the invoice table rows (use the `tr` border via
`--line`), no glassmorphism on the payment-method card (it's a real `.cell`, not a faux-glass
credit-card mockup), no fake "trial countdown" banners, no fake "save 30%" promotion ribbons,
no fake brand logos on the payment-method card (the card brand text is the brand label —
`VISA` / `MASTERCARD` / `AMEX` set in mono via `card.brand`).

## Data wiring / seam

**Backend status: NEW scope, contract TBD.** The FE codes against a typed mock client today;
the backend session owns the real contract. The mock client lives at
`frontend/apps/company/app/billing/billing-client.ts` and is gated by
`NEXT_PUBLIC_MOCK=1` exactly like the team-permissions client. When the backend lands, the
mock seam flips to `createBillingClient(api)` — components unchanged.

| Region | Hook | Query key | Source (TBD) |
|---|---|---|---|
| Current plan | `useAuthedQuery(token, billingClient.subscriptionQueryKey(), () => billingClient.getSubscription())` | `["billing","subscription"]` | `BillingService.GetSubscription` (TBD) |
| Invoice history | `useAuthedQuery(token, billingClient.invoicesQueryKey(page), () => billingClient.listInvoices({ page, pageSize: 20 }))` | `["billing","invoices", page]` | `BillingService.ListInvoices` (TBD) |
| Payment method | `useAuthedQuery(token, billingClient.paymentMethodQueryKey(), () => billingClient.getPaymentMethod())` | `["billing","payment-method"]` | `BillingService.GetPaymentMethod` (TBD) |
| Usage | `useAuthedQuery(token, billingClient.usageQueryKey(), () => billingClient.getUsage())` | `["billing","usage"]` | `BillingService.GetUsage` (TBD) |
| Update payment method | `useMutation(() => billingClient.getBillingPortalUrl())` → opens the returned URL in a new tab (Stripe-style hosted portal flow) → on return: invalidate `["billing","payment-method"]` + `["billing","subscription"]` | — | `BillingService.GetBillingPortalUrl` (TBD) |
| Manage subscription | same as Update payment method — both CTAs deep-link to the same Stripe-style hosted portal | — | `BillingService.GetBillingPortalUrl` (TBD) |
| Seats count | derived from `["team","members"]` (already populated by the team-permissions screen if the admin has visited it; otherwise a fresh `TeamService.ListMembers` fires here) | `["team","members"]` | `TeamService.ListMembers` (existing) |

**Mock seam (lives at `apps/company/app/billing/billing-client.ts`):**

```ts
import type { SubscriptionDTO, InvoiceDTO, PaymentMethodDTO, UsageDTO } from "./types";

export interface BillingClient {
  getSubscription(): Promise<SubscriptionDTO>;
  listInvoices(req: { page: number; pageSize: number }): Promise<{ invoices: InvoiceDTO[]; total: number; page: number; pageSize: number }>;
  getPaymentMethod(): Promise<PaymentMethodDTO | null>;
  getUsage(): Promise<UsageDTO>;
  getBillingPortalUrl(): Promise<{ url: string }>;

  subscriptionQueryKey(): readonly unknown[];
  invoicesQueryKey(page: number): readonly unknown[];
  paymentMethodQueryKey(): readonly unknown[];
  usageQueryKey(): readonly unknown[];
}

// Mock client returns truthful empty / placeholder data — no fake invoices, no fake card.
export function makeBillingClient(): BillingClient {
  return {
    getSubscription: async () => ({
      planName: "Pilot",
      status: "pilot",                                       // pilot | active | past_due | canceled | none
      nextBillAt: "",                                        // empty = no active billing
      currency: "USD",
    }),
    listInvoices: async () => ({ invoices: [], total: 0, page: 1, pageSize: 20 }),
    getPaymentMethod: async () => null,                      // null = no card on file
    getUsage: async () => ({
      interviewsThisMonth: 0,
      interviewsIncluded: 0,                                 // 0 = pilot (uncapped or TBD)
      auditLogRetentionDays: 365,
      seatsActive: 0,
      seatsIncluded: 0,                                      // 0 = pilot
    }),
    getBillingPortalUrl: async () => ({ url: "" }),          // empty = portal unavailable today
    subscriptionQueryKey: () => ["billing","subscription"],
    invoicesQueryKey: (page) => ["billing","invoices", page],
    paymentMethodQueryKey: () => ["billing","payment-method"],
    usageQueryKey: () => ["billing","usage"],
  };
}

// Real client (post-backend-landing — TBD; one-line swap).
export function createBillingClient(api: unknown): BillingClient { /* … binds to api.billing.* … */ }
```

**Anti-fiction guard (load-bearing for this screen).**

- The mock client returns **truthful empty** values everywhere. No fake invoice rows, no fake
  card numbers (`null` on `getPaymentMethod`), no fake usage counts (`0`), no fake portal URL.
- Default copy when the data is empty:
  - **Subscription:** "No active subscription — talk to us about a pilot."
  - **Invoices:** "No invoices yet."
  - **Payment method:** "No payment method on file."
  - **Usage:** "Pilot — usage is uncapped today."
- The **Manage subscription** / **Update** CTAs are **disabled** when
  `getBillingPortalUrl().url === ""` (the truthful state today). Disabled tooltip: "Billing
  portal will open when your subscription is active."
- No "Save 30% on annual billing" promotion ribbons. No "Upgrade to Pro" upsells. No
  "Try Premium free for 14 days" trials. The page presents only the real state.
- Card brand text uses `card.brand` (uppercase Geist Mono — `VISA` / `MASTERCARD` / `AMEX` /
  `DISCOVER`). No SVG card-brand logos (avoid trademark concerns and avoid faking a card we
  don't actually display).
- The seats row pulls from the **real** `TeamService.ListMembers` count — that's truthful
  (it's the count of users in the company), even before billing lands.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/company-billing.html` linking
> `@ip/ui/src/{tokens.css,app.css}` and the SVG sprite. Embed the `.app` shell verbatim from
> the design language; build the page head + 4 sections (current plan card, invoice table
> with 3 sample rows clearly labelled "Sample", payment-method card with `VISA •••• 4242`
> + Update CTA, usage stats row). Verify in both themes at 1440×900 and 390×844 against
> `D-aperture-pro-{light,dark}-full.jpeg`. Commit the new HTML file only.

- **Task 1 — Shell + page head + admin gate.** Mount the page under `CompanyShell` with the
  `useRequireRole(["company_admin"])` gate already provided by the shell. Render
  `<BillingHead />` with the Contact billing mailto + `<AdminGate />` as the in-page fallback
  for non-admins. Verify a recruiter loading `/company/billing` is redirected by the shell;
  the in-page fallback only fires if the redirect is bypassed (e.g., via direct deep-link
  during onboarding before the shell role-gate evaluates). Commit
  `apps/company/app/billing/page.tsx`,
  `apps/company/components/billing/{billing-head.tsx,admin-gate.tsx}`.

- **Task 2 — Mock client + DTO types.** Create the typed mock client +
  `apps/company/app/billing/types.ts` with `SubscriptionDTO`, `InvoiceDTO`,
  `PaymentMethodDTO`, `UsageDTO`. The mock returns truthful empty values everywhere — no fake
  invoices, no fake card. Document the file with a top-of-file comment: "Backend contract TBD —
  this client is a typed seam the FE builds against; the backend session will implement the
  real `BillingService`. Mock returns truthful empty state. Do not fabricate data here." Commit
  `apps/company/app/billing/billing-client.ts`,
  `apps/company/app/billing/types.ts`.

- **Task 3 — Current plan card.** Build `<CurrentPlanCard />` reading from
  `["billing","subscription"]` + `["billing","usage"]`. Render the `.cell.anchor` with plan
  name + truthful next-bill line + usage `.bar` (when `usage.interviewsIncluded > 0`; else
  hide the bar and show "Pilot — usage is uncapped today") + Manage subscription CTA
  (disabled when `getBillingPortalUrl().url === ""`). Verify the truthful "No active
  subscription — talk to us about a pilot" copy renders in the empty/mock state. Commit
  `apps/company/components/billing/current-plan-card.tsx`.

- **Task 4 — Invoice history table.** Build `<InvoiceHistoryTable />` reading from
  `["billing","invoices", page]`. Render the `.table-wrap > table.data` with the 4 columns
  (Date · Amount · Status · Download). Sort desc by `createdAt`. Empty state: a single full-
  width row "No invoices yet." (truthful; no "your first invoice will appear here" trial
  framing). Pagination: render a centered `.btn.btn-ghost.btn-sm` Page row when `total >
  pageSize`. The Download button opens `invoice.pdfUrl` in a new tab when present; disabled
  with tooltip "PDF unavailable for this invoice" otherwise. Commit
  `apps/company/components/billing/invoice-history-table.tsx`.

- **Task 5 — Payment method + Usage.** Build `<PaymentAndUsage />` as a 2-column grid.
  `<PaymentMethodCard />` reads from `["billing","payment-method"]` — when `null`, renders
  "No payment method on file." with a disabled **Update** CTA; when present, renders the
  Stripe-style mono card display + enabled **Update** CTA. `<UsageStats />` reads from
  `["billing","usage"]` + `["team","members"]` (for seats), renders the 3-cell `.stats-grid`
  with truthful empty handling ("Pilot — uncapped" instead of "0 of 0"). Commit
  `apps/company/components/billing/{payment-and-usage,payment-method-card,usage-stats}.tsx`.

- **Task 6 — Page assembly + fidelity verify.**
  1. `apps/company/app/billing/page.tsx` mounts `<CompanyBilling />` inside `<CompanyShell>`
     with the admin gate.
  2. `--filter @ip/company build` + `--filter @ip/company exec tsc --noEmit` are green.
  3. Boot the dev server with `NEXT_PUBLIC_MOCK=1`, sign in as a `company_admin`, screenshot
     `/company/billing` in both themes at 1440×900 and 390×844 against the Task-0 HTML.
  4. Confirm the truthful empty state renders end-to-end ("No active subscription — talk to
     us about a pilot.", "No invoices yet.", "No payment method on file.", "Pilot — usage is
     uncapped today.", **Manage subscription** and **Update** CTAs disabled with truthful
     tooltips).
  5. Confirm a recruiter (`recruiter`) loading `/company/billing` is redirected by
     `CompanyShell`; the in-page `<AdminGate />` is the bypass fallback only.
  6. Confirm the seats row reads the **real** `TeamService.ListMembers` count (truthful even
     before billing lands).
  7. Confirm the page never invents an invoice, a card number, or a portal URL.
  8. Document in the README of the billing folder that the **real contract lands separately
     via the backend session**; until then the page is a truthful "no billing today" view.

  **Responsive verification** — sub-task (do not skip; quoted verbatim from the design-
  language `_design-language.md` Responsive section):

  1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
     820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
     1920 × 1080.
  2. **No horizontal scroll** at any width ≥ 320 px (test with
     `document.documentElement.scrollWidth`).
  3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
  4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
     `visualViewport.height` check).
  5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts gracefully,
     no clipped content.
  6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion in
     DevTools).
  7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari /
     Chrome / Firefox / Edge — at minimum Safari + Chrome on every OS.
  8. **Save side-by-side proof** to
     `docs/brand/redesign-v3/verify/company-billing-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.** Each region loads / errors / empties **independently** — the page never blocks
  on one query.
  - **Loading** — current plan card renders a skeleton subscription line + skeleton `.bar`;
    invoice table renders 5 skeleton rows; payment-method card renders a skeleton mono line;
    usage stats render skeleton numbers.
  - **Empty (mock today; real when no subscription)** — every region renders the truthful
    empty copy above.
  - **Error** — each region renders an inline `.pill-warn` "Couldn't load billing data" with
    a retry; the rest of the page stays mounted.
  - **Success** — every region renders real data.
  - **Admin gate (non-admin caller)** — the in-page `<AdminGate />` (calm, no scary red)
    explains the gate and offers a Link back to `/company`.
- **Responsive.** Sidebar collapses ≤1000px per the design language. Current plan card's
  internal 3-column layout (left text · center bars · right CTA) goes from horizontal at
  ≥1100px to 2-column at ≤1100px to 1-column stacked at ≤760px. Invoice table scrolls
  inside `.table-wrap` under 760px (or converts to a card-stack per the design-language
  Responsive table rule). Payment + Usage row goes from 2-column to 1-column at ≤960px. The
  usage `.stats-grid` 3 → 2 → 1 columns.
- **Dark + light.** All color via tokens; the `.cell.anchor` current plan card uses
  `color-mix(in oklch, var(--teal) 8%, var(--surface))` so it resolves cleanly in both themes
  and inherits per-user Appearance accent overrides. Invoice status pills resolve to
  semantic tokens.
- **A11y.** One `<h1>` per page (the billing head). `<main>` + `<section>` per region.
  Invoice table uses real `<th scope="col">` headers and `<caption class="sr-only">` ("Invoice
  history"). Status pills carry text labels (not color-only). The Manage subscription /
  Update CTAs are real `<button>`s; when disabled, they carry `aria-disabled="true"` + a
  truthful tooltip. The payment-method card's masked number is announced as "Card ending in
  <last4>" (`aria-label`) so screen-readers don't read the bullets. Touch targets ≥ 44 × 44
  px. Contrast ≥ 4.5:1 body (`--ink-2` on `--bg`). Focus rings via `:focus-visible` —
  `--teal` 2px / 4px halo. Reduced-motion: no animations on the page.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/company-billing-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors /
  warnings.
- **The mock seam is a typed contract.** The mock client + DTO types live at
  `apps/company/app/billing/{billing-client.ts,types.ts}`. When the backend session lands
  `BillingService.{GetSubscription, ListInvoices, GetPaymentMethod, GetUsage,
  GetBillingPortalUrl}`, the components stay unchanged — only `createBillingClient(api)`
  binds to `api.billing.*`.
- **Anti-fiction posture is enforced.** Mock returns truthful empty everywhere. No fake
  invoices, no fake card numbers, no fake portal URLs, no upsell ribbons. Default copy is
  "No active subscription — talk to us about a pilot." The seats row reads the real
  `TeamService.ListMembers` count.
- A non-admin (recruiter / hiring_manager) loading `/company/billing` is still redirected by
  `CompanyShell`'s `useRequireRole(["company_admin"])`; the in-page `<AdminGate />` is the
  bypass-only fallback.
- The company-onboarding wizard's Step 4 deep-link to `/company/billing` lands on this page
  successfully (admin gets the full surface; recruiter gets the gate fallback). The
  onboarding plan documents the deep-link contract explicitly.
- The page is **post-pilot scope**: integration with Stripe / billing provider is owned by
  the backend session and lands separately. Until then this surface is the "no billing today"
  view, and that view is shippable on its own (it's better than a broken sidebar entry).
