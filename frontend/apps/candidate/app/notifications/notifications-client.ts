// Notifications transport + the kind→icon map + query keys. Real gRPC client wraps
// `api.notifications.*`; an in-memory mock lets the bell + feed build before `pnpm gen`.
//
// gRPC swap: when `api.notifications.*` is generated, the `NotificationsApi` cast disappears and
// this file collapses to `@ip/shared/notifications.ts`. Components depend on `NotificationsClient`.

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

import type { useAuth } from "../../lib/auth";
import type { Notification, NotificationsClient, NotificationsPage } from "./types";

export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

const nz = (s: string | null | undefined): string | null => (s && s.length ? s : null);

// proto sends "" for absent link/read_at; normalize so the UI tests `readAt === null` for unread.
export function mapNotification(d: Notification): Notification {
  return { ...d, link: nz(d.link), readAt: nz(d.readAt) };
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

type Api = ReturnType<typeof useAuth>["api"];

// The generated client doesn't carry `notifications` until `pnpm gen` runs; this is the seam.
interface NotificationsApi {
  notifications: {
    listNotifications(req: {
      unreadOnly: boolean;
      page: number;
      pageSize: number;
    }): Promise<{
      notifications: Notification[];
      unreadCount: number;
      total: number;
      page: number;
      pageSize: number;
    }>;
    markRead(req: { notificationId: string }): Promise<{ unreadCount: number }>;
    markAllRead(req: Record<string, never>): Promise<{ unreadCount: number }>;
  };
}

/** Real gRPC client. Wraps `api.notifications.*` directly until the shared package lands. */
export function createNotificationsClient(api: Api): NotificationsClient {
  const n = (api as unknown as NotificationsApi).notifications;
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
