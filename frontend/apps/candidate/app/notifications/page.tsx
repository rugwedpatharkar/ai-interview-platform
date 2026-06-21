"use client";

import { errorMessage, track, useRequireAuth } from "@ip/shared";
import { EmptyState, ErrorState, Skeleton, cn } from "@ip/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
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
import { POLL_INTERVAL } from "./types";

export default function NotificationsPage() {
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready);
  const qc = useQueryClient();
  const router = useRouter();
  const client = useMemo(
    () =>
      USE_MOCK ? makeMockNotificationsClient() : createNotificationsClient(api),
    [api],
  );
  // Full feed — gated on token, refreshed at the same cadence as the badge so the
  // page stays current while open. Pauses on a hidden tab (react-query default).
  const q = useQuery({
    queryKey: notificationKeys.feed(false),
    queryFn: () => client.list({ page: 1, pageSize: 50 }),
    enabled: Boolean(token),
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
  });

  async function markAll() {
    await client.markAllRead();
    await qc.invalidateQueries({ queryKey: notificationKeys.all });
  }
  if (!token) return null; // hydration guard

  const items = q.data?.notifications ?? [];
  const unread = q.data?.unreadCount ?? 0;
  const total = q.data?.total ?? 0;

  return (
    <CandidateShell>
      <div className="flex flex-col gap-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="ap-eyebrow">Inbox</p>
            <h1 className="ap-h2 mt-2">Notifications</h1>
            <p className="ap-lead mt-2 text-base">
              Real signal from real companies — interview invites, decisions, and
              messages. No drip campaigns.
            </p>
          </div>
          <button
            type="button"
            disabled={unread === 0}
            onClick={() => void markAll()}
            className={cn(
              "ap-btn ap-btn-ghost shrink-0",
              unread === 0 && "cursor-not-allowed opacity-60",
            )}
          >
            <BellOff className="size-4" aria-hidden />
            Mark all read
          </button>
        </header>

        {/* Anchor cell — the feed */}
        <section className="ap-cell ap-cell--anchor p-2 sm:p-3">
          <span className="ap-cell-tag">
            {unread > 0 ? `${unread} unread · ${total} total` : `${total} total`}
          </span>

          {q.isLoading && (
            <div
              className="flex flex-col gap-1"
              aria-busy="true"
              aria-label="Loading notifications"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {q.isError && (
            <div className="p-2">
              <ErrorState
                message={errorMessage(q.error)}
                retry={() => q.refetch()}
              />
            </div>
          )}

          {q.data && items.length === 0 && (
            <div className="p-2">
              <EmptyState
                icon={Bell}
                title="You're all caught up"
                description="New notifications will show up here. We'll also send them by email so nothing slips."
              />
            </div>
          )}

          {q.data && items.length > 0 && (
            <ul className="divide-y divide-line">
              {items.map((n, i) => (
                <NotificationItem
                  key={n.id}
                  index={i}
                  notification={n}
                  icon={iconForKind(n.kind)}
                  onClick={() => {
                    track("notification.opened", { notification_id: n.id, kind: n.kind });
                    // Mark-read fires regardless of link; the router.push is verbatim from
                    // the prior implementation so the deep-link contract stays intact.
                    void client
                      .markRead(n.id)
                      .then(() =>
                        qc.invalidateQueries({ queryKey: notificationKeys.all }),
                      );
                    if (n.link) router.push(n.link);
                  }}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </CandidateShell>
  );
}
