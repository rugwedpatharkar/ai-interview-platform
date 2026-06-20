"use client";

import { errorMessage } from "@ip/shared";
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton } from "@ip/ui";
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
      {q.isLoading && (
        <Card className="divide-y divide-border p-1" aria-busy="true" aria-label="Loading notifications">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2.5">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </Card>
      )}
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
          {rows.map((n, i) => (
            <NotificationItem
              key={n.id}
              index={i}
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
