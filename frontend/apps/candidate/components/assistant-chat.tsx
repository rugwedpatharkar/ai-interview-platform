"use client";

// Connector: the parameterized AssistantChat lives in @ip/ui; this binds it to the app's
// auth client + candidate copy. Loaded via `dynamic(... .then(m => m.AssistantChat))`.
import { AssistantChat as SharedAssistantChat } from "@ip/ui";
import { streamAssistantChat } from "@ip/shared";
import { Bot } from "lucide-react";

import { useAuth } from "../lib/auth";

export function AssistantChat() {
  const { api } = useAuth();
  return (
    <SharedAssistantChat
      send={(messages, handlers, signal) => streamAssistantChat(api, messages, handlers, signal)}
      titleClassName="flex items-center gap-2"
      title={
        <>
          <Bot className="size-5 text-primary" aria-hidden />
          Ask the assistant
        </>
      }
      placeholder="Ask about your applications…"
      emptyHint="Ask about the status of an application or a role you're considering."
    />
  );
}
