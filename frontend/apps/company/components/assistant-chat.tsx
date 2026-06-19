"use client";

import { Card, CardContent, CardHeader, CardTitle, ChatWindow } from "@ip/ui";

import { chat } from "../lib/auth";

export function AssistantChat() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recruiting assistant</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ChatWindow
            send={chat.send}
            placeholder="Ask about a job, a candidate, or your pipeline…"
            emptyHint="Grounded answers about your jobs and applicants — scoped to your company."
          />
        </div>
      </CardContent>
    </Card>
  );
}
