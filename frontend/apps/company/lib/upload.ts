import {
  LOGO_ACCEPTED_MIME,
  LOGO_MAX_BYTES,
  type PresignLogoResult,
} from "../app/branding/branding-types";

export class LogoValidationError extends Error {}

/** Validate (MIME + size) → presign → PUT the bytes direct to storage → return the logo key.
 *  The presigned URL carries its own auth, so the PUT uses plain `fetch`, NOT authedFetch.
 *  Client validation is a courtesy; the server presign is the real guard. */
export async function uploadViaPresign(
  presign: (p: { contentType: string; size: number }) => Promise<PresignLogoResult>,
  file: File,
): Promise<string> {
  if (file.type && !LOGO_ACCEPTED_MIME.has(file.type))
    throw new LogoValidationError("Logo must be a PNG, JPG, or WEBP image.");
  if (file.size > LOGO_MAX_BYTES)
    throw new LogoValidationError("Logo must be 2 MB or smaller.");
  const { url, logoKey } = await presign({ contentType: file.type, size: file.size });
  const res = await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "content-type": file.type },
  });
  if (!res.ok) throw new Error(`logo upload failed: ${res.status}`);
  return logoKey;
}
