"use client";

import { errorMessage } from "@ip/shared";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@ip/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { CompanyShell } from "../../components/company-shell";
import { NotificationItem } from "../../components/notification-item";
import { useAuth } from "../../lib/auth";
import {
  USE_MOCK,
  createNotificationsClient,
  filterCompanyKinds,
  iconForKind,
  makeMockNotificationsClient,
  notificationKeys,
} from "./notifications-client";

export default function NotificationsPage() {
  const { api, token } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const client = useMemo(
    () => (USE_MOCK ? makeMockNotificationsClient() : createNotificationsClient(api)),
    [api],
  );
  const q = useQuery({
    queryKey: notificationKeys.feed(false),
    queryFn: () => client.list({ page: 1, pageSize: 50 }),
    enabled: Boolean(token),
  });
  async function markAll() {
    await client.markAllRead();
    await qc.invalidateQueries({ queryKey: notificationKeys.all });
  }
  // CompanyShell enforces auth/role; keep the page resilient to the no-token first paint.
  if (!token) return null;

  const rows = filterCompanyKinds(q.data?.notifications ?? []);
  return (
    <CompanyShell>
      <PageHeader
        title="Notifications"
        action={
          <Button
            variant="ghost"
            size="sm"
            disabled={(q.data?.unreadCount ?? 0) === 0}
            onClick={() => void markAll()}
          >
            Mark all read
          </Button>
        }
      />
      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />}
      {q.data && rows.length === 0 && (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="New notifications will show up here."
        />
      )}
      {rows.length > 0 && (
        <Card className="divide-y divide-border p-1">
          {rows.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              icon={iconForKind(n.kind)}
              onClick={() => {
                void client
                  .markRead(n.id)
                  .then(() => qc.invalidateQueries({ queryKey: notificationKeys.all }));
                if (n.link) router.push(n.link);
              }}
            />
          ))}
        </Card>
      )}
    </CompanyShell>
  );
}
