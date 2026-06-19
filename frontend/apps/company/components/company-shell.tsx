"use client";

import {
  Avatar,
  AppShell,
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
import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useAuth } from "../lib/auth";

const MANAGER_ROLES = ["company_admin", "recruiter"];

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Company admin",
  recruiter: "Recruiter",
};

type NavLink = { href: string; label: string };

const NAV: NavLink[] = [
  { href: "/jobs", label: "Jobs" },
  { href: "/branding", label: "Branding" },
  { href: "/rubrics", label: "Rubrics" },
  { href: "/analytics", label: "Analytics" },
  { href: "/talent", label: "Talent" },
];

function NavItem({ href, label, active }: NavLink & { active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        active && "bg-surface-muted font-medium text-foreground",
      )}
    >
      {label}
    </Link>
  );
}

export function CompanyShell({ children }: { children: ReactNode }) {
  const { token, identity, logout, ready } = useAuth();
  useRequireAuth(token, ready);
  useRequireRole(identity?.role, MANAGER_ROLES, ready);
  const pathname = usePathname();

  if (!token) return null;

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const roleLabel = identity ? ROLE_LABELS[identity.role] ?? identity.role : "";
  // The session JWT carries only id/role/compId — no email — so we surface the
  // role and a short user handle rather than an address we don't have.
  const handle = identity ? identity.id.slice(0, 12) : "Account";

  return (
    <AppShell
      title="Recruiter · Interview Platform"
      nav={
        <>
          {NAV.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} />
          ))}
          {identity?.role === "company_admin" && (
            <NavItem href="/team" label="Team" active={isActive("/team")} />
          )}
        </>
      }
      actions={
        <>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-1.5 rounded-lg p-1 pr-2 text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Account menu"
            >
              <Avatar name={roleLabel || handle} size="sm" />
              <ChevronDown className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel className="font-normal">
                <span className="block font-medium text-foreground">{roleLabel}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {handle}…
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/account">Account settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => logout()}>
                <LogOut aria-hidden />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
