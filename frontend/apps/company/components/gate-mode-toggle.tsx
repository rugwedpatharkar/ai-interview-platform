"use client";

import { Field, RadioGroup, RadioGroupItem } from "@ip/ui";

import type { GateMode } from "../app/jobs/job-form-types";

const OPTIONS: { value: GateMode; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Auto-gate",
    hint: "High-severity integrity signals end the interview automatically.",
  },
  {
    value: "advisory",
    label: "Advisory",
    hint: "Integrity is surfaced to you — never auto-ends the interview.",
  },
];

// `@ip/ui` has no Switch, so this two-option integrity control is built from RadioGroup
// (accessible, keyboard-navigable, single-select).
export function GateModeToggle({
  value,
  onChange,
}: {
  value: GateMode;
  onChange: (v: GateMode) => void;
}) {
  return (
    <Field label="Integrity gate">
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as GateMode)}
        className="grid gap-2 sm:grid-cols-2"
      >
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface-muted p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <RadioGroupItem value={o.value} className="mt-0.5" />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </Field>
  );
}
