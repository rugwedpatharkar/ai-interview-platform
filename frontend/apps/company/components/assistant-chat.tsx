"use client";

// Connector: the parameterized AssistantChat lives in @ip/ui; this binds it to the app's
// auth client + company copy. Loaded via `dynamic(... .then(m => m.AssistantChat))`.
import { AssistantChat as SharedAssistantChat } from "@ip/ui";
import { streamAssistantChat } from "@ip/shared";

import { useAuth } from "../lib/auth";

export function AssistantChat() {
  const { api } = useAuth();
  return (
    <SharedAssistantChat
      send={(messages, handlers, signal) => streamAssistantChat(api, messages, handlers, signal)}
      title="Recruiting assistant"
      placeholder="Ask about a job, a candidate, or your pipeline…"
      emptyHint="Grounded answers about your jobs and applicants — scoped to your company."
    />
  );
}
