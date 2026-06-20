"use client";

import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Logo,
  type SidebarNavEntry,
  SidebarShell,
  ThemeToggle,
  sidebarMobileLinkClass,
  sidebarNavItemClass,
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
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { useAuth } from "../lib/auth";
import { NotificationBell } from "./notification-bell";
import { OfflineBanner } from "./offline-banner";

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

/** Shared signed-in chrome for the company app: Midnight sidebar + topbar shell,
 * active-state nav, theme toggle, notifications, and a user menu. Auth + role gating
 * (recruiter / company_admin) is enforced here before any recruiter page renders. */
export function CompanyShell({ children }: { children: ReactNode }) {
  const { token, identity, logout, ready } = useAuth();
  useRequireAuth(token, ready);
  useRequireRole(identity?.role, MANAGER_ROLES, ready);
  const pathname = usePathname();
  const router = useRouter();
  const [search, setSearch] = useState("");

  if (!token) return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const roleLabel = identity ? ROLE_LABELS[identity.role] ?? identity.role : "";
  // The session JWT carries only id/role/compId — no email — so we surface the
  // role and a short user handle rather than an address we don't have.
  const handle = identity ? identity.id.slice(0, 12) : "Account";

  const isAdmin = identity?.role === "company_admin";
  const workspace = NAV_WORKSPACE.filter((item) => !item.adminOnly || isAdmin);

  const entry = (item: NavEntry): SidebarNavEntry => ({
    href: item.href,
    label: item.label,
    icon: item.icon,
    active: isActive(item.href),
  });

  const navGroups = [
    { title: "Hiring", items: NAV_HIRING.map(entry) },
    { title: "Workspace", items: workspace.map(entry) },
  ];

  const renderNavItem = ({ href, label, icon: Icon, active }: SidebarNavEntry) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={sidebarNavItemClass(active, "border")}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{label}</span>
    </Link>
  );

  const renderMobileLink = ({ href, label, active }: SidebarNavEntry) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={sidebarMobileLinkClass(active, "border")}
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
          <Avatar name={roleLabel || handle} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{roleLabel || handle}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{handle}…</p>
          </div>
        </>
      }
      topbar={
        <>
          <OfflineBanner />
          <div className="hidden text-sm text-muted-foreground lg:block">
            <span className="font-medium text-foreground">Recruiter</span> / Workspace
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
                placeholder="Search applicants"
                className="w-40 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </form>
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
        </>
      }
    >
      {children}
    </SidebarShell>
  );
}
