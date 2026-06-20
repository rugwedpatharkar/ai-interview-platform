"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@ip/ui";
import { useRequireAuth } from "@ip/shared";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { CandidateShell } from "../../components/candidate-shell";
import { AccountTab } from "../../components/settings/account-tab";
import { NotificationsTab } from "../../components/settings/notifications-tab";
import { PrivacyTab } from "../../components/settings/privacy-tab";
import { SecurityTab } from "../../components/settings/security-tab";
import { useAuth } from "../../lib/auth";
import { makeSettingsClient } from "./settings-client";

const TABS = ["account", "security", "notifications", "privacy"] as const;

/** Reads ?tab= to pick the initial tab. Isolated so Next.js can Suspense-wrap the
 *  useSearchParams read without forcing the whole page into a fallback. */
function SettingsTabs() {
  const sp = useSearchParams();
  const requested = sp.get("tab") ?? "";
  const initial = (TABS as readonly string[]).includes(requested) ? requested : "account";
  // The client is a stable mock today; memoized so swapping to createSettingsClient(api)
  // at integration keeps a single instance per mount.
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
  const { token, ready } = useAuth();
  useRequireAuth(token, ready);
  if (!token) return null;

  return (
    <CandidateShell>
      <PageHeader
        title="Settings"
        description="Manage your account, security, and notifications."
      />
      <Suspense fallback={null}>
        <SettingsTabs />
      </Suspense>
    </CandidateShell>
  );
}
