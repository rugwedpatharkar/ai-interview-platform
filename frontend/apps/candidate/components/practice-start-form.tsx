"use client";

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";

import { practiceClient } from "../lib/practice-client";
import type { PracticeStartResult } from "../app/practice/types";

/** Start a detached mock interview from a topic OR a pasted JD (exactly one). Private framing is
 *  first-class: practice is never shared with an employer, and the form carries no
 *  comp_id/job_id — it cannot attach to an application. */
export function PracticeStartForm({
  onStarted,
}: {
  onStarted: (res: PracticeStartResult) => void;
}) {
  const [mode, setMode] = useState<"topic" | "jd">("topic");
  const [topic, setTopic] = useState("");
  const [jdText, setJdText] = useState("");
  // Synchronous latch (same as the dashboard apply): blocks a same-tick double-submit the
  // isPending flag's stale closure can't catch.
  const inFlight = useRef(false);

  const start = useMutation({
    // Send ONLY the active field so the server's "exactly one" contract is never violated.
    mutationFn: () =>
      practiceClient.start(
        mode === "topic" ? { topic: topic.trim() } : { jd_text: jdText.trim() },
      ),
    onSuccess: (res) => onStarted(res),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const ready = mode === "topic" ? topic.trim().length > 0 : jdText.trim().length > 0;

  function submit() {
    if (inFlight.current || !ready) return;
    inFlight.current = true;
    start.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" aria-hidden />
          Practice interview
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert tone="info" title="Private to you">
          Practice is just for you — it&apos;s never shared with any employer or recruiter,
          and there&apos;s no pass or fail. It&apos;s here to help you grow.
        </Alert>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "topic" | "jd")}>
          <TabsList aria-label="Practice source">
            <TabsTrigger value="topic">By topic</TabsTrigger>
            <TabsTrigger value="jd">Paste a job description</TabsTrigger>
          </TabsList>
          <TabsContent value="topic">
            <Field
              label="Role or topic"
              htmlFor="practice-topic"
              hint="e.g. Senior Backend Engineer — Python, or System Design"
            >
              <Input
                id="practice-topic"
                value={topic}
                disabled={start.isPending}
                placeholder="Senior Backend Engineer"
                onChange={(e) => setTopic(e.target.value)}
              />
            </Field>
          </TabsContent>
          <TabsContent value="jd">
            <Field label="Paste a job description" htmlFor="practice-jd">
              <Textarea
                id="practice-jd"
                rows={8}
                value={jdText}
                disabled={start.isPending}
                placeholder="Paste the full job description to practice against…"
                onChange={(e) => setJdText(e.target.value)}
              />
            </Field>
          </TabsContent>
        </Tabs>

        {start.isError && (
          <Alert tone="danger" title="Couldn’t start practice">
            <span className="flex flex-col items-start gap-2">
              {errorMessage(start.error)}
              <Button variant="outline" size="sm" onClick={submit}>
                Retry
              </Button>
            </span>
          </Alert>
        )}

        <Button
          leadingIcon={Sparkles}
          loading={start.isPending}
          disabled={!ready}
          onClick={submit}
          className="self-start"
        >
          {start.isPending ? "Starting…" : "Start practice"}
        </Button>
      </CardContent>
    </Card>
  );
}
