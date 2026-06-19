"use client";

import { Button } from "@ip/ui";
import { Sparkles } from "lucide-react";

// Lifted as-is from the inline /jobs/new JSX. The `jd.improve` call itself stays in the
// page (it owns the mutation + the improved-draft state); this is the pure affordance.
export function AiSuggestPanel({
  improving,
  suggestions,
  disabled,
  onImprove,
}: {
  improving: boolean;
  suggestions: string[];
  disabled: boolean;
  onImprove: () => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          leadingIcon={Sparkles}
          loading={improving}
          disabled={disabled || improving}
          onClick={onImprove}
        >
          Improve with AI
        </Button>
        <span className="text-xs text-muted-foreground">
          Polish the description with AI before posting.
        </span>
      </div>
      {suggestions.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm">
          <p className="font-medium text-foreground">Suggestions</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
