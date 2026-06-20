"use client";

import {
  Button,
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
import { useState } from "react";

import type { SettingsClient } from "../../app/settings/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Change-email dialog: collects + validates the new address (ConfirmDialog can't host an
 *  input), requests the change, and closes on success. The current email stays active until
 *  the user confirms via the emailed link. */
export function ChangeEmailDialog({ client }: { client: SettingsClient }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const valid = EMAIL_RE.test(email);
  const change = useMutation({
    mutationFn: () => client.requestEmailChange(email),
    onSuccess: () => {
      toast.success("Check your new inbox to confirm the change.");
      setOpen(false);
      setEmail("");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setEmail("");
          change.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="self-start">
          Change email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Change your email</DialogTitle>
        <DialogDescription>
          We'll email a confirmation link to the new address. Your current email stays active
          until you confirm.
        </DialogDescription>
        <form
          className="mt-4 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) change.mutate();
          }}
        >
          <Field label="New email" htmlFor="new-email">
            <Input
              id="new-email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={change.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" loading={change.isPending} disabled={!valid}>
              Send confirmation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
