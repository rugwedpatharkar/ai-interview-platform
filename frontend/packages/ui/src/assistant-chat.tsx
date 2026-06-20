"use client";

import { Alert } from "./alert.js";
import { Card, CardContent, CardHeader, CardTitle } from "./card.js";
import { ChatWindow, type ChatWindowProps } from "./chat-window.js";
import { ErrorBoundary } from "./error-boundary.js";
import type { ReactNode } from "react";

export interface AssistantChatProps {
  /** Streams one assistant turn — each app wires this to `streamAssistantChat(api, ...)`. */
  send: ChatWindowProps["send"];
  /** Card title (candidate prepends a Bot icon; company is plain text). */
  title: ReactNode;
  /** Title element class — candidate uses `flex items-center gap-2` for its icon row. */
  titleClassName?: string;
  placeholder: string;
  emptyHint: string;
}

export function AssistantChat({
  send,
  title,
  titleClassName,
  placeholder,
  emptyHint,
}: AssistantChatProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className={titleClassName}>{title}</CardTitle>
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
            <ChatWindow send={send} placeholder={placeholder} emptyHint={emptyHint} />
          </ErrorBoundary>
        </div>
      </CardContent>
    </Card>
  );
}
