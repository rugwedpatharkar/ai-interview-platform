import { ArrowRight } from "lucide-react";
import { MERIT_FLOW } from "../../app/(marketing)/content";

export function MeritFlow() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-wide text-brand-600">Merit, made visible</p>
        <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
          A fair shot you can actually see.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          No black-box verdicts — here is exactly how a decision gets made.
        </p>
      </div>
      <ol className="mt-12 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center">
        {MERIT_FLOW.map((n, i) => {
          const Icon = n.icon;
          return (
            <li key={n.label} className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="flex w-40 flex-col items-center rounded-xl border border-border bg-background p-4 text-center">
                <span className="inline-flex size-9 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="mt-2 text-sm font-medium text-foreground">{n.label}</span>
              </div>
              {i < MERIT_FLOW.length - 1 && (
                <ArrowRight className="size-5 rotate-90 text-muted-foreground sm:rotate-0" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
