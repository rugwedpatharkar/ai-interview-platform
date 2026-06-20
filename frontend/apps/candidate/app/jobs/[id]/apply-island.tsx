"use client";

import { Button, Checkbox, buttonVariants, cn, toast } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "../../../lib/auth";

/** Apply control — requires auth. Keeps the EXACT contract from the old page:
 * consent key `job-consent:<id>`, `api.applications.apply({ jobId, consent })`, and
 * the `["recommendations"]` / `["applications"]` invalidations + redirect on success.
 * Signed-out visitors get a sign-in CTA instead (the page itself is public). */
export function ApplyIsland({ jobId }: { jobId: string }) {
  const { api, token, ready } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const consentKey = `job-consent:${jobId}`;
  const [consent, setConsent] = useState(false);

  // Restore a previously ticked consent so an accidental refresh doesn't lose it.
  useEffect(() => {
    setConsent(localStorage.getItem(consentKey) === "true");
  }, [consentKey]);

  function toggleConsent(v: boolean) {
    setConsent(v);
    localStorage.setItem(consentKey, String(v));
  }

  const apply = useMutation({
    mutationFn: () => api.applications.apply({ jobId, consent }),
    onSuccess: () => {
      toast.success("Application submitted");
      localStorage.removeItem(consentKey);
      // The applied role must drop out of the dashboard recommendations (no stale
      // Apply button) — mirror dashboard.tsx's apply path.
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      router.push("/");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (ready && !token) {
    return (
      <Link
        href={`/login?next=/jobs/${jobId}`}
        className={cn(buttonVariants(), "self-start")}
      >
        Sign in to apply
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <Checkbox
          checked={consent}
          onCheckedChange={(v) => toggleConsent(v === true)}
        />
        I consent to AI-assisted screening of my application.
      </label>
      <Button
        onClick={() => apply.mutate()}
        disabled={!consent || apply.isPending}
        loading={apply.isPending}
        className="self-start"
      >
        {apply.isPending ? "Applying…" : "Apply"}
      </Button>
    </div>
  );
}
