"use client";

import { PageHeader, toast } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CompanyShell } from "../../../components/company-shell";
import { JobForm } from "../../../components/job-form";
import type { JobFormValues } from "../job-form-types";
import { useAuth } from "../../../lib/auth";

export default function NewJobPage() {
  const { api } = useAuth();
  const router = useRouter();
  // `jdText` is lifted here so the AI-improved draft flows back into JobForm's textarea.
  const [jdText, setJdText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // The marketplace fields (city/remote/salary/skills/gate_mode) aren't in the proto yet,
  // so the form gathers them behind a typed shape but the submit only sends the fields the
  // current `createJob` accepts; `toCreateRequest` is ready to wire the rest when it lands.
  const create = useMutation({
    mutationFn: (values: JobFormValues) =>
      api.jobs.createJob({ title: values.title.trim(), jdText: values.jdText }),
    onSuccess: (res) => {
      toast.success("Job created");
      router.push(`/jobs/${res.jobId}`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const improve = useMutation({
    mutationFn: (brief: string) => api.jd.improveJd({ brief }),
    onSuccess: (draft) => {
      setJdText(draft.jdText);
      setSuggestions(draft.suggestions);
      toast.success("Draft improved");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <CompanyShell>
      <PageHeader
        title="Create a job"
        description="Post a role — the AI uses the description to build the aptitude test and interview."
      />
      <JobForm
        submitting={create.isPending}
        onSubmit={(v) => create.mutate(v)}
        jdText={jdText}
        onJdChange={setJdText}
        improving={improve.isPending}
        suggestions={suggestions}
        onImprove={(brief) => improve.mutate(brief)}
      />
    </CompanyShell>
  );
}
