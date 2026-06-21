# Company billing — Backend contract (v3 · TBD · NEW scope)

> **Screen.** `/company/billing` company billing workspace. **FE consumer:** [`frontend_company-billing.md`](./frontend_company-billing.md).
> **Status:** **NEW scope — contract TBD with the backend session.** No `BillingService`
> exists in-tree today. This file documents the **proposed surface** the FE builds against
> via a typed mock client; the backend session owns the final contract + the integration
> with Stripe (or another billing provider). **The Aperture Pro v3 redesign ships the
> FE-side surface today; the real backend lands post-pilot.**
> **Anti-fiction reminder:** Aptura is pre-launch. The mock client returns **truthful empty
> values** everywhere — no fake invoices, no fake card numbers, no fake portal URLs, no
> upsell ribbons. Default copy is "No active subscription — talk to us about a pilot." The
> seats row reads the real `TeamService.ListMembers` count. See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** **mock only.** FE codes against `makeBillingClient()` behind
> `NEXT_PUBLIC_MOCK`. When the backend session lands `BillingService`, the FE flip is the
> existing 1-line client swap (`createBillingClient(api)`); components are unchanged.

## Functionalities (proposed)

- **Get** the company's current subscription (plan, status, next-bill date, currency).
- **List** invoices (paginated, desc by `createdAt`; each carries a presigned `pdfUrl` when
  available).
- **Get** the payment method on file (Stripe-style: brand + last4 + expiry; `null` when none).
- **Get** the current usage (interviews this month, audit-log retention days, seats counts).
- **Get** a presigned Stripe-style hosted-portal URL (the single `Manage subscription` /
  `Update payment method` deep-link — keeps PCI scope on the provider, not in-house).

All five reads are **admin-only** (`company_admin`); recruiters and hiring managers never call
them. Mutations (subscription changes, payment-method updates) happen in the hosted portal,
not in our UI — that's the deliberate scope choice.

## Service & RPCs (PROPOSED · TBD)

The proposed service is `admin.billing.v1.BillingService` (gRPC-web on **admin**; bearer
required). Every method is **`billing:manage`-gated** (⇒ `company_admin` only) + comp-scoped
(target company derived from the **token**, never the request).

```proto
// PROPOSED — final shape owned by the backend session.
service BillingService {
  rpc GetSubscription(google.protobuf.Empty)                returns (SubscriptionDTO);
  rpc ListInvoices(ListInvoicesRequest)                     returns (ListInvoicesResponse);
  rpc GetPaymentMethod(google.protobuf.Empty)               returns (PaymentMethodDTO);   // empty PaymentMethodDTO when none
  rpc GetUsage(google.protobuf.Empty)                       returns (UsageDTO);
  rpc GetBillingPortalUrl(google.protobuf.Empty)            returns (BillingPortalUrlDTO);
}
```

**Auth/scope (proposed).** Bearer; **company-admin only** (the `billing:manage` scope ⇒ only
`company_admin` holds it). The action is authorised with a new
`require_permission("billing:manage")` on top of the existing RBAC matrix. `billing:manage`
joins the 8 scopes already in `lib/lib/schemas/permissions.py` as scope #9 — admin gets it;
recruiter and hiring_manager do NOT. The FE `PERMISSIONS` constant must be kept in lock-step
when the backend lands (see [`../team-permissions/backend_team-permissions.md`](../team-permissions/backend_team-permissions.md)).

## Request / Response structures (PROPOSED · TBD)

camelCase per protobuf-es on the FE.

