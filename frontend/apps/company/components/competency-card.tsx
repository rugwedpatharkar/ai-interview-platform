import { Card, CardContent } from "@ip/ui";

import type { Competency } from "../app/jobs/[id]/applicants/[appId]/types";
import { ScoreRing } from "./score-ring";

const tone = (s: number) => (s >= 0.75 ? "success" : s >= 0.5 ? "warning" : "danger");

export function CompetencyCard({ c }: { c: Competency }) {
  return (
    <Card>
      <CardContent className="flex gap-4 p-4">
        <ScoreRing value={c.score} size={64} stroke={6} tone={tone(c.score)} />
        <div className="min-w-0 flex-1">
          <h4 className="font-display text-sm font-medium text-foreground">
            {c.competency}
          </h4>
          {c.rationale && (
            <p className="mt-0.5 text-sm text-muted-foreground">{c.rationale}</p>
          )}
          {c.evidence.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {c.evidence.map((e, i) => (
                <li key={i} className="border-l-2 border-border pl-3">
                  <p className="text-sm italic text-foreground">“{e.quote}”</p>
                  {e.note && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{e.note}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
