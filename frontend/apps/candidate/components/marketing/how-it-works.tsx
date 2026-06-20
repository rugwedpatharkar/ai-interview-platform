import { STEPS } from "../../app/(marketing)/content";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-y border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="text-center">
          <p className="text-sm font-medium text-primary">For candidates</p>
          <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
            From “apply” to “you’re hired” — in four steps.
          </h2>
        </div>
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={s.title}>
                <div className="flex items-center gap-3">
                  <span className="font-display text-base font-semibold text-brand-600">{i + 1}</span>
                  <span className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Icon className="size-4" aria-hidden />
                  </span>
                </div>
                <h3 className="mt-3 font-display text-base font-medium text-foreground">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
