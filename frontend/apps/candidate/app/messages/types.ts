// Messaging contract — the FE codes against this until `pnpm gen` exposes `api.messaging.*`.
// Thread is 1:1 with an application; send is unary gRPC, receive is short-poll.

export type SenderSide = "candidate" | "recruiter";

export interface MessageDTO {
  id: string;
  applicationId: string;
  senderRole: SenderSide;
  senderUserId: string;
  body: string;
  createdAt: string;
  readAt: string | null; // normalize proto "" → null
}

export interface ThreadDTO {
  applicationId: string;
  candidateUserId: string;
  recruiterUserId: string;
  jobTitle: string;
  companyName: string;
  lastMessageAt: string;
  lastSnippet: string;
  unread: number; // the caller's-side unread
}

export interface ListThreadsResult {
  threads: ThreadDTO[];
  total: number;
  page: number;
  pageSize: number;
}
export interface ListMessagesResult {
  messages: MessageDTO[];
  total: number;
  page: number;
  pageSize: number;
}
export interface MarkReadResult {
  applicationId: string;
  unread: number;
}

/** The seam both the real (gRPC) and mock clients satisfy. */
export interface MessagesClient {
  send(applicationId: string, body: string): Promise<MessageDTO>;
  listThreads(): Promise<ThreadDTO[]>;
  listMessages(applicationId: string): Promise<MessageDTO[]>;
  markRead(applicationId: string): Promise<MarkReadResult>;
  listQueryKey(): readonly unknown[];
  threadQueryKey(applicationId: string): readonly unknown[];
  subscribe(applicationId: string): {
    queryKey: readonly unknown[];
    queryFn: () => Promise<MessageDTO[]>;
  };
}

// Mirror the server cap (the server stays the authority).
export const MAX_BODY = 4096;
