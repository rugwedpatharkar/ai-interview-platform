"use client";

import {
  AppShell,
  Avatar,
  Badge,
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
import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { decodeJwtPayload } from "@ip/shared";

import { useAuth } from "../lib/auth";
import { NotificationBell } from "./notification-bell";
import {
  USE_MOCK,
  createMessagesClient,
  listQueryKey,
  makeMockMessagesClient,
} from "../app/messages/messages-client";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/practice", label: "Practice" },
  { href: "/messages", label: "Messages" },
  { href: "/saved", label: "Saved" },
  { href: "/alerts", label: "Alerts" },
  { href: "/profile", label: "Profile" },
  { href: "/account", label: "Account" },
] as const;

function NavLink({
  href,
  label,
  active,
  badge,
}: {
  href: string;
  label: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center gap-1.5",
        active && "bg-surface-muted font-medium text-foreground",
      )}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <Badge tone="info" className="min-w-4 px-1 text-[10px]">
          {badge > 9 ? "9+" : badge}
        </Badge>
      )}
    </Link>
  );
}

/** Shared signed-in chrome for the candidate app: branded shell, active-state nav,
 * theme toggle, and a user menu (email + role + Logout). */
export function CandidateShell({ children }: { children: ReactNode }) {
  const { api, token, identity, logout } = useAuth();
  const pathname = usePathname();
  const email = token ? (decodeJwtPayload(token)?.email as string | undefined) ?? null : null;
  const label = email ?? identity?.id ?? "Account";

  // Total-unread badge for the Messages nav entry. Resilient by design — on error the badge
  // simply doesn't render (the shell must never throw).
  const messages = useMemo(
    () => (USE_MOCK ? makeMockMessagesClient("a1", "candidate") : createMessagesClient(api)),
    [api],
  );
  const unread = useQuery({
    queryKey: listQueryKey(),
    queryFn: () => messages.listThreads(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    enabled: Boolean(token),
  });
  const totalUnread = (unread.data ?? []).reduce((s, t) => s + t.unread, 0);

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
              badge={item.href === "/messages" ? totalUnread : undefined}
            />
          ))}
        </>
      }
      actions={
        <>
          <ThemeToggle />
          <NotificationBell />
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
