// Backend contract TBD — backend session owns final shape. These DTOs are the FE's working
// proposal: shape your protos after these and the page wires in with no JSX edits.
//
// Naming follows Stripe's familiar surface (subscription / invoice / payment-method /
// usage). All amount fields are minor units (cents) so the wire keeps int64 — display
// formats locally; no float math on money.

export type PlanTier = "pilot" | "starter" | "scale" | "enterprise" | "none";
export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled";

export interface SubscriptionDTO {
  status: SubscriptionStatus; // "none" pre-launch
  planTier: PlanTier;
  planName: string; // human label, e.g. "Pilot"
  seatsIncluded: number;
  seatsUsed: number;
  monthlyInterviewQuota: number;
  monthlyInterviewsUsed: number;
  renewsAt: string; // ISO; "" when none
  cancelledAt: string; // ISO; "" when not cancelled
}

export type InvoiceStatus = "paid" | "open" | "void" | "uncollectible";
export interface InvoiceDTO {
  id: string;
  number: string; // human ref, e.g. "INV-0023"
  issuedAt: string; // ISO
  amountCents: number;
  currency: string; // ISO 4217 (e.g. "USD")
  status: InvoiceStatus;
  hostedUrl: string; // Stripe hosted invoice URL or "" pre-launch
}

export interface PaymentMethodDTO {
  // Stripe-style card display. Pre-launch this is null — UI shows the empty state.
  brand: string; // "visa" | "mastercard" | etc.
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface UsageDTO {
  interviewsThisMonth: number;
  seatsActive: number;
  auditRetentionDays: number; // how long decision-audit rows are retained for THIS plan
}

export interface BillingClient {
  getSubscription(): Promise<SubscriptionDTO>;
  listInvoices(): Promise<InvoiceDTO[]>;
  getPaymentMethod(): Promise<PaymentMethodDTO | null>;
  getUsage(): Promise<UsageDTO>;
}

// Pre-launch truth: no subscription, no invoices, no payment method, zero usage.
// The page renders empty states throughout — no fake numbers anywhere.
export function makeMockBillingClient(): BillingClient {
  return {
    async getSubscription() {
      return {
        status: "none",
        planTier: "none",
        planName: "",
        seatsIncluded: 0,
        seatsUsed: 0,
        monthlyInterviewQuota: 0,
        monthlyInterviewsUsed: 0,
        renewsAt: "",
        cancelledAt: "",
      };
    },
    async listInvoices() {
      return [];
    },
    async getPaymentMethod() {
      return null;
    },
    async getUsage() {
      return {
        interviewsThisMonth: 0,
        seatsActive: 0,
        auditRetentionDays: 0,
      };
    },
  };
}
