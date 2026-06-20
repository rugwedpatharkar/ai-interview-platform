"use client";

import { Badge, Card, CardContent, CardHeader, CardTitle } from "@ip/ui";
import { CheckCircle2, Lightbulb, TrendingUp } from "lucide-react";
import Link from "next/link";

import type { PracticeFeedbackResult } from "../app/practice/types";

/** Read-only skill-gap feedback for a finished practice run. Renders ONLY growth content —
 *  strengths, areas to grow, and topics to study. There is deliberately NO hire/reject verdict,
 *  no pass/fail, and no numeric score: the server's GrowthFeedback strips any recommendation, and
 *  this is the matching visual guarantee. */
export function GrowthFeedbackPanel({ result }: { result: PracticeFeedbackResult }) {
  const { feedback, evaluation_summary } = result;
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Your growth feedback</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <p className="text-foreground">{feedback.summary}</p>
          {evaluation_summary && (
            <p className="text-sm text-muted-foreground">{evaluation_summary}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {feedback.strengths.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-4" aria-hidden />
                Strengths
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {feedback.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-success"
                      aria-hidden
                    />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {feedback.gaps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-4 text-primary" aria-hidden />
                Areas to grow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {feedback.gaps.map((g, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Badge tone="info" variant="subtle" className="shrink-0">
                      {i + 1}
                    </Badge>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {feedback.suggested_topics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="size-4 text-primary" aria-hidden />
              Topics to study next
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {feedback.suggested_topics.map((t) => (
              <Badge key={t} tone="neutral" variant="subtle">
                {t}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-4">
        <Link
          href="/practice"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Practice again
        </Link>
        <Link
          href="/"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
