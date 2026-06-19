"use client";

import {
  AppShell,
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
import { LogOut, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useAuth } from "../lib/auth";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
  { href: "/account", label: "Account" },
] as const;

/** Read the email claim straight off the JWT. The shared `decodeIdentity` only surfaces
 * id/role/comp_id, so the user-menu email is decoded here (read-only, no extra request). */
function emailFromToken(token: string | null): string | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(active && "bg-surface-muted font-medium text-foreground")}
    >
      {label}
    </Link>
  );
}

/** Shared signed-in chrome for the candidate app: branded shell, active-state nav,
 * theme toggle, and a user menu (email + role + Logout). */
export function CandidateShell({ children }: { children: ReactNode }) {
  const { token, identity, logout } = useAuth();
  const pathname = usePathname();
  const email = emailFromToken(token);
  const label = email ?? identity?.id ?? "Account";

  return (
    <AppShell
      title="Interview Platform"
      nav={
        <>
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href)
              }
            />
          ))}
        </>
      }
      actions={
        <>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Account menu"
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Avatar name={label} size="sm" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {label}
                </span>
                {identity?.role && (
                  <span className="inline-flex items-center gap-1 text-xs capitalize text-muted-foreground">
                    <ShieldCheck className="size-3" aria-hidden />
                    {identity.role}
                  </span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <User aria-hidden />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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
