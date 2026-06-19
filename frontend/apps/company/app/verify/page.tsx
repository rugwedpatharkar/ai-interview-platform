"use client";

import { Alert, Card, CardContent, CardHeader, CardTitle, Spinner } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "../../lib/auth";

export default function VerifyPage() {
  const { api } = useAuth();
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setStatus("error");
      setMessage("Missing verification token.");
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
          <Link href="/jobs" className="text-sm underline">
            Continue
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
