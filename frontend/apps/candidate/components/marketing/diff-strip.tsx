import { Card, CardContent } from "@ip/ui";
import { DIFFERENTIATORS } from "../../app/(marketing)/content";

export function DiffStrip() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="mx-auto max-w-2xl text-balance text-center font-display text-3xl font-bold tracking-tight text-foreground">
        The hiring platform that doesn&apos;t ghost you — and gives a result you can trust.
      </h2>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {DIFFERENTIATORS.map((d) => {
          const Icon = d.icon;
          return (
            <Card key={d.key}>
              <CardContent className="p-6">
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{d.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{d.body}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
