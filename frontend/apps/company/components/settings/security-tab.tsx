"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation } from "@tanstack/react-query";
import { Shield, Smartphone } from "lucide-react";
import { useState } from "react";

import type { SettingsClient } from "../../app/settings/types";
import { SessionList } from "./session-list";
import { TotpSetupDialog } from "./totp-setup-dialog";

/** Disable-2FA dialog: collects a TOTP or recovery code (ConfirmDialog can't host an input,
 *  so this is a small bespoke Dialog) and only closes on success. */
function DisableTotpDialog({
  client,
  onDisabled,
}: {
  client: SettingsClient;
  onDisabled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const disable = useMutation({
    mutationFn: () => client.disableTotp(code),
    onSuccess: () => {
      toast.success("Two-factor authentication disabled");
      onDisabled();
      setOpen(false);
      setCode("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setCode("");
          disable.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="self-start">
          Disable 2FA
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Disable two-factor authentication</DialogTitle>
        <DialogDescription>
          Enter a code from your authenticator app, or a recovery code, to confirm.
        </DialogDescription>
        <Alert tone="warning" className="mt-4">
          Your account will be less protected without a second factor.
        </Alert>
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (code) disable.mutate();
          }}
        >
          <Field label="Authentication or recovery code" htmlFor="disable-code">
            <Input
              id="disable-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={disable.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="destructive"
              loading={disable.isPending}
              disabled={!code}
            >
              Disable 2FA
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Security tab: the 2FA setup/disable card + the active-session list.
 *  The 2FA on/off state has no "me" read pre-gen — it's seeded off and flipped locally by
 *  setup/disable. At integration, read `totp_enabled` from a me/profile field. */
export function SecurityTab({ client }: { client: SettingsClient }) {
  const [enabled, setEnabled] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5 text-muted-foreground" aria-hidden />
            Two-factor authentication
          </CardTitle>
          <CardDescription>
            Require a one-time code from an authenticator app when signing in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted p-3">
            <span className="text-sm text-foreground">Authenticator app (TOTP)</span>
            {enabled ? (
              <Badge tone="success" variant="subtle">
                Enabled
              </Badge>
            ) : (
              <Badge tone="neutral" variant="subtle">
                Not enabled
              </Badge>
            )}
          </div>
          {enabled ? (
            <DisableTotpDialog client={client} onDisabled={() => setEnabled(false)} />
          ) : (
            <TotpSetupDialog client={client} onEnabled={() => setEnabled(true)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="size-5 text-muted-foreground" aria-hidden />
            Active sessions
          </CardTitle>
          <CardDescription>
            Devices currently signed in to your account. Revoke any you don't recognize.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionList client={client} />
        </CardContent>
      </Card>
    </div>
  );
}
