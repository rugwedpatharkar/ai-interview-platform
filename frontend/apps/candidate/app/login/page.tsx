"use client";

import { CredentialsForm } from "../../components/credentials-form";
import { SsoButtons } from "../../components/sso-buttons";
import { useAuth } from "../../lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  return (
    <CredentialsForm
      title="Welcome back"
      description="Log in to your candidate account."
      submitLabel="Log in"
      action={login}
      altHref="/register"
      altLabel="Need an account? Sign up"
      forgotHref="/forgot"
      footer={<SsoButtons />}
    />
  );
}
