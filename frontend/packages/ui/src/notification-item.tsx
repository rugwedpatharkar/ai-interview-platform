"use client";

import { useEffect, useState } from "react";

import { cn } from "./cn.js";
import type { LucideIcon } from "lucide-react";

/** The notification fields this row renders. App `Notification` types are structurally
 *  compatible (they carry these plus `id`/`kind`/`link`). */
export interface NotificationItemData {
  subject: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationItemProps {
  notification: NotificationItemData;
  icon: LucideIcon; // resolved by the KIND_ICON map (Bell fallback)
  onClick?: () => void;
  index?: number; // feed position — drives the capped mount-stagger delay
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

/** Relative timestamp ("2 minutes ago"). The relative string depends on `Date.now()`,
 *  which differs between server and client — so SSR + first client render show a stable
 *  absolute date, then we swap to the relative string after mount to avoid a hydration
 *  mismatch. */
function RelativeTime({ iso }: { iso: string }) {
  const [relative, setRelative] = useState<string | null>(null);
  useEffect(() => setRelative(formatRelative(iso)), [iso]);
  return (
    <time
      dateTime={iso}
      className="shrink-0 text-xs tabular-nums text-muted-foreground"
    >
      {relative ?? new Date(iso).toLocaleDateString()}
    </time>
  );
}

/** One feed row — icon-by-kind + subject + clamped body + relative time + unread dot. */
export function NotificationItem({
  notification: n,
  icon: Icon,
  onClick,
  index = 0,
}: NotificationItemProps) {
  const unread = n.readAt === null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${n.subject} — ${unread ? "unread" : "read"}`}
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
      className={cn(
        "flex w-full animate-rise-in items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-surface-muted",
        unread && "bg-surface-muted/40",
      )}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{n.subject}</span>
          <RelativeTime iso={n.createdAt} />
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>
      </span>
      {unread && (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />
      )}
    </button>
  );
}
