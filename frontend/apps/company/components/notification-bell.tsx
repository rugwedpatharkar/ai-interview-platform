"use client";

// Connector: the parameterized NotificationBell lives in @ip/ui; this binds it to the app's
// auth client, notifications client, kind→icon map, and query keys. Passes the COMPANY_KINDS
// render-filter so a recruiter never sees candidate-only/practice rows (belt-and-suspenders;
// the backend feed already excludes them). The shell renders `<NotificationBell />` (no props).
import { errorMessage } from "@ip/shared";
import { NotificationBell as SharedNotificationBell } from "@ip/ui";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { useAuth } from "../lib/auth";
import {
  USE_MOCK,
  createNotificationsClient,
  filterCompanyKinds,
  iconForKind,
  makeMockNotificationsClient,
  notificationKeys,
} from "../app/notifications/notifications-client";
import { POLL_INTERVAL } from "../app/notifications/types";

export function NotificationBell() {
  const { api, token } = useAuth();
  const router = useRouter();
  const client = useMemo(
    () => (USE_MOCK ? makeMockNotificationsClient() : createNotificationsClient(api)),
    [api],
  );

  return (
    <SharedNotificationBell
      client={client}
      token={token}
      iconForKind={iconForKind}
      notificationKeys={notificationKeys}
      pollInterval={POLL_INTERVAL}
      onNavigate={(href) => router.push(href)}
      errorMessage={errorMessage}
      filterItems={filterCompanyKinds}
    />
  );
}
