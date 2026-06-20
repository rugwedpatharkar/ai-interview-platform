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
import { errorMessage } from "@ip/shared";
import { AuthLayout } from "./auth-layout";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useState } from "react";

interface Props {
  title: string;
  description: string;
  submitLabel: string;
  action: (email: string, password: string) => Promise<void>;
  altHref: string;
  altLabel: string;
  forgotHref?: string;
  /** Help text under the password field, e.g. the register min-length rule. */
  passwordHint?: string;
  footer?: ReactNode;
}

export function CredentialsForm({
  title,
  description,
  submitLabel,
  action,
  altHref,
  altLabel,
  forgotHref,
  passwordHint,
  footer,
}: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action(email, password);
      router.push("/jobs");
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
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                aria-invalid={Boolean(error) || undefined}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Password" htmlFor="password" hint={passwordHint}>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="current-password"
                aria-invalid={Boolean(error) || undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {forgotHref && (
              <Link
                href={forgotHref}
                className="-mt-2 self-end text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Forgot password?
              </Link>
            )}
            <Button type="submit" loading={busy}>
              {submitLabel}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link href={altHref} className="underline-offset-4 hover:text-foreground hover:underline">
                {altLabel}
              </Link>
            </p>
          </form>
          {footer}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
