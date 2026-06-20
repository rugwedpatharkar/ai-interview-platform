"use client";

import {
  AlertCircle,
  Inbox,
  type LucideIcon,
  Menu,
  RefreshCw,
  X,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Logo } from "./logo.js";
import { Spinner } from "./spinner.js";

export function AppShell({
  title,
  nav,
  actions,
  children,
}: {
  title: string;
  /** Nav links (raw <a>/<Link>/<button> elements). Rendered inline on desktop
   *  and stacked in a slide-down panel on mobile. */
  nav?: ReactNode;
  /** Trailing header slot — e.g. <ThemeToggle /> and a user menu. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Logo label={title} size="md" />
          <div className="flex items-center gap-2">
            {nav && (
              <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex [&_a]:rounded-md [&_a]:px-3 [&_a]:py-1.5 [&_a]:transition-colors [&_a:hover]:bg-surface-muted [&_a:hover]:text-foreground [&_button]:rounded-md [&_button]:px-3 [&_button]:py-1.5 [&_button]:transition-colors [&_button:hover]:bg-surface-muted [&_button:hover]:text-foreground">
                {nav}
              </nav>
            )}
            {actions}
            {nav && (
              <button
                type="button"
                aria-label={open ? "Close menu" : "Open menu"}
                aria-expanded={open}
                onClick={() => setOpen((v) => !v)}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
              >
                {open ? <X className="size-4" /> : <Menu className="size-4" />}
              </button>
            )}
          </div>
        </div>
        {nav && open && (
          <nav
            className="flex flex-col gap-1 border-t border-border bg-surface px-6 py-3 text-sm text-muted-foreground md:hidden [&_a]:rounded-md [&_a]:px-3 [&_a]:py-2 [&_a:hover]:bg-surface-muted [&_a:hover]:text-foreground [&_button]:rounded-md [&_button]:px-3 [&_button]:py-2 [&_button]:text-left [&_button:hover]:bg-surface-muted [&_button:hover]:text-foreground"
            onClick={() => setOpen(false)}
          >
            {nav}
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: IconComponent = Inbox,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** lucide icon shown in the illustration circle. */
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-surface/50 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <IconComponent className="size-6" aria-hidden />
      </span>
      <p className="font-medium text-foreground">{title}</p>
      {description && (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-danger-border bg-danger-surface px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <AlertCircle className="size-6" aria-hidden />
      </span>
      <p className="text-sm text-danger-foreground">{message}</p>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-danger-foreground underline-offset-4 hover:underline"
        >
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </button>
      )}
    </div>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Spinner /> {label}
    </div>
  );
}
