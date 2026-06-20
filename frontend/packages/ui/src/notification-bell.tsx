"use client";

import { Badge } from "./badge.js";
import { Button } from "./button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./dropdown-menu.js";
import { EmptyState, ErrorState } from "./layout.js";
import { NotificationItem, type NotificationItemData } from "./notification-item.js";
import { Skeleton } from "./skeleton.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

/** A feed row the bell renders. App `Notification` types satisfy this. */
export interface BellNotification extends NotificationItemData {
  id: string;
  kind: string;
  link: string | null;
}

/** The notifications client surface the bell drives. App clients satisfy this. */
export interface BellClient {
  unreadCount(): Promise<number>;
  list(opts: { page: number; pageSize: number }): Promise<{ notifications: BellNotification[] }>;
  markRead(id: string): Promise<number>;
  markAllRead(): Promise<number>;
}

/** Query-key helpers (app-owned so feed + badge invalidation never drift). */
export interface BellKeys {
  unread(): readonly unknown[];
  feed(unreadOnly: boolean): readonly unknown[];
  all: readonly unknown[];
}

export interface NotificationBellProps {
  /** Resolved (mock or real) notifications client. */
  client: BellClient;
  /** Auth token — the poll is gated on it and the trigger hides without it. */
  token: string | null;
  /** kind → icon (lucide imported in the app — the @ip/ui gotcha; Bell fallback). */
  iconForKind: (kind: string) => LucideIcon;
  /** App query keys. */
  notificationKeys: BellKeys;
  /** Badge poll cadence. */
  pollInterval: number;
  /** Deep-link navigation (app passes `router.push`). */
  onNavigate: (href: string) => void;
  /** Error → message mapper (app passes `errorMessage`). */
  errorMessage: (e: unknown) => string;
  /** Render-filter applied to the feed before display (company drops non-recruiter kinds). */
  filterItems?: (rows: BellNotification[]) => BellNotification[];
}

/** Bell trigger + unread Badge + feed DropdownMenu. Owns the badge poll (durable seam), the lazy
 *  feed (only when open), and mark-read / mark-all-read. Mounted in the shell's actions slot. The
 *  optional `filterItems` lets the company drop candidate-only/practice rows before rendering. */
export function NotificationBell({
  client,
  token,
  iconForKind,
  notificationKeys,
  pollInterval,
  onNavigate,
  errorMessage,
  filterItems,
}: NotificationBellProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const unread = useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: () => client.unreadCount(),
    refetchInterval: pollInterval,
    refetchIntervalInBackground: false,
    enabled: Boolean(token),
  });

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
    if (link) onNavigate(link); // deep-link read verbatim, never built from kind
  }

  const rawItems = feed.data?.notifications ?? [];
  const items = useMemo(
    () => (filterItems ? filterItems(rawItems) : rawItems),
    [filterItems, rawItems],
  );

  if (!token) return null;
  const count = unread.data ?? 0;

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
