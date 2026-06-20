import { Progress } from "@ip/ui";

/** Profile completeness, driven by the server's `completeness` (0–100). The meter is
 * the screen's one focal point (brand Progress). The hint nudges the next best action. */
export function CompletenessMeter({ value }: { value: number }) {
  const hint =
    value >= 100
      ? "Your profile is complete — you'll get the best matches."
      : value >= 60
        ? "Almost there — add any missing experience or skills."
        : "Add your experience, education and skills to improve your matches.";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Profile completeness</span>
        <span className="font-display text-sm font-semibold tabular-nums text-primary">
          {value}%
        </span>
      </div>
      <Progress value={value} aria-label="Profile completeness" />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
