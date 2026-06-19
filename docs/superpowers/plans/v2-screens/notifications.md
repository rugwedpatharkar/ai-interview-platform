# Screen: Notifications center + bell — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 3).
> **Route:** a shared `NotificationBell` mounted in **both** shells' header `actions` slot + `apps/candidate/app/notifications/page.tsx` + `apps/company/app/notifications/page.tsx` (the full feed) · **Mockup:** `aptura_notifications_center` · **Pillar:** [notifications-center](../../v2/2026-06-19-notifications-center.md)
> **Goal:** A bell with a live unread count (poll) + a dropdown of recent notifications in every header, plus a full feed page with mark-read / mark-all-read and per-kind deep-links. Includes the no-ghosting **"you've got an answer"** kind (`new_message`) so a candidate is always told when a recruiter replies. **Read by short-poll** (TanStack `refetchInterval`); no websockets / SSE in v1.

`NotificationBell` is a **shared, presentation-only `@ip/ui` component** (the `ChatWindow` precedent: no `@ip/shared`, no `@tanstack/react-query`, no `@ip/api-client` in its import graph). Each app owns a thin **connector** that binds the bell to the data layer and mounts it in its shell. The full-feed page follows the authed-gRPC screen pattern (`"use client"` → `useAuth` → `useQuery` → `@ip/ui`).

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW · **Service:** `admin.notification.v1` (authed gRPC-web `NotificationService` on **admin**). Mirrors `routes/decision.py` (servicer) over the existing `resources/notification.py` (extended). The write side **evolves** `TransitionNotifier` (the single email chokepoint) to also persist a row; this screen's RPCs are the **read/ack** API.

**Proto (`src/admin/app/routes/pb/notification.proto` — NEW; mirror `decision.proto` shape):**
```proto
syntax = "proto3";
package admin.notification.v1;

service NotificationService {
  rpc ListNotifications(ListRequest)      returns (ListResponse);
  rpc MarkRead(MarkReadRequest)           returns (MarkReadResponse);
  rpc MarkAllRead(MarkAllReadRequest)     returns (MarkReadResponse);
}
message NotificationDTO {
  string id = 1; string kind = 2; string subject = 3; string body = 4;
  string link = 5; string created_at = 6; string read_at = 7;   // ISO; "" when absent/unread
}
message ListRequest   { int32 page = 1; int32 page_size = 2; bool unread_only = 3; }
message ListResponse {
  repeated NotificationDTO notifications = 1; int32 unread_count = 2;   // ALWAYS a fresh count_documents
  int32 page = 3; int32 page_size = 4; int32 total = 5;
}
message MarkReadRequest    { string notification_id = 1; }
message MarkAllReadRequest {}
message MarkReadResponse   { int32 unread_count = 1; }   // the fresh post-ack count, for an instant badge
```

