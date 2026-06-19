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
  ErrorState,
  LoadingState,
  PageHeader,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CompanyShell } from "../../components/company-shell";
import { useAuth } from "../../lib/auth";

const TERMS_VERSION = "1.0";
const SCOPES = [
  { scope: "data_processing", label: "Processing my data to operate the platform" },
  { scope: "automated_evaluation", label: "AI-assisted evaluation features" },
];

export default function AccountPage() {
  const { api, logout } = useAuth();
  const queryClient = useQueryClient();

  const consents = useQuery({
    queryKey: ["consents"],
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
    <CompanyShell>
      <PageHeader title="Account & privacy" />

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Consent</CardTitle>
            <CardDescription>
              Consents are recorded with a timestamp for compliance.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {consents.isLoading ? (
              <LoadingState label="Loading consents…" />
            ) : consents.isError ? (
              <ErrorState
                message={errorMessage(consents.error)}
                retry={() => consents.refetch()}
              />
            ) : (
              SCOPES.map((s) => (
                <div
                  key={s.scope}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <span className="text-sm text-foreground">{s.label}</span>
                  {granted.has(s.scope) ? (
                    <Badge tone="success">Granted</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={record.isPending}
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
              This permanently erases your account data and signs you out. This can't be
              undone.
            </Alert>
            <ConfirmDialog
              trigger={
                <Button
                  variant="destructive"
                  className="self-start"
                  leadingIcon={Trash2}
                >
                  Erase my account
                </Button>
              }
              title="Erase your account?"
              description="Your account data will be permanently deleted."
              confirmLabel="Erase everything"
              destructive
              busy={erase.isPending}
              onConfirm={() => erase.mutate()}
            />
          </CardContent>
        </Card>
      </div>
    </CompanyShell>
  );
}
