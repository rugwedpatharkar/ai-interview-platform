"use client";

import {
  Badge,
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
import { useMutation } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../../lib/auth";
import { passwordChangeError } from "../../app/settings/settings-client";
import { ChangeEmailDialog } from "./change-email-dialog";
import type { SettingsClient } from "../../app/settings/types";

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company admin",
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
};

/** Company Account tab: read-only identity (role + account ID — org management lives in the
 *  team module, not here) plus the change-email and change-password actions. No /profile
 *  link. The session JWT carries only id/role/compId — no email — so email is collected on
 *  change, not displayed. */
export function AccountTab({ client }: { client: SettingsClient }) {
  const { identity } = useAuth();
  const roleLabel = identity ? ROLE_LABELS[identity.role] ?? identity.role : "—";
  const handle = identity?.id ?? "—";

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

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
          <CardTitle>Identity</CardTitle>
          <CardDescription>
            Your role and account ID. Team and organization changes are managed under Team.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="flex items-center gap-2 text-sm text-foreground">
              <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
              Role
            </span>
            <Badge tone="info" variant="subtle">
              {roleLabel}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <span className="text-sm text-foreground">Account ID</span>
            <span className="truncate font-mono text-xs text-muted-foreground">{handle}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            Changing your sign-in email sends a verification link to the new address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeEmailDialog client={client} />
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
    </div>
  );
}
