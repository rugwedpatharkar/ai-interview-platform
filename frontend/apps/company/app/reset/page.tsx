"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { useAuth } from "../../lib/auth";

export default function ResetPage() {
  const { api } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    try {
      await api.auth.resetPassword({ token, newPassword: password });
      toast.success("Password updated — please log in.");
      router.push("/login");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="New password" htmlFor="password">
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
            <Button type="submit" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
