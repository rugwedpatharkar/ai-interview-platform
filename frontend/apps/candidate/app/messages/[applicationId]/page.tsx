"use client";

// Single-thread surface. Re-skinned over the same primitives the prior page used: the
// candidate-side `MessageThreadView` (which itself composes `@ip/ui`'s presentational
// view + the shared `useThreadMessages` hook). Doing it this way preserves, byte-for-byte,
//   - the 5s→15s→30s back-off receive poll (paused on hidden tab),
//   - the in-flight ref-latch + optimistic send,
//   - the MAX_BODY=4096 client cap (mirroring the server),
//   - mark-read-on-open + on new inbound,
//   - cache-invalidation of the inbox/nav badge on send.
// The page only contributes presentation: an .ap-cell anchor card, a header with the
// role + company sourced from the cached thread list, and a back-link to the inbox.

import { Badge, EmptyState, Skeleton, buttonVariants } from "@ip/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, Building2, Mail } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useParams } from "next/navigation";

import { CandidateShell } from "../../../components/candidate-shell";
import { MessageThreadView } from "../../../components/message-thread-view";
import { useAuth } from "../../../lib/auth";
import {
  USE_MOCK,
  createMessagesClient,
  listQueryKey,
  makeMockMessagesClient,
} from "../messages-client";

export default function ThreadPage() {
  const { api, token } = useAuth();
  const { applicationId } = useParams<{ applicationId: string }>();

  // Read the thread metadata (role/company) from the SAME cache the inbox uses. The 30s
  // background poll there keeps this header in sync without an extra round-trip per page
  // load. Falling back to a placeholder header (no jobTitle) is fine — the body still
  // works because `MessageThreadView` resolves its own client and history.
  const client = useMemo(
    () =>
      USE_MOCK
        ? makeMockMessagesClient(applicationId, "candidate")
        : createMessagesClient(api),
    [api, applicationId],
  );
  const threads = useQuery({
    queryKey: listQueryKey(),
    queryFn: () => client.listThreads(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    enabled: Boolean(token),
  });
  const meta = threads.data?.find((t) => t.applicationId === applicationId) ?? null;

  if (!token) return null;

  return (
    <CandidateShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/messages"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft className="size-4" aria-hidden /> All messages
        </Link>
        {meta && (
          <Link
            href={`/applications/${applicationId}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Briefcase className="size-4" aria-hidden /> View application
          </Link>
        )}
      </div>

      <article className="ap-cell ap-cell--anchor flex flex-col gap-4 p-0">
        {/* Header — role + company. Skeleton while the inbox cache populates; an
            EmptyState if the thread isn't in the list (mock or new install). */}
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--teal-soft)] text-[var(--teal-strong)]"
            aria-hidden
          >
            {meta ? (
              <span className="text-base font-semibold">
                {meta.companyName.charAt(0).toUpperCase()}
              </span>
            ) : (
              <Building2 className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            {threads.isLoading && !meta ? (
              <>
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-24" />
              </>
            ) : (
              <>
                <h1 className="truncate font-display text-lg font-semibold tracking-tight text-foreground">
                  {meta?.jobTitle ?? "Conversation"}
                </h1>
                <p className="truncate text-sm text-muted-foreground">
                  {meta?.companyName ?? "Hiring team"}
                </p>
              </>
            )}
          </div>
          {meta && meta.unread > 0 && (
            <Badge tone="info">{meta.unread > 9 ? "9+" : meta.unread} new</Badge>
          )}
        </header>

        {/* Body — the shared candidate connector renders the view, which wires:
              receive poll, optimistic send, MAX_BODY client cap, mark-read,
              composer + Send button, error/empty/skeleton states. */}
        <div className="px-5 py-4">
          {!threads.isLoading && threads.data && !meta ? (
            <EmptyState
              icon={Mail}
              title="Thread not found"
              description="This conversation isn't in your inbox yet. Try opening it from your application page."
            />
          ) : (
            <MessageThreadView applicationId={applicationId} side="candidate" />
          )}
        </div>
      </article>
    </CandidateShell>
  );
}
