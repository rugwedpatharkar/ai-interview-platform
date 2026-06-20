"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@ip/ui";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { CompanyShell } from "../../components/company-shell";
import { AccountTab } from "../../components/settings/account-tab";
import { NotificationsTab } from "../../components/settings/notifications-tab";
import { PrivacyTab } from "../../components/settings/privacy-tab";
import { SecurityTab } from "../../components/settings/security-tab";
import { makeSettingsClient } from "./settings-client";

const TABS = ["account", "security", "notifications", "privacy"] as const;

/** Reads ?tab= to pick the initial tab. Isolated so Next.js can Suspense-wrap the
 *  useSearchParams read without forcing the whole page into a fallback. */
function SettingsTabs() {
  const sp = useSearchParams();
  const requested = sp.get("tab") ?? "";
  const initial = (TABS as readonly string[]).includes(requested) ? requested : "account";
  const client = useMemo(() => makeSettingsClient(), []);

  return (
    <Tabs defaultValue={initial}>
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="privacy">Privacy</TabsTrigger>
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
  // CompanyShell handles useRequireAuth + useRequireRole + the token gate.
  return (
    <CompanyShell>
      <PageHeader
        title="Settings"
        description="Manage your account, security, and notifications."
      />
      <Suspense fallback={null}>
        <SettingsTabs />
      </Suspense>
    </CompanyShell>
  );
}
