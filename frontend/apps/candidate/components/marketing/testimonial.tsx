import { Star } from "lucide-react";
import { Card, CardContent } from "@ip/ui";
import { TESTIMONIALS } from "../../app/(marketing)/content";

export function Testimonial() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid gap-6 md:grid-cols-2">
        {TESTIMONIALS.map((t) => (
          <Card key={t.name}>
            <CardContent className="p-6">
              <div className="flex gap-0.5 text-amber-500" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-4 fill-current" />
                ))}
              </div>
              <p className="mt-3 text-foreground">“{t.body}”</p>
              <p className="mt-4 text-sm font-medium text-foreground">{t.name}</p>
              <p className="text-sm text-muted-foreground">{t.role}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
