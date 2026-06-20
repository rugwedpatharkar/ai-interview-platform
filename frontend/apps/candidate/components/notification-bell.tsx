"use client";

import { errorMessage } from "@ip/shared";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Skeleton,
} from "@ip/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useAuth } from "../lib/auth";
import { NotificationItem } from "./notification-item";
import {
  USE_MOCK,
  createNotificationsClient,
  iconForKind,
  makeMockNotificationsClient,
  notificationKeys,
} from "../app/notifications/notifications-client";
import { POLL_INTERVAL } from "../app/notifications/types";

/** Bell trigger + unread Badge + feed DropdownMenu. Owns the badge poll (durable seam), the lazy
 *  feed (only when open), and mark-read / mark-all-read. Mounted in the shell's actions slot. */
export function NotificationBell() {
  const { api, token } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const client = useMemo(
    () => (USE_MOCK ? makeMockNotificationsClient() : createNotificationsClient(api)),
    [api],
  );

  // Badge poll (the durable seam) — pauses on a hidden tab.
  const unread = useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: () => client.unreadCount(),
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
    enabled: Boolean(token),
  });

  // Feed (lazy — only when the dropdown is open).
  const feed = useQuery({
    queryKey: notificationKeys.feed(false),
    queryFn: () => client.list({ page: 1, pageSize: 20 }),
    enabled: open,
  });

  async function ack(fn: () => Promise<number>) {
    const fresh = await fn();
    qc.setQueryData(notificationKeys.unread(), fresh); // instant badge
    await qc.invalidateQueries({ queryKey: notificationKeys.all }); // reconcile feed + badge
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && (unread.data ?? 0) > 0) void ack(() => client.markAllRead());
  }
  function onItemClick(id: string, link: string | null) {
    void ack(() => client.markRead(id));
    if (link) router.push(link); // deep-link read verbatim, never built from kind
  }

  if (!token) return null;
  const count = unread.data ?? 0;
  const items = feed.data?.notifications ?? [];

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        className="relative rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="size-5" aria-hidden />
        {count > 0 && (
          <Badge
            className="absolute -right-0.5 -top-0.5 min-w-4 bg-primary px-1 text-[10px] font-semibold tabular-nums text-primary-foreground"
          >
            {count > 9 ? "9+" : count}
          </Badge>
        )}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {count > 0 ? `${count} unread notifications` : "No unread notifications"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium text-foreground">Notifications</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={count === 0}
            onClick={() => void ack(() => client.markAllRead())}
          >
            Mark all read
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-1">
          {feed.isLoading && (
            <div className="flex flex-col gap-2 p-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          )}
          {!feed.isLoading && feed.isError && (
            <ErrorState message={errorMessage(feed.error)} retry={() => feed.refetch()} />
          )}
          {!feed.isLoading && !feed.isError && items.length === 0 && (
            <EmptyState
              icon={Bell}
              title="You're all caught up"
              description="New notifications will show up here."
            />
          )}
          {!feed.isLoading &&
            !feed.isError &&
            items.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                icon={iconForKind(n.kind)}
                onClick={() => onItemClick(n.id, n.link)}
              />
            ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