```ts
// FE mock shapes — `apps/company/app/billing/types.ts`. These ARE the contract surface the
// FE builds against today; the backend session may refine field names but the **shape** is
// what the components consume.

export type SubscriptionStatus = "pilot" | "active" | "past_due" | "canceled" | "none";

export interface SubscriptionDTO {
  planName: string;          // e.g., "Pilot", "Starter", "Growth", "Scale" — display name
  status: SubscriptionStatus;
  nextBillAt: string;        // ISO-8601 UTC; "" when no active billing
  currency: string;          // ISO 4217; "USD" default
}

export type InvoiceStatus = "paid" | "open" | "failed" | "void" | "refunded";

export interface InvoiceDTO {
  id: string;
  createdAt: string;         // ISO-8601 UTC
  amountCents: number;       // integer cents (avoid floats)
  currency: string;          // ISO 4217
  status: InvoiceStatus;
  pdfUrl: string;            // presigned URL or "" when unavailable
}

export interface ListInvoicesRequest { page: number; pageSize: number; }   // pageSize clamped
export interface ListInvoicesResponse {
  invoices: InvoiceDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PaymentMethodDTO {
  brand: string;             // "VISA" | "MASTERCARD" | "AMEX" | "DISCOVER" | "OTHER"
  last4: string;             // 4-digit string
  expMonth: number;          // 1..12
  expYear: number;           // 4-digit
}
// FE convention: getPaymentMethod returns `null` (not an empty DTO) when no card is on file.

export interface UsageDTO {
  interviewsThisMonth: number;
  interviewsIncluded: number;       // 0 = pilot (uncapped today) — FE renders "Pilot — uncapped"
  auditLogRetentionDays: number;    // typically 365 on pilot; per-plan when billing lands
  seatsActive: number;              // derived from TeamService.ListMembers count
  seatsIncluded: number;            // 0 = pilot
}

export interface BillingPortalUrlDTO {
  url: string;                      // presigned hosted-portal URL; "" when unavailable
}
```

**FE mock client shape** (`apps/company/app/billing/billing-client.ts`):

```ts
export interface BillingClient {
  getSubscription(): Promise<SubscriptionDTO>;
  listInvoices(req: ListInvoicesRequest): Promise<ListInvoicesResponse>;
  getPaymentMethod(): Promise<PaymentMethodDTO | null>;
  getUsage(): Promise<UsageDTO>;
  getBillingPortalUrl(): Promise<BillingPortalUrlDTO>;

  subscriptionQueryKey(): readonly unknown[];
  invoicesQueryKey(page: number): readonly unknown[];
  paymentMethodQueryKey(): readonly unknown[];
  usageQueryKey(): readonly unknown[];
}
```

**Truthful mock defaults** (the FE today):

- `getSubscription` → `{ planName: "Pilot", status: "pilot", nextBillAt: "", currency: "USD" }`.
- `listInvoices` → `{ invoices: [], total: 0, page: 1, pageSize: 20 }`.
- `getPaymentMethod` → `null`.
- `getUsage` → `{ interviewsThisMonth: 0, interviewsIncluded: 0, auditLogRetentionDays: 365,
  seatsActive: 0, seatsIncluded: 0 }`.
- `getBillingPortalUrl` → `{ url: "" }`.

The mock NEVER fabricates an invoice row, a card number, or a portal URL. The page treats
the empty state as the truthful state.

## Data required (PROPOSED · TBD)

Owned by the backend session. Likely shape:

- **`billing_subscriptions`** (one row per comp; `comp_id` unique). Fields: `comp_id`,
  `provider` ("stripe" | "manual"), `provider_subscription_id`, `plan_name`, `status`,
  `next_bill_at`, `currency`, `created_at`, `updated_at`.
- **`billing_invoices`** (per-comp; indexed `(comp_id, created_at desc)`). Fields:
  `comp_id`, `provider_invoice_id`, `created_at`, `amount_cents`, `currency`, `status`,
  `pdf_url` (or presigned on read), `metadata`.
- **`billing_payment_methods`** (one current method per comp; `comp_id` unique). Fields:
  `comp_id`, `provider_payment_method_id`, `brand`, `last4`, `exp_month`, `exp_year`,
  `created_at`. **Never** store full PAN or CVV — the provider tokenises.
