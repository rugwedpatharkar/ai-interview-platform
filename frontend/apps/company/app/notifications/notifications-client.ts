// Notifications transport + the company kind→icon map + query keys + the COMPANY_KINDS render
// filter. Real gRPC client wraps `api.notifications.*`; an in-memory mock lets the bell + feed
// build before `pnpm gen`. The recruiter must never see candidate-only/practice rows — two layers
// of defense: the backend feed excludes them by identity, and this FE filter is belt-and-suspenders.
//
// gRPC swap: when `api.notifications.*` is generated, the `NotificationsApi` cast disappears and
// this file collapses to `@ip/shared/notifications.ts`. Components depend on `NotificationsClient`.

import {
  Bell,
  CalendarClock,
  ClipboardCheck,
  MessageSquare,
  Star,
  UserCheck,
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

// The kinds a recruiter cares about (new_message + the funnel transitions). practice_complete and
// candidate-personal kinds are deliberately absent — the render-filter drops anything not here.
export const COMPANY_KINDS = new Set<string>([
  "new_message",
  "assessment_review",
  "assessment_ready",
  "shortlisted",
  "hired",
  "rejected",
  "interview_pending",
]);

/** Belt-and-suspenders render filter: keep only recruiter-relevant kinds. */
export function filterCompanyKinds(rows: Notification[]): Notification[] {
  return rows.filter((r) => COMPANY_KINDS.has(r.kind));
}

// company kind → icon (lucide imported in the app — the @ip/ui gotcha); omits practice_complete.
export const KIND_ICON: Record<string, LucideIcon> = {
  new_message: MessageSquare,
  assessment_review: ClipboardCheck,
  assessment_ready: ClipboardCheck,
  interview_pending: CalendarClock,
  shortlisted: Star,
  hired: UserCheck,
  rejected: XCircle,
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

/** In-memory mock so the bell + feed build + demo before `pnpm gen`. Seeds recruiter-relevant
 *  rows plus one practice_complete row to prove the COMPANY_KINDS render-filter drops it. */
export function makeMockNotificationsClient(): NotificationsClient {
  const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const rows: Notification[] = [
    {
      id: "n1",
      kind: "new_message",
      subject: "New candidate reply",
      body: "Ada Lovelace replied on the Senior Frontend application.",
      link: "/jobs/j1/applicants/a1",
      createdAt: iso(1),
      readAt: null,
    },
    {
      id: "n2",
      kind: "assessment_ready",
      subject: "Report ready",
      body: "The interview report for Ada Lovelace is ready to review.",
      link: "/jobs/j1/applicants/a1",
      createdAt: iso(4),
      readAt: null,
    },
    {
      id: "n3",
      kind: "shortlisted",
      subject: "Candidate shortlisted",
      body: "Grace Hopper was moved to the shortlist for Backend Engineer.",
      link: null,
      createdAt: iso(28),
      readAt: iso(22),
    },
    // Candidate-only kind — the render-filter must drop this for a recruiter.
    {
      id: "n4",
      kind: "practice_complete",
      subject: "Practice complete",
      body: "A practice interview finished.",
      link: "/feedback/p1",
      createdAt: iso(2),
      readAt: null,
    },
  ];
  // Counts are over the recruiter-visible (filtered) rows so the badge matches what's shown.
  const visible = () => filterCompanyKinds(rows);
  const fresh = () => visible().filter((r) => r.readAt === null).length;
  return {
    async list({ unreadOnly = false, page = 1, pageSize = 20 } = {}) {
      const base = visible();
      const items = unreadOnly ? base.filter((r) => r.readAt === null) : base;
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
      visible().forEach((r) => {
        if (!r.readAt) r.readAt = iso(0);
      });
      return 0;
    },
  };
}
