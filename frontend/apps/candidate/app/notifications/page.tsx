"use client";

import { errorMessage, useRequireAuth } from "@ip/shared";
import { Button, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@ip/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { NotificationItem } from "../../components/notification-item";
import { useAuth } from "../../lib/auth";
import {
  USE_MOCK,
  createNotificationsClient,
  iconForKind,
  makeMockNotificationsClient,
  notificationKeys,
} from "./notifications-client";

export default function NotificationsPage() {
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready);
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
  if (!token) return null; // hydration guard

  return (
    <CandidateShell>
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
      {q.data && q.data.notifications.length === 0 && (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="New notifications will show up here."
        />
      )}
      {q.data && q.data.notifications.length > 0 && (
        <Card className="divide-y divide-border p-1">
          {q.data.notifications.map((n) => (
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
    </CandidateShell>
  );
}
