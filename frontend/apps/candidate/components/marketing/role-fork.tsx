"use client";

import { cn } from "@ip/ui";

export type Role = "seeker" | "hirer";

export function RoleFork({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  const tab = (r: Role, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={value === r}
      onClick={() => onChange(r)}
      className={cn(
        "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        value === r ? "bg-white text-brand-700" : "text-white/80 hover:text-white",
      )}
    >
      {label}
    </button>
  );
  return (
    <div
      role="tablist"
      aria-label="What brings you here"
      className="inline-flex gap-1 rounded-full bg-white/15 p-1"
    >
      {tab("seeker", "I'm looking for a job")}
      {tab("hirer", "I'm hiring")}
    </div>
  );
}
