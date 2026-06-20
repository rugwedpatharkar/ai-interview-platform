import { STATS } from "../../app/(marketing)/content";

export function StatStrip() {
  return (
    <section className="border-y border-border bg-surface">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-12 sm:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <dt className="font-display text-3xl font-bold text-brand-600">{s.value}</dt>
            <dd className="mt-1 text-sm text-muted-foreground">{s.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
