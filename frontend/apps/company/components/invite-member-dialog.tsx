"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { CompanyRole, TeamClient } from "../app/team/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteRole = Exclude<CompanyRole, "company_admin">;

// Invite a recruiter or hiring manager — never an admin (matches the server: role ∈
// {recruiter, hiring_manager}). The new pending row appears once the list query invalidates.
export function InviteMemberDialog({ client }: { client: TeamClient }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("recruiter");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const invite = useMutation({
    mutationFn: () => client.inviteMember(email.trim(), role, password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: client.listQueryKey() });
      toast.success("Invited");
      setOpen(false);
      setEmail("");
      setPassword("");
      setRole("recruiter");
      setErrors({});
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address.";
    if (password.length < 8) next.password = "At least 8 characters.";
    setErrors(next);
    if (!next.email && !next.password) invite.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button leadingIcon={UserPlus}>Invite member</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Invite a team member</DialogTitle>
        <DialogDescription>
          They sign in with this email and temporary password, then set their own.
        </DialogDescription>
        <form onSubmit={onSubmit} className="mt-2 flex flex-col gap-4" noValidate>
          <Field label="Email" htmlFor="invite-email" error={errors.email}>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              value={email}
              aria-invalid={Boolean(errors.email) || undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
              }}
            />
          </Field>
          <Field label="Role" htmlFor="invite-role">
            <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recruiter">Recruiter</SelectItem>
                <SelectItem value="hiring_manager">Hiring manager</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field
            label="Temporary password"
            htmlFor="invite-pw"
            error={errors.password}
            hint="At least 8 characters."
          >
            <Input
              id="invite-pw"
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={password}
              aria-invalid={Boolean(errors.password) || undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
              }}
            />
          </Field>
          <Button
            type="submit"
            className="self-start"
            loading={invite.isPending}
            disabled={!email.trim() || !password || invite.isPending}
          >
            Send invite
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
