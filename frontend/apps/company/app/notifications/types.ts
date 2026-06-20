// Notifications contract — the FE codes against this until `pnpm gen` exposes `api.notifications.*`.
// Read by short-poll; `unread_count` is always the server's fresh count_documents.

// the _MESSAGES keys; widen to string at the boundary so an unknown server kind never throws.
export type NotificationKind =
  | "interview_pending"
  | "aptitude_pending"
  | "gated_out"
  | "shortlisted"
  | "hired"
  | "rejected"
  | "assessment_review"
  | "new_message"
  | "assessment_ready"
  | "practice_complete";

export interface Notification {
  id: string;
  kind: NotificationKind | string;
  subject: string;
  body: string;
  link: string | null; // normalize proto "" → null
  createdAt: string;
  readAt: string | null;
}

export interface NotificationsPage {
  notifications: Notification[];
  unreadCount: number;
  total: number;
  page: number;
  pageSize: number;
}

/** The seam both the real (gRPC) and mock clients satisfy. */
export interface NotificationsClient {
  list(opts?: {
    unreadOnly?: boolean;
    page?: number;
    pageSize?: number;
  }): Promise<NotificationsPage>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<number>; // returns the fresh unread_count
  markAllRead(): Promise<number>; // returns 0
}

export const POLL_INTERVAL = 30_000; // badge poll cadence (pauses on a hidden tab)
