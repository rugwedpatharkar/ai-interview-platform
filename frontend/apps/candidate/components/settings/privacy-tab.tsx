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
  ConfirmDialog,
  LoadingState,
  toast,
} from "@ip/ui";
import { TERMS_VERSION, errorMessage } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { useAuth } from "../../lib/auth";

const SCOPES = [
  { scope: "data_processing", label: "Processing my data to evaluate my application" },
  { scope: "automated_evaluation", label: "AI-assisted scoring of my interview" },
];

/** Privacy tab: the consent list + the erase-my-account control, moved verbatim from the
 *  old /account page (same ComplianceService calls). /account now redirects here. */
export function PrivacyTab() {
  const { api, logout, token } = useAuth();
  const queryClient = useQueryClient();

  const consents = useQuery({
    queryKey: ["consents"],
    enabled: Boolean(token),
    queryFn: () => api.compliance.getMyConsent({}),
  });

  const record = useMutation({
    mutationFn: (scope: string) =>
      api.compliance.recordConsent({ scope, termsVersion: TERMS_VERSION }),
    onSuccess: () => {
      toast.success("Consent recorded");
      queryClient.invalidateQueries({ queryKey: ["consents"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const erase = useMutation({
    mutationFn: () => api.compliance.eraseMe({}),
    onSuccess: () => {
      toast.success("Your data has been erased.");
      logout();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const granted = new Set((consents.data?.items ?? []).map((i) => i.scope));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Consent</CardTitle>
          <CardDescription>
            You control how your data is used. Consents are recorded with a timestamp.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {consents.isLoading ? (
            <LoadingState label="Loading consents…" />
          ) : consents.isError ? (
            <Alert tone="danger">
              <span className="flex flex-col items-start gap-2">
                Couldn't load your consent status.
                <Button variant="outline" size="sm" onClick={() => consents.refetch()}>
                  Try again
                </Button>
              </span>
            </Alert>
          ) : (
            SCOPES.map((s) => (
              <div
                key={s.scope}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <span className="text-sm text-foreground">{s.label}</span>
                {granted.has(s.scope) ? (
                  <Badge tone="success">
                    <Check className="size-3.5" aria-hidden />
                    Granted
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={record.isPending}
                    onClick={() => record.mutate(s.scope)}
                  >
                    Grant
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete my data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Alert tone="danger">
            This permanently erases your profile, resume, and interview data and signs you
            out. This can't be undone.
          </Alert>
          <ConfirmDialog
            trigger={
              <Button variant="destructive" className="self-start">
                Erase my account
              </Button>
            }
            title="Erase your account?"
            description="Your profile, resume, aptitude, and interview records will be permanently deleted."
            confirmLabel="Erase everything"
            destructive
            busy={erase.isPending}
            onConfirm={() => erase.mutate()}
          />
        </CardContent>
      </Card>
    </div>
  );
}
