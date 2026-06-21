"use client";

import { Alert, EmptyState, ErrorState, LoadingState } from "@ip/ui";
import { errorMessage, useAuthedQuery, useRequireRole } from "@ip/shared";
import { CreditCard, FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CompanyShell } from "../../../components/company-shell";
import { useAuth } from "../../../lib/auth";
import {
  type BillingClient,
  type InvoiceDTO,
  type PaymentMethodDTO,
  type SubscriptionDTO,
  type UsageDTO,
  makeMockBillingClient,
} from "./billing-client";

// Billing — admin-only. Pre-launch: no real subscription / invoices / cards exist; the page
// renders truthful empty states and a single CTA to /pilot for the pilot conversation.
// Backend contract TBD — see billing-client.ts for the proposed DTO shapes.
export default function BillingPage() {
  const { token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["company_admin"], ready);

  const [client] = useState<BillingClient>(() => makeMockBillingClient());

  const sub = useAuthedQuery(token, {
    queryKey: ["billing", "subscription"],
    queryFn: () => client.getSubscription(),
  });
  const invoices = useAuthedQuery(token, {
    queryKey: ["billing", "invoices"],
    queryFn: () => client.listInvoices(),
  });
  const payment = useAuthedQuery(token, {
    queryKey: ["billing", "payment-method"],
    queryFn: () => client.getPaymentMethod(),
  });
  const usage = useAuthedQuery(token, {
    queryKey: ["billing", "usage"],
    queryFn: () => client.getUsage(),
  });

  if (identity?.role && identity.role !== "company_admin") {
    return (
      <CompanyShell>
        <header className="mb-8">
          <h1 className="ap-h2">Billing</h1>
        </header>
        <Alert tone="info" title="Admins only">
          Only company admins can view or change billing.
        </Alert>
      </CompanyShell>
    );
  }

  return (
    <CompanyShell>
      <header className="mb-8 flex flex-col gap-3">
        <p className="ap-eyebrow">Billing</p>
        <h1 className="ap-h2">Plan, invoices, and usage.</h1>
        <p className="ap-lead text-base">
          Aptura is pre-launch — there&apos;s no public pricing yet. If you&apos;d like to
          run a pilot, we can shape one to your hiring volume.
        </p>
      </header>

      <div className="grid gap-6">
        <PlanSection q={sub} />
        <UsageSection q={usage} />
        <InvoicesSection q={invoices} />
        <PaymentMethodSection q={payment} />
      </div>
    </CompanyShell>
  );
}

type AsyncQ<T> = {
  data?: T;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
};

// ---------- 1 · Plan card (anchor) ----------
function PlanSection({ q }: { q: AsyncQ<SubscriptionDTO> }) {
  return (
    <section>
      <div className="ap-cell ap-cell--anchor">
        <span className="ap-cell-tag">PLAN</span>
        <h2 className="ap-h4">Subscription</h2>

        {q.isLoading && (
          <div className="mt-4">
            <LoadingState />
          </div>
        )}
        {q.isError && (
          <div className="mt-4">
            <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
          </div>
        )}

        {q.data && q.data.status === "none" && (
          <div className="mt-5 flex flex-col gap-4">
            <p className="text-base text-ink-2">
              No active subscription — talk to us about a pilot. Pricing depends on
              hiring volume and integrations.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/pilot" className="ap-btn ap-btn-primary">
                Book a pilot
              </Link>
              <Link href="/what-we-dont-do" className="ap-btn ap-btn-ghost">
                What we don&apos;t do
              </Link>
            </div>
          </div>
        )}

        {q.data && q.data.status !== "none" && <ActivePlan sub={q.data} />}
      </div>
    </section>
  );
}

function ActivePlan({ sub }: { sub: SubscriptionDTO }) {
  const interviewPct =
    sub.monthlyInterviewQuota > 0
      ? Math.min(100, (sub.monthlyInterviewsUsed / sub.monthlyInterviewQuota) * 100)
      : 0;
  const seatPct =
    sub.seatsIncluded > 0
      ? Math.min(100, (sub.seatsUsed / sub.seatsIncluded) * 100)
      : 0;
  return (
    <div className="mt-5 flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="font-display text-2xl font-semibold text-foreground">
            {sub.planName || "—"}
          </p>
          <p className="mt-1 text-sm text-ink-2">
            Renews {sub.renewsAt ? new Date(sub.renewsAt).toLocaleDateString() : "—"}
          </p>
        </div>
        <span className="ap-pill ap-pill--good capitalize">{sub.status}</span>
      </div>

      <div className="ap-bar">
        <span className="name">Interviews this month</span>
        <span className="v">
          {sub.monthlyInterviewsUsed} / {sub.monthlyInterviewQuota}
        </span>
        <span className="t">
          <i style={{ width: `${interviewPct}%` }} />
        </span>
      </div>
      <div className="ap-bar">
        <span className="name">Seats</span>
        <span className="v">
          {sub.seatsUsed} / {sub.seatsIncluded}
        </span>
        <span className="t">
          <i style={{ width: `${seatPct}%` }} />
        </span>
      </div>
    </div>
  );
}

