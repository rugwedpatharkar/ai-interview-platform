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
  Logo,
  type SidebarNavEntry,
  SidebarShell,
  sidebarMobileLinkClass,
  sidebarNavItemClass,
} from "@ip/ui";

import { AppearanceToggle } from "./appearance-toggle";
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
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { decodeJwtPayload } from "@ip/shared";

import { useAuth } from "../lib/auth";
import { CommandPalette } from "./command-palette";
import { NotificationBell } from "./notification-bell";
import { OfflineBanner } from "./offline-banner";
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
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Shared signed-in chrome for the candidate app: Midnight sidebar + topbar shell,
 * active-state nav, theme toggle, notifications, and a user menu. */
export function CandidateShell({ children }: { children: ReactNode }) {
  const { api, token, identity, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  // Global ⌘K / Ctrl-K opens the command palette. ⌘K wins even from inside an input;
  // bare keys are ignored while typing so the palette never hijacks normal entry.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const entry = (item: NavEntry): SidebarNavEntry => ({
    ...item,
    active: isActive(item.href),
    badge: item.href === "/messages" ? totalUnread : undefined,
  });

  const navGroups = [
    { title: "For you", items: NAV_FOR_YOU.map(entry) },
    { title: "Prepare", items: NAV_PREPARE.map(entry) },
  ];

  const renderNavItem = ({ href, label, icon: Icon, active, badge }: SidebarNavEntry) => (
    <Link key={href} href={href} aria-current={active ? "page" : undefined} className={sidebarNavItemClass(active)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <Badge tone="info" className="min-w-4 px-1 text-[10px]">
          {badge > 9 ? "9+" : badge}
        </Badge>
      )}
    </Link>
  );

  const renderMobileLink = ({ href, label, active }: SidebarNavEntry) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={sidebarMobileLinkClass(active)}
    >
      {label}
    </Link>
  );

  return (
    <SidebarShell
      navGroups={navGroups}
      renderNavItem={renderNavItem}
      renderMobileLink={renderMobileLink}
      brand={
        <Link href="/" aria-label="Aptura home" className="mb-4 flex px-2">
          <Logo size="md" />
        </Link>
      }
      mobileBrand={
        <Link href="/" aria-label="Aptura home" className="flex lg:hidden">
          <Logo size="sm" />
        </Link>
      }
      sidebarFooter={
        <>
          <Avatar name={label} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{label}</p>
            {identity?.role && (
              <p className="truncate text-xs capitalize text-muted-foreground">
                {identity.role}
              </p>
            )}
          </div>
        </>
      }
      topbar={
        <>
          <OfflineBanner />
          <div className="hidden text-sm text-muted-foreground lg:block">
            <span className="font-medium text-foreground">Home</span> / Dashboard
          </div>

          <div className="flex items-center gap-2">
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                const q = search.trim();
                router.push(q ? `/jobs?q=${encodeURIComponent(q)}` : "/jobs");
              }}
              className="hidden items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-sm text-muted-foreground focus-within:ring-2 focus-within:ring-ring sm:flex"
            >
              <Search className="size-4" aria-hidden />
              <input
                type="search"
                aria-label="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search jobs & companies"
                className="w-40 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </form>
            <AppearanceToggle />
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
        </>
      }
    >
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        nav={[...NAV_FOR_YOU, ...NAV_PREPARE]}
      />
      {children}
    </SidebarShell>
  );
}
