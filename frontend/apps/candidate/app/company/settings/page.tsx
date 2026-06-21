"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@ip/ui";
import { useRequireAuth } from "@ip/shared";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { CompanyShell } from "../../../components/company-shell";
import { AccountTab } from "../../../components/settings/account-tab";
import { AppearanceTab } from "../../../components/settings/appearance-tab";
import { NotificationsTab } from "../../../components/settings/notifications-tab";
import { PrivacyTab } from "../../../components/settings/privacy-tab";
import { SecurityTab } from "../../../components/settings/security-tab";
import { useAuth } from "../../../lib/auth";
import { makeSettingsClient } from "../../settings/settings-client";

// Same five tabs as the candidate side. The underlying RPCs (account/security/notifications/
// privacy) are token-scoped and role-agnostic — the company shell and routes here are the
// only delta.
const TABS = ["account", "security", "notifications", "privacy", "appearance"] as const;

function CompanySettingsTabs() {
  const { api } = useAuth();
  const sp = useSearchParams();
  const requested = sp.get("tab") ?? "";
  const initial = (TABS as readonly string[]).includes(requested) ? requested : "account";
  // Live by default; mock when NEXT_PUBLIC_MOCK=1. Memoized per `api`.
  const client = useMemo(() => makeSettingsClient(api), [api]);

  return (
    <Tabs defaultValue={initial}>
      <TabsList className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1">
        {(
          [
            ["account", "Account"],
            ["security", "Security"],
            ["notifications", "Notifications"],
            ["privacy", "Privacy"],
            ["appearance", "Appearance"],
          ] as const
        ).map(([value, label]) => (
          <TabsTrigger
            key={value}
            value={value}
            className="rounded-lg mb-0 border-0 px-3.5 py-1.5 text-sm font-medium text-ink-2 transition-colors hover:text-ink-deep data-[state=active]:bg-surface data-[state=active]:text-ink-deep data-[state=active]:shadow-sm"
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
      <TabsContent value="appearance">
        {/* Shared verbatim with /settings (candidate side). Same query key, same component,
            same client seam — so a change made here propagates to the candidate view (and
            vice versa) without an extra invalidation. */}
        <AppearanceTab />
      </TabsContent>
    </Tabs>
  );
}

export default function CompanySettingsPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready);
  if (!token) return null;

  return (
    <CompanyShell>
      <PageHeader
        title="Workspace settings"
        description="Manage your account, security, notifications, and how Aptura looks for your workspace."
      />
      <Suspense fallback={null}>
        <CompanySettingsTabs />
      </Suspense>
    </CompanyShell>
  );
}
