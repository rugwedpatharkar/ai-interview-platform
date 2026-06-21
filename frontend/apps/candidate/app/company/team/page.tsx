"use client";

import {
  Alert,
  Avatar,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  cn,
  toast,
} from "@ip/ui";
import { errorMessage, useRequireRole } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, UserPlus, X } from "lucide-react";
import { type FormEvent, useState } from "react";

import { CompanyShell } from "../../../components/company-shell";
import { useAuth } from "../../../lib/auth";
import { isLastAdmin, makeTeamClient } from "./team-client";
import {
  ROLE_LABELS,
  SCOPES,
  can,
  type CompanyRole,
  type MemberStatus,
  type TeamClient,
} from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 86_400_000;
const STATUS_LABEL: Record<MemberStatus, string> = {
  active: "Active",
  pending: "Invited",
  revoked: "Revoked",
};
const STATUS_PILL: Record<MemberStatus, string> = {
  active: "ap-pill--good",
  pending: "ap-pill--warn",
  revoked: "",
};

function lastActiveLabel(iso: string): string {
  if (!iso) return "Invited";
  const days = Math.round((Date.parse(iso) - Date.now()) / DAY_MS);
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(days, "day");
}

// Team & permissions — admin-only. Every TeamService RPC is preserved (list/invite/resend/
// revoke/remove/changeRole), as is the last-admin guard (UI disable + server-authoritative
// error). The server enforces team:manage on every RPC — this gate is defence-in-depth.
export default function TeamPage() {
  const { api, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["company_admin"], ready);

  // Live by default; mock when NEXT_PUBLIC_MOCK=1. Stable so roster + invite dialog share
  // query invalidation; rebuilt only if `api` itself changes (effectively never per session).
  const [client] = useState(() => makeTeamClient(api));

  if (identity?.role !== "company_admin") {
    return (
      <CompanyShell>
        <header className="mb-8">
          <h1 className="ap-h2">Team</h1>
        </header>
        <Alert tone="info" title="Admins only">
          Only company admins can manage the team.
        </Alert>
      </CompanyShell>
    );
  }

  return (
    <CompanyShell>
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="ap-eyebrow">Team</p>
          <h1 className="ap-h2">Who&apos;s on the hook.</h1>
          <p className="ap-lead mt-3 text-base">
            Invite recruiters and hiring managers. Roles map to scopes; the server enforces
            them on every RPC.
          </p>
        </div>
        <InviteMemberDialog client={client} />
      </header>

      <div className="flex flex-col gap-8">
        <TeamRoster client={client} />
        <PermissionCloud />
      </div>
    </CompanyShell>
  );
}

