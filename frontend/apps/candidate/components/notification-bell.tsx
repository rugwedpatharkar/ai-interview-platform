"use client";

// Connector: the parameterized NotificationBell lives in @ip/ui; this binds it to the app's
// auth client, notifications client, kind→icon map, and query keys. The shell renders
// `<NotificationBell />` (no props).
import { errorMessage } from "@ip/shared";
import { NotificationBell as SharedNotificationBell } from "@ip/ui";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { useAuth } from "../lib/auth";
import {
  USE_MOCK,
  createNotificationsClient,
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
    />
  );
}
