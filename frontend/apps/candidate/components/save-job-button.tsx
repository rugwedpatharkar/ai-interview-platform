"use client";

import { Button, toast } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck } from "lucide-react";

import { useAuth } from "../lib/auth";
import { useSavedJobsClient } from "../lib/saved-jobs-client";
import { useSavedSet } from "../lib/use-saved-set";

/** Reusable bookmark toggle. Optimistic: flips the `["saved-jobs","ids"]` cache on
 * click, rolls back on error, and invalidates the list + id-set on settle. Renders
 * null when signed out (the surrounding page may be public). */
export function SaveJobButton({ jobId }: { jobId: string }) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const savedJobsClient = useSavedJobsClient();
  const saved = useSavedSet().has(jobId);

  const toggle = useMutation({
    mutationFn: () =>
      saved ? savedJobsClient.unsave(jobId) : savedJobsClient.save(jobId),
    // Optimistic update: snapshot → mutate the id Set → return the snapshot for rollback.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["saved-jobs", "ids"] });
      const prev =
        qc.getQueryData<Set<string>>(["saved-jobs", "ids"]) ?? new Set<string>();
      const next = new Set(prev);
      if (saved) next.delete(jobId);
      else next.add(jobId);
      qc.setQueryData(["saved-jobs", "ids"], next);
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx) qc.setQueryData(["saved-jobs", "ids"], ctx.prev); // roll back
      toast.error(errorMessage(err));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["saved-jobs", "ids"] });
      qc.invalidateQueries({ queryKey: ["saved-jobs"] }); // the /saved list
    },
  });

  if (!token) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-pressed={saved}
      aria-label={saved ? "Saved — click to remove" : "Save job"}
      onClick={(e) => {
        e.preventDefault(); // the card is a <Link> — don't navigate on toggle
        e.stopPropagation();
        toggle.mutate();
      }}
    >
      {saved ? (
        <BookmarkCheck className="size-4" aria-hidden />
      ) : (
        <Bookmark className="size-4" aria-hidden />
      )}
      <span className="sr-only">{saved ? "Saved" : "Save"}</span>
    </Button>
  );
}
