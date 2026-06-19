"use client";

import { Alert } from "@ip/ui";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import { CredentialsForm } from "../../components/credentials-form";
import { SsoButtons } from "../../components/sso-buttons";
import { useAuth } from "../../lib/auth";

/** Reads ?notice= and renders an info banner. Isolated in its own component so
 *  Next.js can Suspense-wrap it without affecting the rest of the login page. */
function NoticeAlert() {
  const params = useSearchParams();
  if (params.get("notice") !== "account-created") return null;
  return (
    <div className="mx-auto mb-4 max-w-md px-6">
      <Alert tone="success">Account created — please sign in.</Alert>
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  return (
    <>
      <Suspense fallback={null}>
        <NoticeAlert />
      </Suspense>
      <CredentialsForm
        title="Recruiter login"
        description="Log in to your recruiter account."
        submitLabel="Log in"
        action={login}
        altHref="/register"
        altLabel="Create a company account"
        forgotHref="/forgot"
        footer={<SsoButtons />}
      />
    </>
  );
}