**RPC contract the FE renders:**
- `ListNotifications(unread_only, page)` → `ListResponse`. **Recipient-scoped** (reads `identity["id"]`, touches only that user's rows), desc by `created_at`, `page_size` clamped (≤ 50), `unread_only` filters to `read_at is None`. **`unread_count` is ALWAYS a fresh `count_documents({user_id, read_at: None})`** (the freshness contract — never a cached/denormalized counter).
- `MarkRead(id)` → `MarkReadResponse{unread_count}`. Sets `read_at` on the caller's row; **`NOT_FOUND`** if the id isn't theirs. Returns the fresh post-ack count so the connector updates the badge without a refetch round-trip.
- `MarkAllRead()` → `MarkReadResponse{unread_count: 0}`. Zeroes all the caller's unread.

**Auth/scope:** bearer required (`caller_identity`); every RPC is recipient-scoped to `identity["id"]`. (No comp-scoping at the service — the company recruiter and the candidate each read **their own** rows; the company connector additionally render-filters kinds, see Part B Task 5.)

**Backed by:** `model/notification.py` (`Notification`: `user_id`, `comp_id:str|None`, `kind`, `subject`, `body`, `link:str|None`, `read_at:datetime|None`, `dedup_key:str|None`, `created_at`) + `NotificationRepository` over the **`notifications`** collection:
- `list_by_user(user_id, *, unread_only, limit, skip)` (desc by `created_at`, capped), `unread_count(user_id)` (**fresh `count_documents`**), `mark_read(user_id, notification_id)` (scoped `$set read_at`; returns whether a row matched, for the 404), `mark_all_read(user_id)`, `insert(notification)` (**catches the duplicate-key on the sparse `(user_id, dedup_key)` index → no-op signal** so a redelivered trigger doesn't double-write), `delete_by_user(user_id)` (erasure cascade).
- Indexes (`infra/db.py` `INDEXES`):
  ```python
  IndexSpec("notifications", [("user_id", 1), ("created_at", -1)]),                       # feed (recency)
  IndexSpec("notifications", [("user_id", 1), ("read_at", 1)]),                           # unread filter / fresh COUNT
  IndexSpec("notifications", [("user_id", 1), ("dedup_key", 1)], {"unique": True, "sparse": True}),  # idempotency
  ```
- **Write side (evolved chokepoint, in the pillar plan — cross-ref, not this screen):** `TransitionNotifier.notify` writes a row **then** emails for every notifiable funnel state via a shared `_emit` (row first = the durable channel; the email is guarded — a row is never lost if email fails). `_MESSAGES` is the typed `dict[str, MessageSpec]` (`subject`/`body`/`icon?`/`link?`) extended with `assessment_review`, `new_message`, `assessment_ready`, `practice_complete`. `notify_event(user_id, comp_id, kind, link, dedup_key)` is the non-funnel entry (messaging / advisory-grade / practice call it best-effort). **Deep-link resolved once at write time** and stored on the row: `new_message`→`/messages/{application_id}`, `assessment_ready`→report, `practice_complete`→`/feedback/{practice_id}`, funnel→app page or `None`.
- **Erasure cascade:** `notifications` joins the `CandidateEraser` cascade (`delete_by_user`).

**Excluded from the DTO (grep-test):** `comp_id`, `dedup_key`, internal Mongo handles — only the `NotificationDTO` fields ship. (The FE never builds `link` from `kind`; it reads the stored `link` verbatim.)

**FE mock shape** (`frontend/apps/candidate/app/notifications/types.ts`) — the FE codes against this until `pnpm gen` exposes `api.notifications.*`:
```ts
// the _MESSAGES keys; widen to string at the boundary so an unknown server kind never throws.
export type NotificationKind =
  | "interview_pending" | "aptitude_pending" | "gated_out" | "shortlisted" | "hired" | "rejected"
  | "assessment_review" | "new_message" | "assessment_ready" | "practice_complete";

export interface Notification {
  id: string; kind: NotificationKind | string; subject: string; body: string;
  link: string | null; createdAt: string; readAt: string | null;   // normalize proto "" → null
}
export interface NotificationsPage {
  notifications: Notification[]; unreadCount: number; total: number; page: number; pageSize: number;
}
/** The seam both the real (gRPC) and mock clients satisfy. */
export interface NotificationsClient {
  list(opts?: { unreadOnly?: boolean; page?: number; pageSize?: number }): Promise<NotificationsPage>;
  unreadCount(): Promise<number>;
  markRead(id: string): Promise<number>;      // returns the fresh unread_count
  markAllRead(): Promise<number>;             // returns 0
}
export const POLL_INTERVAL = 30_000;          // badge poll cadence (pauses on a hidden tab)
```

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/packages/ui/src/notification-bell.tsx` (**shared, presentation-only**: bell trigger + unread `Badge` + feed `DropdownMenu`; **props in, callbacks out — no data fetching**).
- Create: `frontend/packages/ui/src/notification-item.tsx` (**shared, presentation-only**: one feed row — icon-by-kind + subject + clamped body + relative time + unread dot).
- Modify: `frontend/packages/ui/src/index.ts` (export `NotificationBell`, `NotificationItem` + their prop types).
- Create (candidate): `apps/candidate/app/notifications/types.ts`, `apps/candidate/app/notifications/notifications-client.ts` (real `createNotificationsClient(api)` over gRPC + `makeMockNotificationsClient()` + the `kind→LucideIcon` map + query keys), `apps/candidate/app/notifications/notifications-client.test.ts`, `apps/candidate/components/notification-bell-connected.tsx` (the `@ip/shared`↔`@ip/ui` seam — TanStack queries/mutations), `apps/candidate/app/notifications/page.tsx` (full feed).
- Modify (candidate): `apps/candidate/components/candidate-shell.tsx` (mount `<NotificationBellConnected />` in the `actions` slot, **before** the account `DropdownMenu`).
- Create (company): the same trio (`notifications-client.ts` + `notification-bell-connected.tsx` + `app/notifications/page.tsx`) with a `COMPANY_KINDS` render-filter; Modify `apps/company/components/company-shell.tsx` (mount in `actions`).

> **`NotificationBell` is the one genuinely shared component** (unlike messaging's app-local re-skin): it is pure presentation, so it lives in `@ip/ui` and both apps render it. All data/poll/mutation wiring + the lucide `kind→icon` map live in each app's `notification-bell-connected.tsx` (the lucide-must-be-in-app gotcha). When the BE lands and `@ip/api-client` exposes `notifications`, the per-app `notifications-client.ts` collapses to the shared `@ip/shared/notifications.ts` (`createNotificationsClient` + `notificationKeys`) — flag at handoff. **Until then** the gRPC client wraps `useAuth().api.notifications.*` directly behind `NEXT_PUBLIC_MOCK`.

**Components:** new shared `NotificationBell`, `NotificationItem`; per-app `NotificationBellConnected`; reuse `@ip/ui` `DropdownMenu*`, `Badge`, `Button`, `Skeleton`, `EmptyState`, `ErrorState`, `PageHeader`, `Card`. **Layering invariant:** `@ip/ui` must NOT gain a `@ip/shared` or `@tanstack/react-query` dependency — verify the import graph stays presentation-only.
**Query keys:** `["notifications"]` (root, for invalidation) · `["notifications","feed",unreadOnly]` (the feed) · `["notifications","unread"]` (the badge poll) — owned in `notifications-client.ts`.

### Task 1: Contract types + notifications client (mapping + query keys, testable)

- [ ] **Step 1: Write the failing test** — `apps/candidate/app/notifications/notifications-client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mapNotification, makeMockNotificationsClient } from "./notifications-client";

describe("mapNotification", () => {
  it("normalizes empty link/read_at to null", () => {
    const n = mapNotification({ id: "n1", kind: "shortlisted", subject: "You're shortlisted",
      body: "Northwind moved you forward.", link: "", createdAt: "2026-06-20T00:00:00Z", readAt: "" });
    expect(n.link).toBeNull();
    expect(n.readAt).toBeNull();
  });
});
describe("makeMockNotificationsClient", () => {
  it("markAllRead zeroes the unread count", async () => {
    const c = makeMockNotificationsClient();
    expect(await c.unreadCount()).toBeGreaterThan(0);
    expect(await c.markAllRead()).toBe(0);
    expect(await c.unreadCount()).toBe(0);
  });
  it("markRead decrements and returns the fresh count", async () => {
    const c = makeMockNotificationsClient();
    const before = await c.unreadCount();
    const { notifications } = await c.list({ unreadOnly: true });
    const after = await c.markRead(notifications[0].id);
    expect(after).toBe(before - 1);          // fresh count, not cached
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test notifications-client` → FAIL (module not defined). *(Wire `vitest` + a `test` script into `apps/candidate` if absent — fold in here, mirror the marketplace screen.)*
- [ ] **Step 3: Implement `types.ts`** (paste Part A) **and** `notifications-client.ts`:
```ts
import type { useAuth } from "../../lib/auth";
import type { Notification, NotificationsPage, NotificationsClient } from "./types";

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

type Api = ReturnType<typeof useAuth>["api"];

/** Real gRPC client. Wraps `api.notifications.*` directly until the shared package lands. */
export function createNotificationsClient(api: Api): NotificationsClient {
  return {
    async list({ unreadOnly = false, page = 1, pageSize = 20 } = {}): Promise<NotificationsPage> {
      const r = await api.notifications.listNotifications({ unreadOnly, page, pageSize });
      return {
        notifications: r.notifications.map(mapNotification),
        unreadCount: r.unreadCount, total: r.total, page: r.page, pageSize: r.pageSize,
      };
    },
    async unreadCount() { return (await this.list({ pageSize: 1 })).unreadCount; }, // badge poll: one row + the count
    async markRead(id) { return (await api.notifications.markRead({ notificationId: id })).unreadCount; },
    async markAllRead() { return (await api.notifications.markAllRead({})).unreadCount; },
  };
}
```
- [ ] **Step 4:** Add `makeMockNotificationsClient()` (lets the bell + feed build before `pnpm gen`):
```ts
import type { Notification, NotificationsClient } from "./types";

export function makeMockNotificationsClient(): NotificationsClient {
  const iso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  const rows: Notification[] = [
    { id: "n1", kind: "new_message", subject: "You've got an answer", body:
      "Northwind replied about the Senior Frontend role.", link: "/messages/a1", createdAt: iso(1), readAt: null },
    { id: "n2", kind: "interview_pending", subject: "Interview ready", body:
      "Your AI interview for Northwind is unlocked.", link: "/interview/i1", createdAt: iso(3), readAt: null },
    { id: "n3", kind: "shortlisted", subject: "You're shortlisted", body:
      "Northwind moved you to the shortlist.", link: null, createdAt: iso(26), readAt: iso(20) },
  ];
  const fresh = () => rows.filter((r) => r.readAt === null).length;
  return {
    async list({ unreadOnly = false, page = 1, pageSize = 20 } = {}) {
      const items = unreadOnly ? rows.filter((r) => r.readAt === null) : rows;
      return { notifications: items.slice(0, pageSize), unreadCount: fresh(),
        total: items.length, page, pageSize };
    },
    async unreadCount() { return fresh(); },
    async markRead(id) { const r = rows.find((x) => x.id === id); if (r && !r.readAt) r.readAt = iso(0); return fresh(); },
    async markAllRead() { rows.forEach((r) => { if (!r.readAt) r.readAt = iso(0); }); return 0; },
  };
}
export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";
```
- [ ] **Step 5: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test notifications-client` → PASS.
- [ ] **Step 6: Verify typecheck** — `npx pnpm@9.15.0 --filter @ip/candidate typecheck` clean. **(The real `createNotificationsClient` references `api.notifications` — keep it behind `USE_MOCK` until `pnpm gen` adds `notifications` to `ApiClients`; the real path typechecks once the proto regenerates.)**

### Task 2: `NotificationItem` (shared, presentation-only)

- [ ] **Step 1:** Create `frontend/packages/ui/src/notification-item.tsx`. One feed row; **props in, callback out** — receives the resolved `LucideIcon` (the app owns the `kind→icon` map per the lucide gotcha):
```tsx
import type { ComponentType, SVGProps } from "react";
import { cn } from "./cn.js";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

export interface NotificationItemProps {
  notification: {
    kind: string; subject: string; body: string;
    link: string | null; createdAt: string; readAt: string | null;
  };
  icon: IconType;            // resolved by the app's KIND_ICON map (Bell fallback)
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
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{n.subject}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatRelative(n.createdAt)}</span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>
      </span>
      {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-hidden />}
    </button>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/ui typecheck` clean.

### Task 3: `NotificationBell` (shared, presentation-only — bell + badge + feed dropdown)

- [ ] **Step 1:** Create `frontend/packages/ui/src/notification-bell.tsx`. **No `@ip/shared` dep, no data fetching** — the app passes state + callbacks (Task 4):
```tsx
import { Bell } from "lucide-react";
import { Badge } from "./badge.js";
import { Button } from "./button.js";
import { EmptyState } from "./layout.js";        // adjust to the real EmptyState export path
import { ErrorState } from "./layout.js";
import { Skeleton } from "./skeleton.js";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "./dropdown-menu.js";
import { NotificationItem, type NotificationItemProps } from "./notification-item.js";

export interface NotificationBellProps {
  items: Array<NotificationItemProps["notification"] & { id: string; icon: NotificationItemProps["icon"] }>;
  unreadCount: number;
  loading?: boolean;
  error?: string | null;
  onOpenChange?: (open: boolean) => void;        // app marks-all-read on open
  onMarkAllRead?: () => void;
  onItemClick?: (id: string, link: string | null) => void;
  onRetry?: () => void;
}

export function NotificationBell({
  items, unreadCount, loading, error, onOpenChange, onMarkAllRead, onItemClick, onRetry,
}: NotificationBellProps) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        className="relative rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="size-5" aria-hidden />
        {unreadCount > 0 && (
          <Badge tone="brand" className="absolute -right-0.5 -top-0.5 min-w-4 px-1 text-[10px]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        )}
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {unreadCount > 0 ? `${unreadCount} unread notifications` : "No unread notifications"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium text-foreground">Notifications</span>
          <Button variant="ghost" size="sm" disabled={unreadCount === 0} onClick={onMarkAllRead}>
            Mark all read
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-1">
          {loading && <div className="flex flex-col gap-2 p-2"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
          {!loading && error && <ErrorState message={error} retry={onRetry} />}
          {!loading && !error && items.length === 0 && (
            <EmptyState icon={Bell} title="You're all caught up" description="New notifications will show up here." />
          )}
          {!loading && !error && items.map(({ id, icon, ...n }) => (
            <NotificationItem key={id} notification={n} icon={icon} onClick={() => onItemClick?.(id, n.link)} />
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```
- [ ] **Step 2:** Export both from `frontend/packages/ui/src/index.ts`:
```ts
export { NotificationBell } from "./notification-bell.js";
export type { NotificationBellProps } from "./notification-bell.js";
export { NotificationItem } from "./notification-item.js";
export type { NotificationItemProps } from "./notification-item.js";
```
- [ ] **Step 3: Verify** — `npx pnpm@9.15.0 --filter @ip/ui typecheck` clean (reconcile the real export paths for `EmptyState`/`ErrorState`/`Skeleton`/`Badge` `tone` against `@ip/ui`'s actual surface; confirm `DropdownMenu` accepts `onOpenChange` — it wraps Radix, which does). **Confirm the import graph stays presentation-only** — no `@ip/shared` / `@tanstack/react-query` pulled in.

### Task 4: Candidate connector + mount in the shell

- [ ] **Step 1:** Create `apps/candidate/components/notification-bell-connected.tsx` (`"use client"` — the data seam):
```tsx
"use client";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Bell, CalendarClock, ClipboardCheck, Dumbbell, MessageSquare, PartyPopper, Star, XCircle,
} from "lucide-react";
import { NotificationBell, errorMessage } from "@ip/ui";   // errorMessage may live in @ip/shared — match the app's import
import { useAuth } from "../lib/auth";
import {
  createNotificationsClient, makeMockNotificationsClient, USE_MOCK, notificationKeys,
} from "../app/notifications/notifications-client";
import { POLL_INTERVAL } from "../app/notifications/types";

// kind → icon resolved HERE (lucide imported in the app — the @ip/ui gotcha); Bell fallback for unknown kinds.
const KIND_ICON: Record<string, typeof Bell> = {
  interview_pending: CalendarClock, new_message: MessageSquare,
  assessment_ready: ClipboardCheck, aptitude_pending: ClipboardCheck,
  practice_complete: Dumbbell, shortlisted: Star, hired: PartyPopper,
  rejected: XCircle, gated_out: XCircle,
};

export function NotificationBellConnected() {
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
    enabled: !!token,
  });

  // Feed (lazy — only when the dropdown is open).
  const feed = useQuery({
    queryKey: notificationKeys.feed(false),
    queryFn: () => client.list({ page: 1, pageSize: 20 }),
    enabled: open,
  });

  async function ack(fn: () => Promise<number>) {
    const fresh = await fn();
    qc.setQueryData(notificationKeys.unread(), fresh);              // instant badge
    await qc.invalidateQueries({ queryKey: notificationKeys.all }); // reconcile feed + badge
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && (unread.data ?? 0) > 0) void ack(() => client.markAllRead());
  }
  function onItemClick(id: string, link: string | null) {
    void ack(() => client.markRead(id));
    if (link) router.push(link);            // deep-link read verbatim, never built from kind
  }

  if (!token) return null;
  return (
    <NotificationBell
      items={(feed.data?.notifications ?? []).map((n) => ({ ...n, icon: KIND_ICON[n.kind] ?? Bell }))}
      unreadCount={unread.data ?? 0}
      loading={feed.isLoading}
      error={feed.error ? errorMessage(feed.error) : null}
      onOpenChange={onOpenChange}
      onMarkAllRead={() => void ack(() => client.markAllRead())}
      onItemClick={onItemClick}
      onRetry={() => feed.refetch()}
    />
  );
}
```
- [ ] **Step 2:** Mount in `apps/candidate/components/candidate-shell.tsx` — import `NotificationBellConnected` and render it in the existing `actions` slot **before** the account `DropdownMenu` (i.e. `<ThemeToggle /><NotificationBellConnected /><DropdownMenu>…`). No other shell change (the shell is already auth-gated, so the bell only renders for a signed-in user).
- [ ] **Step 3: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate build` green; **no console errors / no hydration warnings** (the bell is `"use client"`).

### Task 5: Full feed page + company connector (with kind-scoping) + mounts

- [ ] **Step 1:** Create `apps/candidate/app/notifications/page.tsx` (`"use client"`, inside `CandidateShell` — the full feed with mark-all-read + per-row deep-link):
```tsx
"use client";
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button, Card, EmptyState, ErrorState, LoadingState, NotificationItem, PageHeader } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { CandidateShell } from "../../components/candidate-shell";
import { useAuth } from "../../lib/auth";
import {
  createNotificationsClient, makeMockNotificationsClient, USE_MOCK, notificationKeys,
} from "./notifications-client";
// reuse the same KIND_ICON map (extract it to notifications-client.ts and import in both places)

export default function NotificationsPage() {
  const { api, token } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const client = useMemo(() => (USE_MOCK ? makeMockNotificationsClient() : createNotificationsClient(api)), [api]);
  const q = useQuery({
    queryKey: notificationKeys.feed(false),
    queryFn: () => client.list({ page: 1, pageSize: 50 }),
    enabled: !!token,
  });
  async function markAll() {
    await client.markAllRead();
    await qc.invalidateQueries({ queryKey: notificationKeys.all });
  }
  if (!token) return null;
  return (
    <CandidateShell>
      <PageHeader
        title="Notifications"
        action={<Button variant="ghost" size="sm" disabled={(q.data?.unreadCount ?? 0) === 0} onClick={() => void markAll()}>Mark all read</Button>}
      />
      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />}
      {q.data && q.data.notifications.length === 0 && (
        <EmptyState icon={Bell} title="You're all caught up" description="New notifications will show up here." />
      )}
      {q.data && q.data.notifications.length > 0 && (
        <Card className="divide-y divide-border p-1">
          {q.data.notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              icon={Bell /* KIND_ICON[n.kind] ?? Bell */}
              onClick={() => {
                void client.markRead(n.id).then(() => qc.invalidateQueries({ queryKey: notificationKeys.all }));
                if (n.link) router.push(n.link);
              }}
            />
          ))}
        </Card>
      )}
    </CandidateShell>
  );
}
```
- [ ] **Step 2:** Create the company trio — `apps/company/app/notifications/notifications-client.ts` (copy; the client + keys are identical), `apps/company/components/notification-bell-connected.tsx`, `apps/company/app/notifications/page.tsx` — with **company kind-scoping** (the recruiter must never see candidate-only/practice rows). Two layers of defense:
  1. Render-filter the feed to a `COMPANY_KINDS` allow-set (`new_message` + the funnel transitions a recruiter cares about) before handing `items` to `<NotificationBell>` / the page; drop `comp_id`-less rows defensively. *(Detached practice rows carry `comp_id=None` and are candidate-recipient-scoped, so the backend feed already excludes them for a recruiter identity — this FE filter is belt-and-suspenders for mixed kinds.)*
  2. The company icon map omits `practice_complete`; everything else mirrors the candidate connector (same query keys/poll/invalidation).
- [ ] **Step 3:** Mount `<NotificationBellConnected />` in `apps/company/components/company-shell.tsx`'s `actions` slot before the account menu (same placement as candidate).
- [ ] **Step 4: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` green; then via the preview loop in both apps: the bell shows the unread `Badge` (hidden at 0, "9+" past 9); opening the dropdown loads the feed (skeleton → rows), marks-all-read on open (badge clears); a row deep-links (`new_message` → `/messages/a1`); the `/notifications` page lists all rows with mark-all-read; **no console errors**, dark mode correct, polling pauses on a hidden tab. Screenshot both bells.
- [ ] **Step 5: Full FE gate** — `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck` all green. Confirm `@ip/ui`'s import graph stayed presentation-only (no `@ip/shared` / `@tanstack/react-query`). Flag at handoff that `unread_count` reconciliation relies on the server's fresh `count_documents` (the connector's optimistic `setQueryData` + `invalidateQueries` settle against it).

---

## C. States & acceptance

- **States (bell + feed):** loading → 3 `Skeleton` rows; empty → `EmptyState "You're all caught up"` (`icon={Bell}`); error → compact `ErrorState` + retry; success → the list of `NotificationItem`s. The full-feed page mirrors these inside `CandidateShell`/`CompanyShell`.
- **Unread reconciliation (the freshness contract):** the badge reads the server's **fresh `unread_count`** (a live `count_documents`, never a cached counter). Mark-read/mark-all-read return the fresh post-ack count → the connector `setQueryData(notificationKeys.unread(), fresh)` for an instant badge **and** `invalidateQueries({ queryKey: notificationKeys.all })` so the open feed + badge settle against the server. A poll increment updates the badge within one interval.
- **Deep-links per kind:** each row's `link` is **read verbatim** (stored once at write time on the BE) — the FE never builds it from `kind`. `new_message`→`/messages/{application_id}` (the no-ghosting "you've got an answer"), `interview_pending`→the interview, `assessment_ready`→report, `practice_complete`→`/feedback/{practice_id}`; a kind with no destination renders with no navigation. Clicking marks that row read, then routes.
- **Mark-all-read on open:** `onOpenChange(true)` with `unreadCount > 0` fires `markAllRead` (per the pillar's open-behavior). The full-feed page exposes an explicit "Mark all read" button (disabled at 0).
- **Company kind-scoping:** the company feed render-filters to `COMPANY_KINDS` and drops `comp_id`-less rows — `practice_complete` and candidate-personal kinds never appear for a recruiter (backend already excludes them by identity; the FE filter is belt-and-suspenders).
- **Poll cadence:** badge ~30s, **paused on a hidden tab** (`refetchIntervalInBackground: false`). SSE is the documented upgrade — the badge poll is the only swap point (do not build SSE here).
- **Responsive:** the dropdown is `w-80`/`sm:w-96`, `max-h-[70vh] overflow-y-auto` (Radix handles anchor/collision; near-full-width on mobile). The feed page is a single column.
- **Dark mode:** violet/dark tokens only (`bg-surface`, `text-foreground`, `bg-brand-500` unread dot, `tone="brand"` badge) — automatic.
- **A11y:** the bell trigger's `aria-label` carries the count (`"Notifications, N unread"`); a visually-hidden `aria-live="polite" aria-atomic` span announces increments without moving focus; "Mark all read" is a labelled `Button`; each `NotificationItem` is a `<button>` with `aria-label="{subject} — unread|read"`; Radix `DropdownMenu` gives keyboard open/close + arrow-through + focus-return-to-trigger.
- **Acceptance:** matches the `aptura_notifications_center` mockup; `NotificationBell` is a single shared presentation-only `@ip/ui` component mounted in **both** shells (`@ip/ui` import graph stays free of `@ip/shared`/`@tanstack/react-query`); reads are recipient-scoped; `unread_count` is always fresh; the no-ghosting `new_message` kind deep-links to the conversation; works against the mock today (`NEXT_PUBLIC_MOCK=1`) and against `NotificationService` once `pnpm gen` lands (flip the toggle / collapse `notifications-client.ts` to the `@ip/shared` re-export); both app builds + all four typechecks green.
