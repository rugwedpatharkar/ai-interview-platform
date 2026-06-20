"use client";

// Connector: the presentational MessageThreadView lives in @ip/ui and the data hook in
// @ip/shared. This file resolves the candidate messages client, runs the hook, and feeds the
// view its candidate copy/icon/bubble deltas. The hiring team is the other side.
import { errorMessage, useThreadMessages } from "@ip/shared";
import { MessageThreadView as SharedMessageThreadView, toast } from "@ip/ui";
import { Building2 } from "lucide-react";
import { useMemo } from "react";

import {
  USE_MOCK,
  createMessagesClient,
  makeMockMessagesClient,
} from "../app/messages/messages-client";
import { MAX_BODY, type SenderSide } from "../app/messages/types";
import { useAuth } from "../lib/auth";

export function MessageThreadView({
  applicationId,
  side,
}: {
  applicationId: string;
  side: SenderSide;
}) {
  const { api } = useAuth();
  const client = useMemo(
    () => (USE_MOCK ? makeMockMessagesClient(applicationId, side) : createMessagesClient(api)),
    [api, applicationId, side],
  );
  const thread = useThreadMessages(applicationId, side, client, (e) =>
    toast.error(errorMessage(e)),
  );

  return (
    <SharedMessageThreadView
      side={side}
      messages={thread.messages}
      optimistic={thread.optimistic}
      isLoading={thread.isLoading}
      isError={thread.isError}
      error={thread.error}
      refetch={thread.refetch}
      send={thread.send}
      sending={thread.sending}
      maxBody={MAX_BODY}
      errorMessage={errorMessage(thread.error)}
      otherLabel={side === "candidate" ? "Hiring team" : "Candidate"}
      peerIcon={Building2}
      emptyDescription="Start the conversation below — the hiring team will see your reply."
      peerBubbleClassName="rounded-tl-sm border border-border bg-surface-muted text-foreground"
    />
  );
}
