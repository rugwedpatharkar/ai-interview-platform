"use client";

import { cn } from "@ip/ui";

// Controlled code editor behind a stable `{value, language, onChange, disabled}` seam.
//
// This round it renders a controlled monospace <textarea> — always functional, SSR-safe, and
// dependency-free (no CDN CodeMirror, which would need a browser + bundler story out of scope
// here). The seam is the SWAP POINT: replacing the textarea with a bundled/CDN CodeMirror 6
// editor changes ONLY this file — the page, data flow, and grader are untouched.
//
// DEFERRED FOLLOW-UP: mount CodeMirror 6 here (client-only, in a useEffect) for syntax
// highlighting, keeping the same controlled props. Tab-to-indent is intentionally NOT trapped
// (that would be an a11y regression). Dark/violet theming comes from the token classes below.
export interface CodeEditorProps {
  value: string;
  language: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}

export function CodeEditor({
  value,
  language,
  onChange,
  disabled,
  className,
}: CodeEditorProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface-muted",
        className,
      )}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        rows={14}
        aria-label={`Code answer (${language})`}
        className="block w-full resize-y bg-transparent p-3 font-mono text-sm text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}
