"use client";

import { Dialog, DialogContent, DialogTitle, cn } from "@ip/ui";
import { CornerDownLeft, type LucideIcon, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export type CommandNavTarget = { href: string; label: string; icon: LucideIcon };

/** ⌘K command palette over the shell's nav + the topbar job search. Built on the shared
 *  Dialog primitive (Radix handles focus-trap + Escape). The shell owns open state and the
 *  global keydown listener; this component owns the query, the filtered list, and keyboard
 *  navigation within the list. */
export function CommandPalette({
  open,
  onOpenChange,
  nav,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  nav: CommandNavTarget[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the query + cursor each time the palette opens so it never reopens mid-search.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const trimmed = query.trim();
  const navMatches = useMemo(() => {
    const q = trimmed.toLowerCase();
    return q ? nav.filter((n) => n.label.toLowerCase().includes(q)) : nav;
  }, [nav, trimmed]);

  // The job-search action only appears once the user has typed something to search for.
  const items: Array<
    | { kind: "nav"; href: string; label: string; icon: LucideIcon }
    | { kind: "search"; label: string }
  > = [
    ...navMatches.map((n) => ({ kind: "nav" as const, ...n })),
    ...(trimmed ? [{ kind: "search" as const, label: `Search jobs for "${trimmed}"` }] : []),
  ];

  // Keep the cursor in range as the filtered list shrinks/grows.
  useEffect(() => {
    setActive((i) => (items.length === 0 ? 0 : Math.min(i, items.length - 1)));
  }, [items.length]);

  function run(index: number) {
    const item = items[index];
    if (!item) return;
    onOpenChange(false);
    if (item.kind === "search")
      router.push(`/jobs?q=${encodeURIComponent(trimmed)}`);
    else router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(active);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="top-[20%] max-w-lg translate-y-0 gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(e) => {
          // Focus the search input rather than the first item.
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-list"
            aria-label="Search commands and jobs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page or search jobs…"
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <ul
          id="command-palette-list"
          role="listbox"
          aria-label="Results"
          className="max-h-80 overflow-y-auto p-2"
        >
          {items.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matches.
            </li>
          )}
          {items.map((item, i) => {
            const selected = i === active;
            return (
              <li key={item.kind === "nav" ? item.href : "search"} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => run(i)}
                  onMouseMove={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                    selected
                      ? "bg-surface-muted text-foreground"
                      : "text-muted-foreground hover:bg-surface-muted/60",
                  )}
                >
                  {item.kind === "nav" ? (
                    <item.icon className="size-4 shrink-0" aria-hidden />
                  ) : (
                    <Search className="size-4 shrink-0" aria-hidden />
                  )}
                  <span className="flex-1 truncate">{item.label}</span>
                  {selected && (
                    <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
