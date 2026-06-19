"use client";

import { Alert, Card, CardContent, CardHeader, CardTitle, ChatWindow, ErrorBoundary } from "@ip/ui";

import { chat } from "../lib/auth";

export function AssistantChat() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recruiting assistant</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ErrorBoundary
            fallback={
              <Alert tone="danger">
                The assistant is unavailable right now. Refresh to try again.
              </Alert>
            }
          >
            <ChatWindow
              send={chat.send}
              placeholder="Ask about a job, a candidate, or your pipeline…"
              emptyHint="Grounded answers about your jobs and applicants — scoped to your company."
            />
          </ErrorBoundary>
        </div>
      </CardContent>
    </Card>
  );
}