// ---------- 2 · Usage detail ----------
function UsageSection({ q }: { q: AsyncQ<UsageDTO> }) {
  return (
    <section>
      <div className="ap-cell">
        <span className="ap-cell-tag">USAGE</span>
        <h2 className="ap-h4">This month</h2>

        {q.isLoading && (
          <div className="mt-4">
            <LoadingState />
          </div>
        )}
        {q.isError && (
          <div className="mt-4">
            <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
          </div>
        )}

        {q.data && (
          <div className="ap-stats mt-5">
            <UsageStat
              n={String(q.data.interviewsThisMonth)}
              l="Proctored interviews."
            />
            <UsageStat n={String(q.data.seatsActive)} l="Active team seats." />
            <UsageStat
              n={q.data.auditRetentionDays > 0 ? String(q.data.auditRetentionDays) : "—"}
              unit={q.data.auditRetentionDays > 0 ? "d" : undefined}
              l="Audit-log retention."
            />
            <UsageStat n="—" l="Cost so far. Pre-launch." />
          </div>
        )}
      </div>
    </section>
  );
}

function UsageStat({ n, unit, l }: { n: string; unit?: string; l: string }) {
  return (
    <div className="ap-stat">
      <div className="ap-stat-n">
        {n}
        {unit && <span className="ap-stat-unit">{unit}</span>}
      </div>
      <div className="ap-stat-l">{l}</div>
    </div>
  );
}

// ---------- 3 · Invoice history ----------
function InvoicesSection({ q }: { q: AsyncQ<InvoiceDTO[]> }) {
  return (
    <section>
      <div className="ap-cell">
        <span className="ap-cell-tag">INVOICES</span>
        <h2 className="ap-h4">History</h2>

        {q.isLoading && (
          <div className="mt-4">
            <LoadingState />
          </div>
        )}
        {q.isError && (
          <div className="mt-4">
            <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
          </div>
        )}

        {q.data && q.data.length === 0 && (
          <div className="mt-4">
            <EmptyState
              icon={FileText}
              title="No invoices yet"
              description="Invoices appear here once your plan is active."
            />
          </div>
        )}

        {q.data && q.data.length > 0 && (
          <div className="mt-4 table-wrap overflow-x-auto">
            <table className="data w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-ink-3">
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Issued</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((inv) => (
                  <tr key={inv.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs text-ink-2">
                      {inv.number}
                    </td>
                    <td className="px-4 py-3 text-ink-2">
                      {new Date(inv.issuedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">
                      {formatMoney(inv.amountCents, inv.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          inv.status === "paid"
                            ? "ap-pill ap-pill--good"
                            : inv.status === "open"
                              ? "ap-pill ap-pill--warn"
                              : "ap-pill"
                        }
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inv.hostedUrl ? (
                        <a
                          className="ap-btn ap-btn-ghost ap-btn-sm"
                          href={inv.hostedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function formatMoney(cents: number, currency: string): string {
  if (!Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

// ---------- 4 · Payment method ----------
function PaymentMethodSection({ q }: { q: AsyncQ<PaymentMethodDTO | null> }) {
  return (
    <section>
      <div className="ap-cell">
        <span className="ap-cell-tag">PAYMENT</span>
        <h2 className="ap-h4">Payment method</h2>

        {q.isLoading && (
          <div className="mt-4">
            <LoadingState />
          </div>
        )}
        {q.isError && (
          <div className="mt-4">
            <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
          </div>
        )}

        {q.data === null && !q.isLoading && !q.isError && (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface-2">
                <CreditCard className="size-4 text-ink-2" aria-hidden />
              </span>
              <div>
                <p className="font-medium text-foreground">No card on file</p>
                <p className="mt-0.5 text-sm text-ink-2">
                  Card management comes with public launch — pilot billing is invoiced.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="ap-btn ap-btn-ghost ap-btn-sm"
              disabled
              title="Coming with public launch"
            >
              Update
            </button>
          </div>
        )}

        {q.data && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface">
                <CreditCard className="size-4 text-teal" aria-hidden />
              </span>
              <div>
                <p className="font-medium capitalize text-foreground">
                  {q.data.brand} ending {q.data.last4}
                </p>
                <p className="text-xs text-ink-3">
                  Expires {String(q.data.expMonth).padStart(2, "0")}/{q.data.expYear}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="ap-btn ap-btn-ghost ap-btn-sm"
              disabled
              title="Coming with public launch"
            >
              Update
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
