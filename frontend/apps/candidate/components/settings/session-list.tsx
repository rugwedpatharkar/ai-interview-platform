"use client";

import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  LoadingState,
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
import { Monitor } from "lucide-react";

import type { SettingsClient } from "../../app/settings/types";

const DAY_MS = 86_400_000;
const rel = (iso: string) =>
  new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    Math.round((Date.parse(iso) - Date.now()) / DAY_MS),
    "day",
  );

/** Active-session list with per-row revoke + a "sign out everywhere else" bulk action.
 *  The current device is badged and its revoke is disabled (you can't kill your own session
 *  here — that's logout). "Current" is advisory (IP+UA match server-side). */
export function SessionList({ client }: { client: SettingsClient }) {
  const qc = useQueryClient();
  const key = client.sessionsQueryKey();
  const q = useQuery({ queryKey: key, queryFn: () => client.listSessions() });
  const revoke = useMutation({
    mutationFn: (jti: string) => client.revokeSession(jti),
    onSuccess: () => {
      toast.success("Session revoked");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const revokeAll = useMutation({
    mutationFn: () => client.revokeAllSessions(),
    onSuccess: () => {
      toast.success("Other sessions signed out");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <LoadingState label="Loading sessions…" />;
  if (q.isError)
    return <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />;

  const sessions = q.data ?? [];
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Last active</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((s) => (
              <TableRow key={s.jti}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <Monitor className="size-4 text-muted-foreground" aria-hidden />
                    {s.userAgent}
                    {s.current && (
                      <Badge tone="info" variant="subtle">
                        This device
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{s.ip}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{rel(s.lastSeenAt)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={s.current || revoke.isPending}
                    onClick={() => revoke.mutate(s.jti)}
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        trigger={
          <Button
            variant="outline"
            className="self-start"
            disabled={sessions.length <= 1}
          >
            Sign out other sessions
          </Button>
        }
        title="Sign out everywhere else?"
        description="All sessions except this device will be signed out."
        confirmLabel="Sign out others"
        busy={revokeAll.isPending}
        onConfirm={() => revokeAll.mutate()}
      />
    </div>
  );
}
