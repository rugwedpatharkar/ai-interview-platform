"use client";

import {
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
import {
  Bell,
  Bookmark,
  Briefcase,
  LayoutGrid,
  LogOut,
  type LucideIcon,
  Mail,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
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

type NavEntry = { href: string; label: string; icon: LucideIcon };

const NAV_FOR_YOU: NavEntry[] = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

const NAV_PREPARE: NavEntry[] = [
  { href: "/practice", label: "Practice", icon: Sparkles },
  { href: "/messages", label: "Messages", icon: Mail },
  { href: "/account", label: "Settings", icon: Settings },
];

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: NavEntry & { active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground",
        active && "bg-surface-muted font-medium text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <Badge tone="info" className="min-w-4 px-1 text-[10px]">
          {badge > 9 ? "9+" : badge}
        </Badge>
      )}
    </Link>
  );
}

/** Shared signed-in chrome for the candidate app: Midnight sidebar + topbar shell,
 * active-state nav, theme toggle, notifications, and a user menu. */
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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[248px_1fr]">
      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-1 border-r border-border bg-surface px-4 py-5 lg:flex">
        <Link
          href="/"
          className="mb-4 flex items-center gap-2 px-2 font-display text-lg font-semibold tracking-tight text-foreground"
        >
          <span className="text-primary" aria-hidden>
            ◐
          </span>
          Aptura
        </Link>

        <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          For you
        </p>
        {NAV_FOR_YOU.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Prepare
        </p>
        {NAV_PREPARE.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={isActive(item.href)}
            badge={item.href === "/messages" ? totalUnread : undefined}
          />
        ))}

        <div className="mt-auto flex items-center gap-3 border-t border-border px-2 pt-4">
          <Avatar name={label} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{label}</p>
            {identity?.role && (
              <p className="truncate text-xs capitalize text-muted-foreground">
                {identity.role}
              </p>
            )}
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
            <span className="text-primary" aria-hidden>
              ◐
            </span>
            Aptura
          </Link>
          <div className="hidden text-sm text-muted-foreground lg:block">
            <span className="font-medium text-foreground">Home</span> / Dashboard
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-sm text-muted-foreground sm:flex">
              <Search className="size-4" aria-hidden />
              <input
                placeholder="Search jobs & companies"
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
          </div>
        </header>

        {/* Mobile nav row — sidebar is hidden < lg, so surface the key links here. */}
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-border bg-surface px-4 py-2 text-sm text-muted-foreground lg:hidden">
          {[...NAV_FOR_YOU, ...NAV_PREPARE].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 transition-colors hover:bg-surface-muted hover:text-foreground",
                isActive(item.href) && "bg-surface-muted font-medium text-foreground",
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
