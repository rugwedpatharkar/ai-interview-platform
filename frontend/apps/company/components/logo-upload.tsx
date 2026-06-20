"use client";

import { Alert, Avatar, Spinner, buttonVariants, cn } from "@ip/ui";
import { type ChangeEvent, useState } from "react";

import type { PresignLogoResult } from "../app/branding/branding-types";
import { LogoValidationError, uploadViaPresign } from "../lib/upload";

// Mirrors the candidate résumé picker: an sr-only file input behind a styled <label>
// (keyboard + SR reachable). Builds an object-URL preview from the picked file so the
// just-uploaded logo renders without making the bucket public.
export function LogoUpload({
  initialUrl,
  presign,
  onUploaded,
}: {
  initialUrl?: string;
  presign: (p: { contentType: string; size: number }) => Promise<PresignLogoResult>;
  onUploaded: (logoKey: string, previewUrl: string) => void;
}) {
  const [preview, setPreview] = useState(initialUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after an error
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const logoKey = await uploadViaPresign(presign, file);
      const localUrl = URL.createObjectURL(file);
      setPreview(localUrl);
      onUploaded(logoKey, localUrl);
    } catch (err) {
      setError(
        err instanceof LogoValidationError ? err.message : "Upload failed — try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface-muted/40 p-4">
      <Avatar name="Logo" src={preview || undefined} size="lg" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <label
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "cursor-pointer border border-border",
            busy && "pointer-events-none opacity-50",
          )}
        >
          {busy ? <Spinner className="size-4" /> : null}
          {busy ? "Uploading…" : "Upload logo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={onPick}
            disabled={busy}
          />
        </label>
        <span className="text-xs text-muted-foreground">PNG, JPG, or WEBP · up to 2 MB.</span>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </div>
  );
}
