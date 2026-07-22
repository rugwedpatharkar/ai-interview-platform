"use client";

import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  toast,
} from "@ip/ui";
import type { ApplicationResponse } from "@ip/api-client";
import { errorMessage, track } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "../../../lib/auth";

/** Apply control — requires auth. Keeps the EXACT contract from the old page:
 * consent key `job-consent:<id>`, `api.applications.apply({ jobId, consent })`, and
 * the `["recommendations"]` / `["applications"]` invalidations + redirect on success.
 * Signed-out visitors get a sign-in CTA instead (the page itself is public).
 *
 * v3 surfaces the consent step as a modal opened by an "Apply" button, rather than the
 * inline checkbox-and-button. The localStorage `job-consent:<id>` key still primes the
 * checkbox so an accidental refresh during the dialog doesn't lose the tick. */
export function ApplyIsland({ jobId }: { jobId: string }) {
  const { api, token, ready } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const consentKey = `job-consent:${jobId}`;
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);

  // Restore a previously ticked consent so an accidental refresh during the consent dialog
  // doesn't lose it. (The dialog can close + re-open without losing state.)
  useEffect(() => {
    setConsent(localStorage.getItem(consentKey) === "true");
  }, [consentKey]);

  // Fire once per mount — the SSR page is public/crawlable, so this client-side event
  // is the reliable signal that a real user viewed the job detail.
  useEffect(() => {
    track("job.viewed", { job_id: jobId });
  }, [jobId]);

  function toggleConsent(v: boolean) {
    setConsent(v);
    try {
      localStorage.setItem(consentKey, String(v));
    } catch {
      // Private-mode browsers — the in-memory state still drives the button enabled-ness.
    }
  }

  const apply = useMutation({
    mutationFn: () => api.applications.apply({ jobId, consent }),
    onSuccess: (out: ApplicationResponse) => {
      track("application.submitted", {
        job_id: jobId,
        application_id: out.applicationId,
      });
      toast.success("Application submitted");
      try {
        localStorage.removeItem(consentKey);
      } catch {
        /* see toggleConsent */
      }
      // The applied role must drop out of the dashboard recommendations (no stale
      // Apply button) — mirror dashboard.tsx's apply path.
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      setOpen(false);
      router.push("/");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (ready && !token) {
    // Same slot as the "Apply now" button below, which uses the Aperture product
    // tier. Stacking buttonVariants() on top of it let Tailwind's utilities layer
    // win, so the signed-out and signed-in states rendered as visibly different
    // buttons in the same position. One tier per element.
    return (
      <Link
        href={`/login?next=/jobs/${jobId}`}
        className="ap-btn ap-btn-primary self-start"
      >
        Sign in to apply
      </Link>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => {
          track("application.started", { job_id: jobId });
          setOpen(true);
        }}
        className="ap-btn ap-btn-primary"
      >
        Apply now
      </button>
      <DialogContent>
        <DialogTitle>Apply to this role</DialogTitle>
        <DialogDescription>
          We&apos;ll send your application to the hiring team. AI-assisted screening is
          opt-in and never the sole decision-maker.
        </DialogDescription>
        <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-line bg-surface-2 p-3 text-sm text-ink-2">
          <Checkbox
            checked={consent}
            onCheckedChange={(v) => toggleConsent(v === true)}
            className="mt-0.5"
          />
          <span>
            I consent to AI-assisted screening of my application. Recruiters review every
            recommendation before deciding.
          </span>
        </label>
        <div className="mt-4 flex justify-end gap-3">
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={apply.isPending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={() => apply.mutate()}
            disabled={!consent || apply.isPending}
            loading={apply.isPending}
          >
            {apply.isPending ? "Applying…" : "Submit application"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
