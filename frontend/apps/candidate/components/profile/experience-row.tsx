"use client";

import { Button, Input, Textarea } from "@ip/ui";
import { Trash2 } from "lucide-react";

export interface ExperienceValue {
  company: string;
  title: string;
  summary: string;
}

/** One experience entry editor — the company/title inputs + summary textarea + remove,
 * extracted verbatim from the page's inline fieldset. Holds no logic: the page owns the
 * `experience` array and maps onChange(patch)/onRemove() back into it. */
export function ExperienceRow({
  index,
  value,
  onChange,
  onRemove,
}: {
  index: number;
  value: ExperienceValue;
  onChange: (patch: Partial<ExperienceValue>) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        Experience {index + 1}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          aria-label="Company"
          placeholder="Company"
          value={value.company}
          onChange={(e) => onChange({ company: e.target.value })}
        />
        <Input
          aria-label="Job title"
          placeholder="Title"
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </div>
      <Textarea
        aria-label="What you did"
        placeholder="What you did"
        value={value.summary}
        onChange={(e) => onChange({ summary: e.target.value })}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        leadingIcon={Trash2}
        className="self-end text-danger hover:text-danger"
        onClick={onRemove}
      >
        Remove
      </Button>
    </fieldset>
  );
}
