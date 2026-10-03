// Notifications transport + the kind→icon map + query keys. Real gRPC client wraps
// `api.notification.*`; an in-memory mock keeps the bell + feed runnable when
// NEXT_PUBLIC_MOCK=1.
//
// Wired 2026-06-21 — `api.notification.*` is live on the admin transport. Field mapping:
// proto NotificationDTO uses `readAt: string` ("" when unread) and `link: string` ("" when
// absent) — both normalized to nullable strings here via mapNotification.
//
// Lucide gotcha: icons MUST stay imported in the app (not @ip/ui). That stays unchanged.

import {
  Bell,
  CalendarClock,
  ClipboardCheck,
  Dumbbell,
  MessageSquare,
  PartyPopper,
  Star,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import type { NotificationDTO } from "@ip/api-client";
import type { Notification, NotificationsClient, NotificationsPage } from "./types";

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

const nz = (s: string | null | undefined): string | null => (s && s.length ? s : null);

// proto sends "" for absent link/read_at; normalize so the UI tests `readAt === null` for unread.
export function mapNotification(d: NotificationDTO | Notification): Notification {
  return {
    id: d.id,
    kind: d.kind,
    subject: d.subject,
    body: d.body,
    link: nz(d.link),
    createdAt: d.createdAt,
    readAt: nz(d.readAt),
  };
}

export const notificationKeys = {
  all: ["notifications"] as const,
  feed: (unreadOnly: boolean) => ["notifications", "feed", unreadOnly] as const,
  unread: () => ["notifications", "unread"] as const,
};

// kind → icon resolved HERE (lucide imported in the app — the @ip/ui gotcha); Bell fallback for
// unknown kinds. Imported by both the bell connector and the full-feed page.
export const KIND_ICON: Record<string, LucideIcon> = {
  interview_pending: CalendarClock,
  new_message: MessageSquare,
  assessment_ready: ClipboardCheck,
  assessment_review: ClipboardCheck,
  aptitude_pending: ClipboardCheck,
  practice_complete: Dumbbell,
  shortlisted: Star,
  hired: PartyPopper,
  rejected: XCircle,
  gated_out: XCircle,
};

export function iconForKind(kind: string): LucideIcon {
  return KIND_ICON[kind] ?? Bell;
}

import type { ApiClients } from "@ip/api-client";
type Api = ApiClients;

/** Real gRPC client over `api.notification.*`. NotificationService.List returns
 *  NotificationDTO[]; mapNotification narrows it to the app's Notification shape (nullable
 *  link/readAt). The badge poll calls `list({ pageSize: 1 })` so the bell never re-fetches
 *  rows it doesn't render. */
export function createNotificationsClient(api: Api): NotificationsClient {
  const n = api.notification;
  const client: NotificationsClient = {
    async list({ unreadOnly = false, page = 1, pageSize = 20 } = {}): Promise<NotificationsPage> {
      const r = await n.listNotifications({ unreadOnly, page, pageSize });
      return {
        notifications: r.notifications.map(mapNotification),
        unreadCount: r.unreadCount,
        total: r.total,
        page: r.page,
        pageSize: r.pageSize,
      };
    },
    // badge poll: one row + the fresh count
    async unreadCount() {
      return (await client.list({ pageSize: 1 })).unreadCount;
    },
    async markRead(id) {
      return (await n.markRead({ notificationId: id })).unreadCount;
    },
    async markAllRead() {
      return (await n.markAllRead({})).unreadCount;
    },
  };
  return client;
}

/** In-memory mock so the bell + feed build + demo before `pnpm gen`. Includes the no-ghosting
 *  "you've got an answer" (`new_message`) kind deep-linking to the conversation. */
export function makeMockNotificationsClient(): NotificationsClient {
  const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const rows: Notification[] = [
    {
      id: "n1",
      kind: "new_message",
      subject: "You've got an answer",
      body: "Northwind replied about the Senior Frontend role.",
      link: "/messages/a1",
      createdAt: iso(1),
      readAt: null,
    },
    {
      id: "n2",
      kind: "interview_pending",
      subject: "Interview ready",
      body: "Your AI interview for Northwind is unlocked.",
      link: "/interview/i1",
      createdAt: iso(3),
      readAt: null,
    },
    {
      id: "n3",
      kind: "shortlisted",
      subject: "You're shortlisted",
      body: "Northwind moved you to the shortlist.",
      link: null,
      createdAt: iso(26),
      readAt: iso(20),
    },
  ];
  const fresh = () => rows.filter((r) => r.readAt === null).length;
  return {
    async list({ unreadOnly = false, page = 1, pageSize = 20 } = {}) {
      const items = unreadOnly ? rows.filter((r) => r.readAt === null) : rows;
      return {
        notifications: items.slice(0, pageSize),
        unreadCount: fresh(),
        total: items.length,
        page,
        pageSize,
      };
    },
    async unreadCount() {
      return fresh();
    },
    async markRead(id) {
      const r = rows.find((x) => x.id === id);
      if (r && !r.readAt) r.readAt = iso(0);
      return fresh();
    },
    async markAllRead() {
      rows.forEach((r) => {
        if (!r.readAt) r.readAt = iso(0);
      });
      return 0;
    },
  };
}
