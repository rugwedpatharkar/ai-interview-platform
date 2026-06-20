"use client";

import { errorMessage, useRequireAuth } from "@ip/shared";
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from "@ip/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";

import { CandidateShell } from "../../components/candidate-shell";
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
  if (!token) return null; // hydration guard

  return (
    <CandidateShell>
      <PageHeader title="Messages" />
      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />}
      {q.data && q.data.length === 0 && (
        <EmptyState
          title="No messages"
          description="When a recruiter messages you about an application, it'll show up here."
        />
      )}
      {q.data && q.data.length > 0 && (
        <div className="flex flex-col gap-3">
          {q.data.map((t) => (
            // server sorts desc by last_message_at — do not re-sort
            <Link key={t.applicationId} href={`/messages/${t.applicationId}`}>
              <Card className="flex items-start justify-between gap-3 p-4 transition-colors hover:border-border-strong">
                <div className="min-w-0">
                  <h3 className="truncate font-display text-base font-medium text-foreground">
                    {t.jobTitle}
                  </h3>
                  <p className="truncate text-sm text-muted-foreground">{t.companyName}</p>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{t.lastSnippet}</p>
                </div>
                {t.unread > 0 && <Badge tone="info">{t.unread > 9 ? "9+" : t.unread}</Badge>}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </CandidateShell>
  );
}
