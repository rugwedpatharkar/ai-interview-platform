"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  toast,
} from "@ip/ui";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { useAuth } from "../../lib/auth";

export default function ForgotPage() {
  const { api } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.auth.forgotPassword({ email });
      setSent(true);
    } catch {
      // Keep it neutral — never reveal whether the account exists.
      toast.error("Couldn't send right now — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>We'll email you a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <Alert tone="success" title="Check your inbox">
              If an account exists for <strong>{email}</strong>, a reset link is on
              its way.
            </Alert>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <Field label="Email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button type="submit" loading={busy}>
                Send reset link
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <Link
                  href="/login"
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  Back to login
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
