"use client";

import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ThemeToggle,
  cn,
} from "@ip/ui";
import { useRequireAuth, useRequireRole } from "@ip/shared";
import {
  BarChart3,
  Briefcase,
  LayoutGrid,
  ListChecks,
  LogOut,
  type LucideIcon,
  Mail,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useAuth } from "../lib/auth";
import { NotificationBell } from "./notification-bell";

const MANAGER_ROLES = ["company_admin", "recruiter"];

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company admin",
  recruiter: "Recruiter",
};

type NavEntry = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean };

const NAV_HIRING: NavEntry[] = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/jobs", label: "Jobs & applicants", icon: Briefcase },
  { href: "/talent", label: "Talent search", icon: Search },
  { href: "/branding", label: "Branding", icon: Sparkles },
  { href: "/rubrics", label: "Rubrics", icon: ListChecks },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const NAV_WORKSPACE: NavEntry[] = [
  { href: "/messages", label: "Messages", icon: Mail },
  { href: "/team", label: "Team", icon: Users, adminOnly: true },
  { href: "/account", label: "Settings", icon: Settings },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: NavEntry & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-surface-muted hover:text-foreground active:scale-[0.99]",
        active && "border-l-2 border-primary bg-surface-muted font-medium text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{label}</span>
    </Link>
  );
}

/** Shared signed-in chrome for the company app: Midnight sidebar + topbar shell,
 * active-state nav, theme toggle, notifications, and a user menu. Auth + role gating
 * (recruiter / company_admin) is enforced here before any recruiter page renders. */
export function CompanyShell({ children }: { children: ReactNode }) {
  const { token, identity, logout, ready } = useAuth();
  useRequireAuth(token, ready);
  useRequireRole(identity?.role, MANAGER_ROLES, ready);
  const pathname = usePathname();

  if (!token) return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const roleLabel = identity ? ROLE_LABELS[identity.role] ?? identity.role : "";
  // The session JWT carries only id/role/compId — no email — so we surface the
  // role and a short user handle rather than an address we don't have.
  const handle = identity ? identity.id.slice(0, 12) : "Account";

  const isAdmin = identity?.role === "company_admin";
  const workspace = NAV_WORKSPACE.filter((item) => !item.adminOnly || isAdmin);
  const mobileNav = [...NAV_HIRING, ...workspace];

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_1fr]">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-1 border-r border-border bg-surface px-4 py-5 lg:flex">
        <Link
          href="/"
          className="mb-4 flex items-center gap-2 px-2 font-display text-lg font-semibold tracking-tight text-foreground"
        >
          <span
            className="inline-flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"
            aria-hidden
          >
            ◐
          </span>
          Aptura
        </Link>

        <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Hiring
        </p>
        {NAV_HIRING.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        {workspace.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        <div className="mt-auto flex items-center gap-3 border-t border-border px-2 pt-4">
          <Avatar name={roleLabel || handle} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{roleLabel || handle}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{handle}…</p>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-border bg-surface/80 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
          {/* Brand shows on mobile where the sidebar is hidden; crumb on desktop. */}
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-foreground lg:hidden"
          >
            <span
              className="inline-flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground"
              aria-hidden
            >
              ◐
            </span>
            Aptura
          </Link>
          <div className="hidden text-sm text-muted-foreground lg:block">
            <span className="font-medium text-foreground">Recruiter</span> / Workspace
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-sm text-muted-foreground sm:flex">
              <Search className="size-4" aria-hidden />
              <input
                placeholder="Search applicants"
                className="w-40 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
            <ThemeToggle />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Account menu"
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Avatar name={roleLabel || handle} size="sm" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">{roleLabel}</span>
                  <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
                    <ShieldCheck className="size-3" aria-hidden />
                    {handle}…
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/account">Account settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout()}>
                  <LogOut aria-hidden />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Mobile nav row — sidebar is hidden < lg, so surface the key links here. */}
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-4 py-2 text-sm text-muted-foreground lg:hidden">
          {mobileNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 transition-colors duration-150 hover:bg-surface-muted hover:text-foreground active:scale-[0.99]",
                isActive(item.href) &&
                  "border-l-2 border-primary bg-surface-muted font-medium text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
