import { Badge } from "@ip/ui";
import { VALUE_PILLS } from "../../app/(marketing)/content";

export function ValuePills() {
  return (
    <section className="border-y border-border bg-surface">
      <div className="mx-auto max-w-4xl px-6 py-14 text-center">
        <h2 className="font-display text-xl font-semibold text-foreground">Built to be trusted.</h2>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {VALUE_PILLS.map((p) => (
            <Badge key={p} variant="outline">
              {p}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
