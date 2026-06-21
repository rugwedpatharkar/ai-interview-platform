"use client";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@ip/ui";
import { useRequireAuth } from "@ip/shared";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { CandidateShell } from "../../components/candidate-shell";
import { AccountTab } from "../../components/settings/account-tab";
import { AppearanceTab } from "../../components/settings/appearance-tab";
import { NotificationsTab } from "../../components/settings/notifications-tab";
import { PrivacyTab } from "../../components/settings/privacy-tab";
import { SecurityTab } from "../../components/settings/security-tab";
import { useAuth } from "../../lib/auth";
import { makeSettingsClient } from "./settings-client";

// v3 adds the "appearance" tab (per-user theme + base palette + accent). The order matches
// the visual priority in the spec: identity → safety → preferences → privacy → looks.
const TABS = ["account", "security", "notifications", "privacy", "appearance"] as const;

/** Reads ?tab= to pick the initial tab. Isolated so Next.js can Suspense-wrap the
 *  useSearchParams read without forcing the whole page into a fallback. */
function SettingsTabs() {
  const { api } = useAuth();
  const sp = useSearchParams();
  const requested = sp.get("tab") ?? "";
  const initial = (TABS as readonly string[]).includes(requested) ? requested : "account";
  // Live by default; mock when NEXT_PUBLIC_MOCK=1. Memoized per `api` so the mock's store
  // survives re-renders and the live client's request inflight cache is preserved.
  const client = useMemo(() => makeSettingsClient(api), [api]);

  return (
    <Tabs defaultValue={initial}>
      <TabsList className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface-muted p-1">
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
      <TabsContent value="appearance">
        {/* Shared verbatim with /company/settings — same `["preferences","appearance"]` key,
            so a change in one role's settings instantly reflects when the user lands in the
            other role's settings in the same session. */}
        <AppearanceTab />
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
        description="Manage your account, security, notifications, and how Aptura looks."
      />
      <Suspense fallback={null}>
        <SettingsTabs />
      </Suspense>
    </CandidateShell>
  );
}
