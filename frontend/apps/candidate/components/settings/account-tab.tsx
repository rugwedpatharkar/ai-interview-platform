"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Field,
  Input,
  toast,
} from "@ip/ui";
import { decodeJwtPayload, errorMessage } from "@ip/shared";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useAuth } from "../../lib/auth";
import { passwordChangeError } from "../../app/settings/settings-client";
import type { SettingsClient } from "../../app/settings/types";

/** Account tab: shows the signed-in email (from the JWT) + verified badge, and hosts the
 *  change-email and change-password actions. The candidate profile editor lives at /profile. */
export function AccountTab({ client }: { client: SettingsClient }) {
  const { token } = useAuth();
  const email = token ? (decodeJwtPayload(token)?.email as string | undefined) ?? null : null;

  const [newEmail, setNewEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const changeEmail = useMutation({
    mutationFn: () => client.requestEmailChange(newEmail),
    onSuccess: () => {
      toast.success("Check your new inbox to confirm the change.");
      setNewEmail("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const pwError = passwordChangeError(current, next, confirm);
  const changePassword = useMutation({
    mutationFn: () => client.changePassword(current, next),
    onSuccess: () => {
      toast.success("Password changed — other devices signed out.");
      setCurrent("");
      setNext("");
      setConfirm("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            Your sign-in email. Changing it sends a verification link to the new address.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
              <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{email ?? "your account email"}</span>
            </span>
            <Badge tone="success" variant="subtle">
              Verified
            </Badge>
          </div>
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="self-start">
                Change email
              </Button>
            }
            title="Change your email"
            description="We'll email a confirmation link to the new address. Your current email stays active until you confirm."
            confirmLabel="Send confirmation"
            busy={changeEmail.isPending}
            onConfirm={() => changeEmail.mutateAsync()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Choose a strong password. Changing it signs out your other devices.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex max-w-sm flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!pwError) changePassword.mutate();
            }}
          >
            <Field label="Current password" htmlFor="cur-pw">
              <Input
                id="cur-pw"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field label="New password" htmlFor="new-pw">
              <Input
                id="new-pw"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>
            <Field
              label="Confirm new password"
              htmlFor="confirm-pw"
              error={confirm && pwError ? pwError : null}
            >
              <Input
                id="confirm-pw"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <Button
              type="submit"
              className="self-start"
              loading={changePassword.isPending}
              disabled={!current || !next || !confirm || Boolean(pwError)}
            >
              <KeyRound aria-hidden />
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Looking for your profile details?{" "}
        <Link
          href="/profile"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Edit your profile
        </Link>
        .
      </p>
    </div>
  );
}
