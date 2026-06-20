import type { Competency } from "../app/jobs/[id]/applicants/[appId]/types";

/** A single competency row: name + score, a cyan progress bar, and evidence quotes. */
export function CompetencyCard({ c, index = 0 }: { c: Competency; index?: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, c.score)) * 100);
  return (
    <div
      className="flex animate-rise-in flex-col gap-2 border-b border-border py-4 first:pt-0 last:border-0 last:pb-0"
      style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-semibold text-foreground">
          {c.competency}
        </span>
        <span className="text-sm font-medium tabular-nums text-foreground">
          {pct}
          <span className="text-xs text-muted-foreground"> / 100</span>
        </span>
      </div>

      {/* Cyan progress bar — width tracks the competency score. */}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
        role="img"
        aria-label={`${c.competency} score ${pct} out of 100`}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-[450ms] ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {c.rationale && (
        <p className="text-sm text-muted-foreground">{c.rationale}</p>
      )}

      {c.evidence.length > 0 && (
        <ul className="mt-1 flex flex-col gap-2">
          {c.evidence.map((e, i) => (
            <li key={i} className="border-l-2 border-primary pl-3">
              <p className="text-sm italic text-foreground">“{e.quote}”</p>
              {e.note && (
                <p className="mt-0.5 font-mono text-xs tracking-wide text-muted-foreground">
                  {e.note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
