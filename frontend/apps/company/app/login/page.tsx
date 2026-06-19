"use client";

import { CredentialsForm } from "../../components/credentials-form";
import { SsoButtons } from "../../components/sso-buttons";
import { useAuth } from "../../lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  return (
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
  );
}
