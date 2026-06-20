"use client";

import { Input } from "@ip/ui";
import { X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

export function addSkill(skills: string[], raw: string): string[] {
  const v = raw.trim();
  if (!v || skills.includes(v)) return skills;
  return [...skills, v];
}

export function removeSkill(skills: string[], value: string): string[] {
  return skills.filter((s) => s !== value);
}

/** Controlled skill editor: chips with remove, plus an input that commits on Enter/comma.
 * Parent owns the `string[]` (the same array updateProfile takes). */
export function SkillChips({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const next = addSkill(value, draft);
    if (next !== value) onChange(next);
    setDraft("");
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-md bg-surface-muted py-1 pl-2.5 pr-1 text-xs font-medium text-foreground"
            >
              {s}
              <button
                type="button"
                aria-label={`Remove ${s}`}
                onClick={() => onChange(removeSkill(value, s))}
                className="rounded-sm p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        placeholder="Add a skill and press Enter"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={commit}
        aria-label="Add a skill"
      />
    </div>
  );
}
