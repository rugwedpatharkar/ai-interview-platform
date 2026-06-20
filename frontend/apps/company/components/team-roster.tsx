"use client";

import {
  Badge,
  type BadgeTone,
  Button,
  ConfirmDialog,
  ErrorState,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../lib/auth";
import { isLastAdmin } from "../app/team/team-client";
import { ROLE_LABELS, type CompanyRole, type MemberStatus, type TeamClient } from "../app/team/types";

const STATUS_TONE: Record<MemberStatus, BadgeTone> = {
  active: "success",
  pending: "warning",
  revoked: "neutral",
};

const STATUS_LABEL: Record<MemberStatus, string> = {
  active: "Active",
  pending: "Invited",
  revoked: "Revoked",
};

const DAY_MS = 86_400_000;
function lastActiveLabel(iso: string): string {
  if (!iso) return "Invited";
  const days = Math.round((Date.parse(iso) - Date.now()) / DAY_MS);
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(days, "day");
}

// The roster: every company member with status + role, inline role change, and lifecycle
// actions (resend/revoke for pending, remove for active). The server enforces team:manage +
// tenant scope + the last-admin invariant; disabling the only-admin's Remove / role change
// is UX only (avoids a pointless round-trip).
export function TeamRoster({ client }: { client: TeamClient }) {
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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last active</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const lastAdmin = isLastAdmin(members, m);
            const you = m.id === identity?.id;
            const revoked = m.status === "revoked";
            return (
              <TableRow key={m.id}>
                <TableCell className="font-medium text-foreground">
                  {m.email}
                  {you && <span className="ml-1 text-muted-foreground">(you)</span>}
                </TableCell>
                <TableCell>
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
                </TableCell>
                <TableCell>
                  <Badge tone={STATUS_TONE[m.status]} variant="subtle">
                    {STATUS_LABEL[m.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {lastActiveLabel(m.lastActiveAt)}
                </TableCell>
                <TableCell className="text-right">
                  {m.status === "pending" && (
                    <span className="inline-flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        loading={resend.isPending}
                        onClick={() => resend.mutate(m.id)}
                      >
                        Resend
                      </Button>
                      <ConfirmDialog
                        trigger={
                          <Button variant="outline" size="sm">
                            Revoke
                          </Button>
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
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={lastAdmin}
                          title={
                            lastAdmin
                              ? "A company needs at least one admin"
                              : undefined
                          }
                        >
                          Remove
                        </Button>
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
                  {revoked && <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
