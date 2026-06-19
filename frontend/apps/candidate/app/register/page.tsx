"use client";

import { CredentialsForm } from "../../components/credentials-form";
import { useAuth } from "../../lib/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  return (
    <CredentialsForm
      title="Create your account"
      description="Sign up to apply for roles and track your applications."
      submitLabel="Sign up"
      action={register}
      altHref="/login"
      altLabel="Already have an account? Log in"
    />
  );
}
