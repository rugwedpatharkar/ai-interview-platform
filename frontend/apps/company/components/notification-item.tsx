"use client";

import { cn } from "@ip/ui";
import type { LucideIcon } from "lucide-react";

import type { Notification } from "../app/notifications/types";

export interface NotificationItemProps {
  notification: Notification;
  icon: LucideIcon; // resolved by the KIND_ICON map (Bell fallback)
  onClick?: () => void;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const mins = Math.round(diff / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(-mins, "minute");
  const hrs = Math.round(mins / 60);
  if (Math.abs(hrs) < 24) return rtf.format(-hrs, "hour");
  return rtf.format(-Math.round(hrs / 24), "day");
}

/** One feed row — icon-by-kind + subject + clamped body + relative time + unread dot. */
export function NotificationItem({ notification: n, icon: Icon, onClick }: NotificationItemProps) {
  const unread = n.readAt === null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${n.subject} — ${unread ? "unread" : "read"}`}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-surface-muted",
        unread && "bg-surface-muted/40",
      )}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{n.subject}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatRelative(n.createdAt)}
          </span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>
      </span>
      {unread && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
      )}
    </button>
  );
}
