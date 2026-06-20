"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { AuthLayout } from "../../components/auth-layout";
import { useAuth } from "../../lib/auth";

export default function ResetPage() {
  const { api } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = still reading from the URL; "" = no token present (invalid link).
  const [resetToken, setResetToken] = useState<string | null>(null);

  useEffect(() => {
    setResetToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.resetPassword({ token: resetToken ?? "", newPassword: password });
      router.push("/login");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
        </CardHeader>
        <CardContent>
          {resetToken === "" ? (
            <div className="flex flex-col gap-4">
              <Alert tone="danger" title="Invalid or expired link">
                This password reset link is missing or no longer valid. Request a new one
                to continue.
              </Alert>
              <Link
                href="/forgot"
                className="inline-flex items-center gap-1.5 self-center text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              {error && <Alert tone="danger">{error}</Alert>}
              <Field
                label="New password"
                htmlFor="password"
                hint="At least 8 characters."
              >
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button type="submit" loading={busy} disabled={resetToken === null}>
                {busy ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
