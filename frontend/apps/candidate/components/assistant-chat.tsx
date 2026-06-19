"use client";

import { Card, CardContent, CardHeader, CardTitle, ChatWindow } from "@ip/ui";
import { Bot } from "lucide-react";

import { chat } from "../lib/auth";

export function AssistantChat() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-5 text-brand-500" aria-hidden />
          Ask the assistant
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ChatWindow
            send={chat.send}
            placeholder="Ask about your applications…"
            emptyHint="Ask about the status of an application or a role you're considering."
          />
        </div>
      </CardContent>
    </Card>
  );
}