function TeamRoster({ client }: { client: TeamClient }) {
  const { identity } = useAuth();
  const qc = useQueryClient();
  const key = client.listQueryKey();
  const q = useQuery({ queryKey: key, queryFn: () => client.listMembers() });

  const invalidate = () => qc.invalidateQueries({ queryKey: key });

  const changeRole = useMutation({
    mutationFn: (v: { id: string; role: CompanyRole }) => client.changeRole(v.id, v.role),
    onSuccess: () => {
      toast.success("Role updated");
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const resend = useMutation({
    mutationFn: (id: string) => client.resendInvite(id),
    onSuccess: () => {
      toast.success("Invite resent");
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => client.revokeInvite(id),
    onSuccess: () => {
      toast.success("Invite revoked");
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.removeMember(id),
    onSuccess: () => {
      toast.success("Member removed");
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (q.isLoading) return <LoadingState label="Loading team…" />;
  if (q.isError)
    return <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />;

  const members = q.data ?? [];

  return (
    <section className="flex flex-col gap-3">
      <h2 className="ap-h3 text-xl">Members</h2>
      <div className="ap-cell !p-0 overflow-hidden">
        <div className="table-wrap overflow-x-auto">
          <table className="data w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-ink-3">
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last seen</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const lastAdmin = isLastAdmin(members, m);
                const you = m.id === identity?.id;
                const revoked = m.status === "revoked";
                return (
                  <tr
                    key={m.id}
                    className="border-b border-line transition-colors last:border-b-0 hover:bg-surface-2"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.email} size="sm" />
                        <span className="min-w-0 truncate font-medium text-foreground">
                          {m.email}
                          {you && (
                            <span className="ml-1 font-normal text-ink-3">(you)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={m.role}
                        disabled={revoked || lastAdmin || changeRole.isPending}
                        onValueChange={(role) =>
                          changeRole.mutate({ id: m.id, role: role as CompanyRole })
                        }
                      >
                        <SelectTrigger
                          className="w-40"
                          title={
                            lastAdmin ? "A company needs at least one admin" : undefined
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="company_admin">
                            {ROLE_LABELS.company_admin}
                          </SelectItem>
                          <SelectItem value="recruiter">{ROLE_LABELS.recruiter}</SelectItem>
                          <SelectItem value="hiring_manager">
                            {ROLE_LABELS.hiring_manager}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("ap-pill", STATUS_PILL[m.status])}>
                        {STATUS_LABEL[m.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-ink-2">
                      {lastActiveLabel(m.lastActiveAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {m.status === "pending" && (
                        <span className="inline-flex justify-end gap-2">
                          <button
                            type="button"
                            className="ap-btn ap-btn-ghost ap-btn-sm"
                            disabled={resend.isPending}
                            onClick={() => resend.mutate(m.id)}
                          >
                            Resend
                          </button>
                          <ConfirmDialog
                            trigger={
                              <button
                                type="button"
                                className="ap-btn ap-btn-ghost ap-btn-sm"
                              >
                                Revoke
                              </button>
                            }
                            title="Revoke this invite?"
                            description="The invite link stops working immediately."
                            confirmLabel="Revoke"
                            destructive
                            busy={revoke.isPending}
                            onConfirm={async () => {
                              await revoke.mutateAsync(m.id);
                            }}
                          />
                        </span>
                      )}
                      {m.status === "active" && (
                        <ConfirmDialog
                          trigger={
                            <button
                              type="button"
                              className="ap-btn ap-btn-ghost ap-btn-sm text-danger"
                              disabled={lastAdmin}
                              title={
                                lastAdmin
                                  ? "A company needs at least one admin"
                                  : undefined
                              }
                            >
                              Remove
                            </button>
                          }
                          title="Remove this member?"
                          description="Their access is revoked and they're signed out."
                          confirmLabel="Remove"
                          destructive
                          busy={remove.isPending}
                          onConfirm={async () => {
                            await remove.mutateAsync(m.id);
                          }}
                        />
                      )}
                      {revoked && <span className="text-ink-3">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// Per-role permission *cloud*: badges grouped per role. Visually lighter than a grid;
// answers "what can a hiring manager actually do?" at a glance.
function PermissionCloud() {
  const roles: CompanyRole[] = ["company_admin", "recruiter", "hiring_manager"];
  return (
    <section className="flex flex-col gap-3">
      <h2 className="ap-h3 text-xl">What each role can do</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {roles.map((r) => (
          <div key={r} className="ap-cell">
            <h3 className="ap-h4 flex items-baseline justify-between gap-2">
              {ROLE_LABELS[r]}
              <span className="text-xs font-mono uppercase tracking-wide text-ink-3">
                {SCOPES.filter((s) => can(r, s.scope)).length} scopes
              </span>
            </h3>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {SCOPES.map((s) => {
                const allowed = can(r, s.scope);
                return (
                  <span
                    key={s.scope}
                    className={cn(
                      "ap-pill text-xs",
                      allowed ? "ap-pill--good" : "opacity-60",
                    )}
                    title={s.scope}
                  >
                    {allowed ? (
                      <Check className="size-3" aria-hidden />
                    ) : (
                      <X className="size-3" aria-hidden />
                    )}
                    {s.label}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-3">
        The server is the authority — this surface mirrors{" "}
        <code className="font-mono text-ink-2">lib/lib/schemas/permissions.py</code>.
      </p>
    </section>
  );
}

// Invite recruiter or hiring manager — never an admin (matches the server: role ∈
// {recruiter, hiring_manager}). New pending row appears once the list query invalidates.
function InviteMemberDialog({ client }: { client: TeamClient }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<CompanyRole, "company_admin">>("recruiter");
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
        <button type="button" className="ap-btn ap-btn-primary">
          <UserPlus className="size-4" aria-hidden /> Invite member
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Invite a team member</DialogTitle>
        <DialogDescription>
          They sign in with this email and temporary password, then set their own.
        </DialogDescription>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4" noValidate>
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
            <Select
              value={role}
              onValueChange={(v) =>
                setRole(v as Exclude<CompanyRole, "company_admin">)
              }
            >
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
          <button
            type="submit"
            className="ap-btn ap-btn-primary self-start"
            disabled={!email.trim() || !password || invite.isPending}
          >
            {invite.isPending && <Spinner className="size-4" />}
            {invite.isPending ? "Sending…" : "Send invite"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