- **Usage rollups** — likely computed on read from existing collections (interviews from
  `applications` / `interview_bookings`; audit-log retention from a per-plan config;
  seats from `users` filtered to the caller's `comp_id`). No new collection required for
  usage; just the read aggregation.
- **Provider integration** — Stripe Customer + Subscription + Webhook handler (the webhook
  updates `billing_subscriptions` + `billing_invoices` when Stripe emits
  `customer.subscription.updated` / `invoice.paid` / `invoice.payment_failed` / etc.).
  **Backend session owns this.**

## Errors & edge cases (PROPOSED · TBD)

| Surface | Behavior |
|---|---|
| `UNAUTHENTICATED` | missing/invalid bearer; redirected by `CompanyShell` |
| `PERMISSION_DENIED` | non-admin caller; redirected by `CompanyShell`; in-page `<AdminGate />` is the bypass fallback |
| `NOT_FOUND` | no subscription / no payment method → FE renders truthful empty state (no fake card / no fake invoice) |
| `UNAVAILABLE` | provider (Stripe) down → each query renders the inline `.pill-warn` "Couldn't load billing data" with retry; the rest of the page stays mounted |
| `RESOURCE_EXHAUSTED` | rate-limited read → inline `.pill-warn` "Try again in a moment" |
| Empty subscription / empty invoices / null payment method / 0 usage | the **default truthful state** — FE renders the empty copy ("No active subscription — talk to us about a pilot.", etc.); the Manage subscription / Update CTAs are disabled |
| `GetBillingPortalUrl` returns `{ url: "" }` | FE disables both CTAs with tooltip "Billing portal will open when your subscription is active." |
| Webhook race | the provider may update `billing_*` collections after the FE has already polled; the FE invalidates the relevant query keys on tab-focus + after returning from the hosted portal (window-focus listener fires `queryClient.invalidateQueries(["billing"])`) |

## Cross-references

- Upstream caller (Step 4 of the company-onboarding wizard): [`../company-onboarding/backend_company-onboarding.md`](../company-onboarding/backend_company-onboarding.md)
  — the wizard deep-links here on Finish.
- Sibling admin-only screen: [`../team-permissions/backend_team-permissions.md`](../team-permissions/backend_team-permissions.md)
  — same `useRequireRole(["company_admin"])` gate; `billing:manage` will join the 8 scopes
  already in `lib/lib/schemas/permissions.py` as scope #9 when the backend lands.
- Cross-screen data: the seats row pulls from the **real** `TeamService.ListMembers` count
  via the existing `["team","members"]` query (no new fetch).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- Pillar: **post-pilot** (the FE surface ships today as the truthful "no billing" view; the
  real Stripe-backed contract is owned by the backend session and lands separately).

## Open questions for the backend session

1. **Provider:** Stripe is the assumed default — confirm. (Stripe Hosted Customer Portal is
   PCI-friendly and gives us the `Manage subscription` URL out of the box.)
2. **Plan tiers:** what are the canonical `planName` values? (Pilot / Starter / Growth /
   Scale are placeholders; final names + their `interviewsIncluded` / `seatsIncluded` defaults
   are TBD.)
3. **Usage rollup window:** is "interviews this month" calendar-month aligned (resets on the
   1st of each month) or billing-cycle aligned (resets on `next_bill_at`)? **The FE assumes
   calendar-month today** — change one line in `<UsageStats />` if the answer is
   billing-cycle.
4. **Audit-log retention:** is `auditLogRetentionDays` configurable per plan? If yes, the
   `BillingService.GetUsage` includes the per-plan value; if no, the FE hard-codes 365 and
   removes the field from the DTO.
5. **Tax / VAT lines on invoices:** does `InvoiceDTO.amountCents` include tax, or do we need
   a separate `taxCents` field? (The FE renders one amount per row today; add a tax line in
   the row's expanded view if needed.)
6. **Pro-rata invoices** (mid-cycle plan changes): how are they surfaced? (Just another
   `InvoiceDTO` row with a meaningful status? Or a separate `InvoiceLineDTO`?)
7. **Cancellation flow:** is "cancel subscription" done in the Stripe portal, or do we need
   an in-house `BillingService.CancelSubscription` RPC? Assume **Stripe portal** today
   (keeps PCI scope minimal).
