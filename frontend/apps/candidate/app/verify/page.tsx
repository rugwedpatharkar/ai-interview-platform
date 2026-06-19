"use client";

import { Alert, Card, CardContent, CardHeader, CardTitle, Spinner } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "../../lib/auth";

export default function VerifyPage() {
  const { api } = useAuth();
  // "invalid" is reserved for a missing token (bad link) — distinct from a server error,
  // so we can steer the candidate to request a fresh link rather than to "Continue".
  const [status, setStatus] = useState<"working" | "ok" | "error" | "invalid">(
    "working",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setStatus("invalid");
      return;
    }
    api.auth
      .verify({ token })
      .then(() => setStatus("ok"))
      .catch((err) => {
        setStatus("error");
        setMessage(errorMessage(err));
      });
  }, [api]);

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
          {status === "invalid" ? (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Go to login
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Continue
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
