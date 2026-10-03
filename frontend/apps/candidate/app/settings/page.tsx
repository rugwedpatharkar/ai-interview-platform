"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@ip/ui";
import { useRequireAuth } from "@ip/shared";
import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { CandidateShell } from "../../components/candidate-shell";
import { AccountTab } from "../../components/settings/account-tab";
import { NotificationsTab } from "../../components/settings/notifications-tab";
import { PrivacyTab } from "../../components/settings/privacy-tab";
import { SecurityTab } from "../../components/settings/security-tab";
import { useAuth } from "../../lib/auth";
import { makeSettingsClient } from "./settings-client";

// Order matches the visual priority in the spec: identity → safety → preferences → privacy.
// The "appearance" tab was removed (2026-07-23): the product ships one fixed look, so there
// is nothing for a user to change.
const TABS = ["account", "security", "notifications", "privacy"] as const;
type TabKey = (typeof TABS)[number];

/** Reads ?tab= to pick the initial tab and writes it back on every click so
 *  the browser Back button and shareable "open your Security tab" deep links
 *  both work. Isolated so Next.js can Suspense-wrap the useSearchParams read
 *  without forcing the whole page into a fallback. */
function SettingsTabs() {
  const { api } = useAuth();
  const sp = useSearchParams();
  const router = useRouter();
  const requested = sp.get("tab") ?? "";
  const active: TabKey = (TABS as readonly string[]).includes(requested)
    ? (requested as TabKey)
    : "account";
  // Live by default; mock when NEXT_PUBLIC_MOCK=1. Memoized per `api` so the mock's store
  // survives re-renders and the live client's request inflight cache is preserved.
  const client = useMemo(() => makeSettingsClient(api), [api]);

  return (
    <Tabs
      value={active}
      onValueChange={(next) => router.replace(`/settings?tab=${next}`, { scroll: false })}
    >
      <TabsList className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface-muted p-1">
        {(
          [
            ["account", "Account"],
            ["security", "Security"],
            ["notifications", "Notifications"],
            ["privacy", "Privacy"],
          ] as const
        ).map(([value, label]) => (
          <TabsTrigger
            key={value}
            value={value}
            className="rounded-lg mb-0 border-0 px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="account">
        <AccountTab client={client} />
      </TabsContent>
      <TabsContent value="security">
        <SecurityTab client={client} />
      </TabsContent>
      <TabsContent value="notifications">
        <NotificationsTab client={client} />
      </TabsContent>
      <TabsContent value="privacy">
        <PrivacyTab />
      </TabsContent>
    </Tabs>
  );
}

export default function SettingsPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready);
  if (!token) return null;

  return (
    <CandidateShell>
      <PageHeader
        title="Settings"
        description="Manage your account, security, notifications, and privacy."
      />
      <Suspense fallback={null}>
        <SettingsTabs />
      </Suspense>
    </CandidateShell>
  );
}
