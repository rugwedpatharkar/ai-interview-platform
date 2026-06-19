"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  Textarea,
  toast,
} from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState } from "react";

import { CompanyShell } from "../../../components/company-shell";
import { jd as jdClient, useAuth } from "../../../lib/auth";

export default function NewJobPage() {
  const { api } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [jdText, setJdText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [titleError, setTitleError] = useState<string | null>(null);
  // Synchronous latch: a form can fire submit twice (Enter + click, double-click) before
  // React re-renders the pending state, so guard the handler itself, not just the button.
  const submitting = useRef(false);

  const create = useMutation({
    mutationFn: () => api.jobs.createJob({ title: title.trim(), jdText }),
    onSuccess: (res) => {
      toast.success("Job created");
      router.push(`/jobs/${res.jobId}`);
    },
    onError: (err) => {
      submitting.current = false;
      toast.error(errorMessage(err));
    },
  });

  const improve = useMutation({
    mutationFn: () => jdClient.improve(jdText),
    onSuccess: (draft) => {
      setJdText(draft.jd_text);
      setSuggestions(draft.suggestions);
      toast.success("Draft improved");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setTitleError("Job title is required.");
      return;
    }
    setTitleError(null);
    if (submitting.current) return;
    submitting.current = true;
    create.mutate();
  }

  return (
    <CompanyShell>
      <PageHeader
        title="Create a job"
        description="Post a role — the AI uses the description to build the aptitude test and interview."
      />
      <Card>
        <CardHeader>
          <CardTitle>Role details</CardTitle>
          <CardDescription>
            Give the role a title and a description candidates will see.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <Field label="Title" htmlFor="title" error={titleError}>
              <Input
                id="title"
                required
                value={title}
                aria-invalid={Boolean(titleError) || undefined}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleError) setTitleError(null);
                }}
              />
            </Field>
            <Field label="Job description" htmlFor="jd">
              <Textarea
                id="jd"
                rows={8}
                placeholder="Role, responsibilities, and requirements — the AI uses this to build the aptitude test and interview."
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
              />
            </Field>
            <div className="flex flex-col gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                leadingIcon={Sparkles}
                loading={improve.isPending}
                disabled={!jdText.trim() || improve.isPending}
                onClick={() => improve.mutate()}
              >
                Improve with AI
              </Button>
              <span className="text-xs text-muted-foreground">
                Polish the description with AI before posting.
              </span>
            </div>
            {suggestions.length > 0 && (
              <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm">
                <p className="font-medium text-foreground">Suggestions</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {suggestions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            <Button
              type="submit"
              className="self-start"
              loading={create.isPending}
              disabled={!title.trim() || create.isPending}
            >
              Create job
            </Button>
          </form>
        </CardContent>
      </Card>
    </CompanyShell>
  );
}
