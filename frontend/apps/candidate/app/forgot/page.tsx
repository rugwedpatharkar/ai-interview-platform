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
} from "@ip/ui";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { AuthLayout } from "../../components/auth-layout";
import { useAuth } from "../../lib/auth";

export default function ForgotPage() {
  const { api } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.forgotPassword({ email });
      setSent(true);
    } catch {
      // Keep it neutral — never reveal whether the account exists.
      setError("Couldn't send right now — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>We'll email you a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col gap-4">
              <Alert tone="success">
                If an account exists for <strong>{email}</strong>, a reset link is on
                its way. Check your inbox.
              </Alert>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 self-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              {error && <Alert tone="danger">{error}</Alert>}
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
                {busy ? "Sending…" : "Send reset link"}
              </Button>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 self-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Back to login
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
