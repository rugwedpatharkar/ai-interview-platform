"use client";

import {
  AppShell,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ErrorState,
  LoadingState,
  toast,
} from "@ip/ui";
import { Code, ConnectError, errorMessage, isNotFound, useAuthedQuery, useRequireAuth } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "../../../lib/auth";

function isForbidden(err: unknown): boolean {
  return err instanceof ConnectError && err.code === Code.PermissionDenied;
}

export default function PublicJobPage() {
  const { api, token, ready } = useAuth();
  useRequireAuth(token, ready);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const consentKey = `job-consent:${id}`;
  const [consent, setConsent] = useState(false);

  // Restore a previously ticked consent so an accidental refresh doesn't lose it.
  useEffect(() => {
    setConsent(localStorage.getItem(consentKey) === "true");
  }, [consentKey]);

  function toggleConsent(v: boolean) {
    setConsent(v);
    localStorage.setItem(consentKey, String(v));
  }

  const job = useAuthedQuery(token, {
    queryKey: ["public-job", id],
    queryFn: () => api.jobs.getPublicJob({ jobId: id }),
  });

  const apply = useMutation({
    mutationFn: () => api.applications.apply({ jobId: id, consent }),
    onSuccess: () => {
      toast.success("Application submitted");
      localStorage.removeItem(consentKey);
      // The applied role must drop out of the dashboard recommendations (no stale
      // Apply button) — mirror dashboard.tsx's apply path.
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      router.push("/");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const jobErrorMessage = job.isError
    ? isNotFound(job.error)
      ? "This job is no longer available."
      : isForbidden(job.error)
        ? "You don't have access to this job."
        : errorMessage(job.error)
    : "";

  return (
    <AppShell
      title="Interview Platform"
      nav={<Link href="/">Home</Link>}
    >
      {job.isLoading && <LoadingState />}
      {job.isError && (
        <ErrorState
          message={jobErrorMessage}
          retry={
            isNotFound(job.error) || isForbidden(job.error)
              ? undefined
              : () => job.refetch()
          }
        />
      )}
      {job.data && (
        <Card>
          <CardHeader>
            <CardTitle>{job.data.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {job.data.jdText}
            </p>
            <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Checkbox
                checked={consent}
                onCheckedChange={(v) => toggleConsent(v === true)}
              />
              I consent to AI-assisted screening of my application.
            </label>
            <Button
              onClick={() => apply.mutate()}
              disabled={!consent || apply.isPending}
              loading={apply.isPending}
              className="self-start"
            >
              {apply.isPending ? "Applying…" : "Apply"}
            </Button>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
