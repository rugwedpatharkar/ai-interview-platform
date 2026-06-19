/**
 * POST {adminBase}/auth/resend-verification with {"email": email}.
 * Returns 204 on success. Any non-2xx throws an Error with a user-friendly message.
 * Intentionally unauthenticated — the user may not be logged in.
 */
export async function resendVerification(email: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";
  const res = await fetch(`${base}/auth/resend-verification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`resend failed (${res.status})`);
}
