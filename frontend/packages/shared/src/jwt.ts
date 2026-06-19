/**
 * Decode the payload of a JWT (base64url part[1]) without verifying the signature.
 * Returns the parsed payload object, or null if the token is malformed or the payload
 * is not a JSON object. Never throws.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) return null;
  const payload64 = parts[1] as string;
  try {
    const json = atob(payload64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload: unknown = JSON.parse(json);
    if (typeof payload !== "object" || payload === null) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
