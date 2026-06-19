import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, buttonVariants, cn } from "@ip/ui";
import { FEATURES } from "../../app/(marketing)/content";

export function FeatureColumns() {
  return (
    <section className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-20 md:grid-cols-2">
        {FEATURES.map((col) => {
          const Icon = col.icon;
          const external = col.cta.href.startsWith("http");
          return (
            <Card key={col.audience}>
              <CardContent className="flex h-full flex-col p-6">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="font-display text-xl font-semibold text-foreground">{col.title}</h3>
                </div>
                <ul className="mt-5 flex-1 space-y-3">
                  {col.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                {external ? (
                  <a href={col.cta.href} className={cn(buttonVariants({ variant: "outline" }), "mt-6 self-start")}>
                    {col.cta.label}
                  </a>
                ) : (
                  <a href={col.cta.href} className={cn(buttonVariants(), "mt-6 self-start")}>
                    {col.cta.label}
                  </a>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
