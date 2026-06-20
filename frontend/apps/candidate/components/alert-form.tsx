"use client";

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ip/ui";
import { useState } from "react";

import type { AlertFrequency, CreateAlertInput } from "../app/alerts/types";

const REMOTE = ["remote", "hybrid", "onsite"] as const;

/** Controlled create form. Reports a CreateAlertInput up; the page owns the mutation. */
export function AlertForm({
  onCreate,
  pending,
}: {
  onCreate: (input: CreateAlertInput) => void;
  pending: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [remote, setRemote] = useState<string>("");
  const [frequency, setFrequency] = useState<AlertFrequency>("daily");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onCreate({
      keyword: keyword.trim(),
      filters: remote ? { remoteMode: remote as (typeof REMOTE)[number] } : {},
      frequency,
    });
    setKeyword("");
    setRemote("");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Keyword</span>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g. frontend engineer"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Remote</span>
        <Select value={remote} onValueChange={setRemote}>
          <SelectTrigger className="w-36" aria-label="Remote">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            {REMOTE.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Frequency</span>
        <Select value={frequency} onValueChange={(v) => setFrequency(v as AlertFrequency)}>
          <SelectTrigger className="w-32" aria-label="Frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <Button type="submit" loading={pending} disabled={pending}>
        Create alert
      </Button>
    </form>
  );
}
