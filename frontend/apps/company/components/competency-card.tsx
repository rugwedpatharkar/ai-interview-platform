import type { Competency } from "../app/jobs/[id]/applicants/[appId]/types";

/** A single competency row: name + mono score, a cyan progress bar, and evidence quotes. */
export function CompetencyCard({ c }: { c: Competency }) {
  const pct = Math.round(Math.min(1, Math.max(0, c.score)) * 100);
  return (
    <div className="flex flex-col gap-2 border-b border-border py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-display text-sm font-semibold text-foreground">
          {c.competency}
        </span>
        <span className="font-mono text-sm font-medium tabular-nums text-foreground">
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
          className="h-full rounded-full bg-primary transition-[width] duration-500"
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
