"use client";

// Two-pane inbox. v3 re-skin around the same data primitives the prior page used: the
// `["messages","threads"]` query keyed via `listQueryKey()`, a 30s background poll,
// `markRead` on open, and the shared `MessageThreadView` for the right pane. The new
// pieces are all presentational: a 1/3-2/3 split at lg+, an animated thread list, the
// `?app=<id>` URL contract so deep-links open straight into a thread, and a stacked
// fallback at <lg that routes to /messages/[id] instead of trying to fit a thread on
// a phone.

import {
  Badge,
  EmptyState,
  ErrorState,
  Skeleton,
  cn,
} from "@ip/ui";
import { errorMessage, recordError, useRequireAuth } from "@ip/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageSquare, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { MessageThreadView } from "../../components/message-thread-view";
import { useAuth } from "../../lib/auth";
import {
  USE_MOCK,
  createMessagesClient,
  listQueryKey,
  makeMockMessagesClient,
} from "./messages-client";

// Render-bound on the rail — same cap as the old page so a candidate with many threads
// never mounts every row at once.
const THREADS_PAGE = 30;

import { Suspense } from "react";

export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesPageInner />
    </Suspense>
  );
}

function MessagesPageInner() {
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready);
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const queryParam = params.get("app");

  // The messaging client is per-request (mock vs real) and stable across the page.
  const client = useMemo(
    () =>
      USE_MOCK ? makeMockMessagesClient("a1", "candidate") : createMessagesClient(api),
    [api],
  );

  // SAME query key + 30s poll the prior inbox used; the shell's nav badge reads the same
  // cache, so opening this page does NOT cause a duplicate fetch.
  const q = useQuery({
    queryKey: listQueryKey(),
    queryFn: () => client.listThreads(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    enabled: Boolean(token),
  });

  const [shown, setShown] = useState(THREADS_PAGE);
  const [filter, setFilter] = useState("");

  // Mirror `?app=<id>` to local state on first render and on URL changes (browser back
  // button keeps the right pane in sync). On desktop the right pane fills with that
  // thread; on mobile a click navigates to /messages/[id] instead.
  const openId = queryParam;

  // markRead the moment a thread opens — the prior page relied on the thread route to do
  // this; we preserve the contract by invalidating the inbox cache after the underlying
  // `markRead` so the rail's unread badge clears for the just-opened thread.
  useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    (async () => {
      try {
        await client.markRead(openId);
        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: listQueryKey() });
        }
      } catch (err) {
        // Reading is non-blocking and best-effort; the poll will re-converge.
        // Still log so a systematic markRead outage shows up in observability
        // instead of quietly rotting.
        if (err instanceof Error) recordError(err, { component: "messages:markRead" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openId, client, queryClient]);

  if (!token) return null;

  const threads = q.data ?? [];
  const filtered = filter.trim()
    ? threads.filter(
        (t) =>
          t.jobTitle.toLowerCase().includes(filter.toLowerCase()) ||
          t.companyName.toLowerCase().includes(filter.toLowerCase()),
      )
    : threads;
  const openThread = threads.find((t) => t.applicationId === openId) ?? null;

  function onOpen(applicationId: string) {
    // Desktop — patch the URL so deep-links work and back-button is real. Mobile — full
    // navigation to the dedicated thread route (the rail collapses out of view).
    if (window.matchMedia("(min-width: 1024px)").matches) {
      router.replace(`/messages?app=${applicationId}`, { scroll: false });
    } else {
      router.push(`/messages/${applicationId}`);
    }
  }

  return (
    <CandidateShell>
      <div className="flex flex-col gap-4">
        {/* Page header — title + filter input. We keep the header light so the two-pane
            layout below dominates the viewport. */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
              Messages
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Conversations about your applications. The hiring team always replies here.
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4" aria-hidden />
            <input
              type="search"
              aria-label="Filter conversations"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by role or company"
              className="w-48 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
        </header>

        {/* Loading */}
        {q.isLoading && (
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <div
              className="flex flex-col gap-2"
              aria-busy="true"
              aria-label="Loading conversations"
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4"
                >
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                </div>
              ))}
            </div>
            <Skeleton className="hidden h-[28rem] rounded-2xl lg:block" />
          </div>
        )}

        {/* Error */}
        {q.isError && (
          <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
        )}

        {/* Empty */}
        {q.data && threads.length === 0 && (
          <EmptyState
            icon={Mail}
            title="No messages yet"
            description="When a recruiter messages you about an application, it'll show up here."
          />
        )}

        {/* Loaded */}
        {q.data && threads.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            {/* LEFT — thread list (1/3 at lg+) */}
            <nav
              aria-label="Conversations"
              className="flex flex-col gap-2 lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto lg:pr-1"
            >
              {filtered.length === 0 && (
                <p className="rounded-lg border border-dashed border-border bg-surface p-4 text-sm text-muted-foreground">
                  No threads match &ldquo;{filter}&rdquo;.
                </p>
              )}
              {/* Server already sorts desc by last_message_at — don't re-sort. */}
              {filtered.slice(0, shown).map((t, i) => {
                const active = t.applicationId === openId;
                return (
                  <Link
                    key={t.applicationId}
                    href={`/messages/${t.applicationId}`}
                    aria-current={active ? "true" : undefined}
                    aria-label={
                      t.unread > 0
                        ? `${t.jobTitle}, ${t.unread} unread`
                        : t.jobTitle
                    }
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                    onClick={(e) => {
                      // Desktop: stay on this page and swap the preview pane. Mobile: let
                      // the Link navigate naturally to /messages/[id].
                      if (window.matchMedia("(min-width: 1024px)").matches) {
                        e.preventDefault();
                        onOpen(t.applicationId);
                      }
                    }}
                    className={cn(
                      "flex animate-rise-in items-start justify-between gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-muted",
                      active &&
                        "bg-surface-muted shadow-[inset_3px_0_0_var(--brand)]",
                    )}
                  >
                    <span className="flex min-w-0 items-start gap-3">
                      {/* Company-logo initial — same primitive the old page used; matches
                          the inbox skeleton + the message-thread peer avatar. */}
                      <span
                        className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-base font-semibold text-[var(--brand-strong)]"
                        aria-hidden
                      >
                        {t.companyName.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-base font-medium text-foreground">
                          {t.jobTitle}
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {t.companyName}
                        </span>
                        <span className="mt-1 line-clamp-1 block text-sm text-muted-foreground">
                          {t.lastSnippet}
                        </span>
                      </span>
                    </span>
                    {t.unread > 0 && (
                      <Badge tone="info" className="shrink-0">
                        {t.unread > 9 ? "9+" : t.unread} new
                      </Badge>
                    )}
                  </Link>
                );
              })}
              {filtered.length > shown && (
                <button
                  type="button"
                  onClick={() => setShown((n) => n + THREADS_PAGE)}
                  className="self-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-muted"
                >
                  Show more ({filtered.length - shown})
                </button>
              )}
            </nav>

            {/* RIGHT — preview pane (2/3 at lg+; hidden below lg, rail routes instead). */}
            <div className="hidden lg:block">
              {openThread ? (
                <div className="ap-cell flex h-[calc(100dvh-14rem)] flex-col p-0">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-display text-base font-semibold text-foreground">
                        {openThread.jobTitle}
                      </h2>
                      <p className="truncate text-sm text-muted-foreground">
                        {openThread.companyName}
                      </p>
                    </div>
                    <Link
                      href={`/messages/${openThread.applicationId}`}
                      className="text-sm text-primary underline-offset-2 hover:underline"
                    >
                      Open full view
                    </Link>
                  </div>
                  <div className="min-h-0 flex-1 p-4">
                    {/* key=applicationId resets the thread view's local state (scroll
                        position, draft text, sending latch) when switching threads. */}
                    <MessageThreadView
                      key={openThread.applicationId}
                      applicationId={openThread.applicationId}
                      side="candidate"
                    />
                  </div>
                </div>
              ) : (
                <div className="ap-cell flex h-[calc(100dvh-14rem)] flex-col items-center justify-center text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)]">
                    <MessageSquare className="size-6" aria-hidden />
                  </span>
                  <h2 className="mt-3 font-display text-lg font-semibold text-foreground">
                    Select a conversation
                  </h2>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Pick a thread from the list to read and reply. Replies are visible to
                    the hiring team in real time.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </CandidateShell>
  );
}
