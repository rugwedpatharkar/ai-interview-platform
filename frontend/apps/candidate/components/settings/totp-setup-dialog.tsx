"use client";

import {
  Alert,
  Button,
  Dialog,
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
import { Copy, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { SettingsClient, SetupTotpResult } from "../../app/settings/types";

async function copy(text: string, label: string) {
  await navigator.clipboard?.writeText(text);
  toast.success(label);
}

/** Three-state 2FA enrollment dialog: (1) fetch secret → show the manual key (QR-lib-free
 *  fallback) + a Copy affordance, (2) enter the 6-digit code → verify, (3) reveal the
 *  recovery codes ONCE with a copy-all + a "save now" warning. The FE never holds the secret
 *  beyond this dialog and recovery codes are not re-fetchable. */
export function TotpSetupDialog({
  client,
  onEnabled,
}: {
  client: SettingsClient;
  onEnabled: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<SetupTotpResult | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);

  const begin = useMutation({
    mutationFn: () => client.setupTotp(),
    onSuccess: (r) => setSetup(r),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const verify = useMutation({
    mutationFn: () => client.verifyTotp(code),
    onSuccess: (r) => {
      setRecovery(r.recoveryCodes);
      onEnabled();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next && !setup && !begin.isPending) begin.mutate();
    if (!next) {
      setSetup(null);
      setRecovery(null);
      setCode("");
      begin.reset();
      verify.reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Set up 2FA</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Set up two-factor authentication</DialogTitle>
        <DialogDescription>
          Add the key to your authenticator app, then enter the 6-digit code it shows.
        </DialogDescription>

        {recovery ? (
          <div className="mt-4 flex flex-col gap-3">
            <Alert tone="warning" title="Save your recovery codes">
              Store these somewhere safe — they won't be shown again. Each lets you sign in
              once if you lose your authenticator.
            </Alert>
            <code className="grid grid-cols-2 gap-1 rounded-md border border-border bg-surface-muted p-3 font-mono text-sm text-foreground">
              {recovery.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </code>
            <Button onClick={() => void copy(recovery.join("\n"), "Recovery codes copied")}>
              <Copy aria-hidden />
              Copy all
            </Button>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : setup ? (
          <div className="mt-4 flex flex-col gap-4">
            <Field label="Setup key" htmlFor="totp-secret" hint="Enter this key in your authenticator app.">
              <div className="flex items-center gap-2">
                <Input id="totp-secret" readOnly value={setup.secret} className="font-mono" />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Copy setup key"
                  onClick={() => void copy(setup.secret, "Setup key copied")}
                >
                  <Copy aria-hidden />
                </Button>
              </div>
            </Field>
            <Field label="6-digit code" htmlFor="totp-code">
              <Input
                id="totp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
            </Field>
            <Button
              loading={verify.isPending}
              disabled={code.length !== 6}
              onClick={() => verify.mutate()}
            >
              <ShieldCheck aria-hidden />
              Verify & enable
            </Button>
          </div>
        ) : (
          <Alert tone="info" className="mt-4">
            Preparing setup…
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
