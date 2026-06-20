"use client";

// Connector: the parameterized SsoButtons lives in @ip/ui; this binds it to the app's
// auth client so the login page's `<SsoButtons />` (no props) keeps working.
import { SsoButtons as SharedSsoButtons } from "@ip/ui";

import { useAuth } from "../lib/auth";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";

export function SsoButtons() {
  const { api } = useAuth();
  return <SharedSsoButtons api={api} adminUrl={ADMIN_URL} />;
}
