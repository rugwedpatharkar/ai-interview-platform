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
import { errorMessage } from "@ip/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { useAuth } from "../../lib/auth";

export default function RegisterPage() {
  const { api, login } = useAuth();
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.auth.registerCompany({ companyName, email, password });
      await login(email, password);
      toast.success("Company created — check your email to verify.");
      router.push("/jobs");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create your company</CardTitle>
          <CardDescription>Set up your recruiter account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label="Company name" htmlFor="companyName">
              <Input
                id="companyName"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </Field>
            <Field label="Work email" htmlFor="email">
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field
              label="Password"
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
            <Button type="submit" loading={busy}>
              Create company
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/login"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                Already have an account? Log in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
