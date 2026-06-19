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
  Field,
  Input,
  PageHeader,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { UserPlus } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import { CompanyShell } from "../../components/company-shell";
import { useAuth } from "../../lib/auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TeamPage() {
  const { api, identity } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [invited, setInvited] = useState<string[]>([]);

  const invite = useMutation({
    mutationFn: () => api.auth.inviteRecruiter({ email: email.trim(), password }),
    onSuccess: () => {
      setInvited((v) => [...v, email.trim()]);
      setEmail("");
      setPassword("");
      setErrors({});
      toast.success("Recruiter invited");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (identity?.role !== "company_admin") {
    return (
      <CompanyShell>
        <PageHeader title="Team" />
        <Alert tone="info" title="Admins only">
          Only company admins can invite recruiters.
        </Alert>
      </CompanyShell>
    );
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email.trim())) next.email = "Enter a valid email address.";
    if (password.length < 8)
      next.password = "Password must be at least 8 characters.";
    setErrors(next);
    if (next.email || next.password) return;
    invite.mutate();
  }

  return (
    <CompanyShell>
      <PageHeader
        title="Team"
        description="Invite recruiters to your company workspace."
      />
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Invite a recruiter</CardTitle>
            <CardDescription>
              They sign in with this email and temporary password, then set their own.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <Field label="Email" htmlFor="email" error={errors.email}>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="off"
                  aria-invalid={Boolean(errors.email) || undefined}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                  }}
                />
              </Field>
              <Field
                label="Temporary password"
                htmlFor="password"
                error={errors.password}
                hint="At least 8 characters."
              >
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.password) || undefined}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password)
                      setErrors((p) => ({ ...p, password: undefined }));
                  }}
                />
              </Field>
              <Button
                type="submit"
                className="self-start"
                leadingIcon={UserPlus}
                loading={invite.isPending}
                disabled={!email.trim() || !password || invite.isPending}
              >
                Send invite
              </Button>
            </form>
          </CardContent>
        </Card>

        {invited.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invited this session</CardTitle>
              <CardDescription>
                This list is local to this page and clears when you leave.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {invited.map((e, i) => (
                <Badge key={`${e}-${i}`} tone="success" variant="subtle">
                  {e}
                </Badge>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </CompanyShell>
  );
}
