"use client";

import { errorMessage, useRequireAuth } from "@ip/shared";
import { Card, EmptyState, ErrorState, LoadingState, PageHeader, cn } from "@ip/ui";
import { useQuery } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { CandidateShell } from "../../components/candidate-shell";
import { MessageThreadView } from "../../components/message-thread-view";
import { useAuth } from "../../lib/auth";
import {
  USE_MOCK,
  createMessagesClient,
  listQueryKey,
  makeMockMessagesClient,
} from "./messages-client";

export default function MessagesPage() {
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready);
  const client = useMemo(
    () => (USE_MOCK ? makeMockMessagesClient("a1", "candidate") : createMessagesClient(api)),
    [api],
  );
  const q = useQuery({
    queryKey: listQueryKey(),
    queryFn: () => client.listThreads(),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    enabled: Boolean(token),
  });
  // Preview-pane selection (desktop only) — presentation state, no data effect.
  const [openId, setOpenId] = useState<string | null>(null);
  if (!token) return null; // hydration guard

  const openThread = q.data?.find((t) => t.applicationId === openId) ?? null;

  return (
    <CandidateShell>
      <PageHeader
        title="Messages"
        description="Conversations about your applications"
      />
      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && (
        <EmptyState
          icon={Mail}
          title="No messages"
          description="When a recruiter messages you about an application, it'll show up here."
        />
      )}
      {q.data && q.data.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          {/* Conversation-list rail */}
          <nav
            aria-label="Conversations"
            className="flex flex-col gap-2 lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto lg:pr-1"
          >
            {/* server sorts desc by last_message_at — do not re-sort */}
            {q.data.map((t) => {
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
                  onClick={(e) => {
                    // On desktop, open the preview pane in place; let the route handle mobile.
                    if (window.matchMedia("(min-width: 1024px)").matches) {
                      e.preventDefault();
                      setOpenId(t.applicationId);
                    }
                  }}
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-muted",
                    active &&
                      "bg-surface-muted shadow-[inset_3px_0_0_var(--primary)]",
                  )}
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span
                      className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-foreground"
                      aria-hidden
                    >
                      {t.companyName.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-display text-base font-medium text-foreground">
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
                    <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                      {t.unread > 9 ? "9+" : t.unread}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Preview pane — desktop only; collapses ≤1000px (rail routes instead) */}
          <div className="hidden lg:block">
            {openThread ? (
              <Card className="p-4">
                <div className="mb-3 border-b border-border pb-3">
                  <h3 className="truncate font-display text-base font-medium text-foreground">
                    {openThread.jobTitle}
                  </h3>
                  <p className="truncate text-sm text-muted-foreground">
                    {openThread.companyName}
                  </p>
                </div>
                <MessageThreadView
                  key={openThread.applicationId}
                  applicationId={openThread.applicationId}
                  side="candidate"
                />
              </Card>
            ) : (
              <EmptyState
                icon={Mail}
                title="Select a conversation"
                description="Choose a thread from the list to read and reply."
              />
            )}
          </div>
        </div>
      )}
    </CandidateShell>
  );
}
