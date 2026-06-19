"use client";

import { useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Alert } from "./alert.js";
import { Button } from "./button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./card.js";
import { Input } from "./input.js";
import { Spinner } from "./spinner.js";

export type VerifyStatus = "working" | "ok" | "error" | "invalid";

export interface VerifyCardProps {
  status: VerifyStatus;
  /** Server error message (shown for "error" status) */
  message?: string;
  /** Where "Continue" links to (e.g. "/" or "/jobs") */
  continueHref: string;
  /** Called with an email to resend verification. If omitted, the resend form is hidden. */
  onResend?: (email: string) => Promise<void>;
  children?: ReactNode;
}

/**
 * Shared verify-page card used by both candidate and company apps.
 * Handles the working/ok/error/invalid states and optionally shows a
 * resend-verification email sub-form in the invalid/error state.
 */
export function VerifyCard({
  status,
  message,
  continueHref,
  onResend,
}: VerifyCardProps) {
  const [email, setEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "pending" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState("");

  async function handleResend() {
    if (!email.trim() || !onResend) return;
    setResendState("pending");
    setResendError("");
    try {
      await onResend(email.trim());
      setResendState("sent");
    } catch {
      setResendState("error");
      setResendError("Could not send — please try again shortly.");
    }
  }

  const showResend = onResend && (status === "invalid" || status === "error");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Email verification</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {status === "working" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Verifying your email…
            </p>
          )}
          {status === "ok" && (
            <Alert tone="success">Your email is verified — you're all set.</Alert>
          )}
          {status === "error" && <Alert tone="danger">{message}</Alert>}
          {status === "invalid" && (
            <Alert tone="danger" title="Invalid or expired link">
              This verification link is missing or no longer valid. Log in to request a
              new verification email.
            </Alert>
          )}

          {showResend && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium text-foreground">Resend verification email</p>
              {resendState === "sent" ? (
                <Alert tone="success">
                  If that address needs verification, we've sent a new link.
                </Alert>
              ) : (
                <>
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={resendState === "pending"}
                    aria-label="Email address for resend"
                  />
                  {resendState === "error" && (
                    <Alert tone="danger">{resendError}</Alert>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResend}
                    disabled={resendState === "pending" || !email.trim()}
                    loading={resendState === "pending"}
                    className="self-start"
                  >
                    {resendState === "pending" ? "Sending…" : "Send verification email"}
                  </Button>
                </>
              )}
            </div>
          )}

          {status === "invalid" ? (
            <a
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Go to login
              <ArrowRight className="size-4" aria-hidden />
            </a>
          ) : (
            <a
              href={continueHref}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Continue
              <ArrowRight className="size-4" aria-hidden />
            </a>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
