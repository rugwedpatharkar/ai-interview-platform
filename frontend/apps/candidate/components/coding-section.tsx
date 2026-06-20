"use client";

import { Alert, Badge, Button, Card, CardContent, Spinner } from "@ip/ui";
import { Check, X } from "lucide-react";

import type { AssessmentSection, RunResult } from "../lib/assessment";
import { CodeEditor } from "./code-editor";

// A coding section: problem pane (prompt + visible sample tests + a "+N hidden tests" count)
// on the left, editor + Run + masked results on the right. Hidden tests are NEVER shown as
// bodies — only a count pre-run and a `hiddenPassed/hiddenTotal` aggregate post-run (the
// anti-cheat invariant; `RunResult` has no hidden-body field).
export interface CodingSectionProps {
  section: AssessmentSection;
  index: number;
  total: number;
  source: string;
  onSource: (v: string) => void;
  onRun: () => void;
  running: boolean;
  result?: RunResult;
  error?: string;
  timeLeft?: string; // mm:ss countdown (advisory)
}

export function CodingSection({
  section,
  index,
  total,
  source,
  onSource,
  onRun,
  running,
  result,
  error,
  timeLeft,
}: CodingSectionProps) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4 lg:grid lg:grid-cols-2 lg:gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-foreground">
              <span className="text-muted-foreground">
                Question {index + 1} of {total}
              </span>
              <br />
              Coding task
            </h3>
            {timeLeft && (
              <Badge tone="neutral" variant="subtle" className="tabular-nums">
                {timeLeft}
              </Badge>
            )}
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {section.prompt}
          </p>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Sample tests</p>
            {(section.visibleCases ?? []).map((c, i) => (
              <div
                key={i}
                className="rounded-md bg-surface-muted px-2.5 py-1.5 font-mono text-xs text-foreground"
              >
                <span className="text-muted-foreground">in:</span> {c.stdin}{" "}
                <span className="text-muted-foreground">→ out:</span> {c.expected}
              </div>
            ))}
            {!!section.hiddenCaseCount && (
              <Badge tone="neutral" variant="subtle" className="self-start tabular-nums">
                +{section.hiddenCaseCount} hidden tests (run on submit)
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <CodeEditor
            value={source}
            language={section.language ?? "python"}
            onChange={onSource}
            disabled={running}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onRun} disabled={running}>
              {running ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Running tests…
                </span>
              ) : (
                "Run tests"
              )}
            </Button>
          </div>
          {error && (
            <Alert tone="danger">
              <span className="flex flex-col items-start gap-2">
                {error}
                <Button variant="outline" size="sm" onClick={onRun}>
                  Retry
                </Button>
              </span>
            </Alert>
          )}
          {result && (
            <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
              {!result.compileOk && (
                <Alert tone="danger">Your code didn&apos;t compile.</Alert>
              )}
              {result.cases.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {c.passed ? (
                    <Check className="size-4 text-success-foreground" aria-hidden />
                  ) : (
                    <X className="size-4 text-danger-foreground" aria-hidden />
                  )}
                  <span className="text-foreground">{c.name ?? `Case ${i + 1}`}</span>
                  <Badge tone={c.passed ? "success" : "danger"} variant="subtle">
                    {c.passed ? "passed" : "failed"}
                  </Badge>
                </div>
              ))}
              <p className="text-sm tabular-nums text-muted-foreground">
                Hidden tests: {result.hiddenPassed}/{result.hiddenTotal} passed
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
