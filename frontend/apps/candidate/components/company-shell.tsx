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

import {
  BarChart3,
  Briefcase,
  Building2,
  ClipboardList,
  CreditCard,
  type LucideIcon,
  History,
  LayoutGrid,
  LogOut,
  Mail,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import { decodeJwtPayload } from "@ip/shared";
import { useAuth } from "../lib/auth";

type NavEntry = { href: string; label: string; icon: LucideIcon };

const NAV_HIRING: NavEntry[] = [
  { href: "/company", label: "Dashboard", icon: LayoutGrid },
  { href: "/company/jobs", label: "Jobs", icon: Briefcase },
  { href: "/company/talent", label: "Talent", icon: Users },
  { href: "/company/analytics", label: "Analytics", icon: BarChart3 },
];

const NAV_WORKSPACE: NavEntry[] = [
  { href: "/company/messages", label: "Messages", icon: Mail },
  { href: "/company/branding", label: "Branding", icon: Building2 },
  { href: "/company/team", label: "Team", icon: Users },
  { href: "/company/rubrics", label: "Rubrics", icon: ClipboardList },
  { href: "/company/audit", label: "Audit log", icon: History },
  { href: "/company/billing", label: "Billing", icon: CreditCard },
  { href: "/company/settings", label: "Settings", icon: Settings },
];

/** Shared signed-in chrome for company surfaces — sidebar + topbar; matches CandidateShell. */
export function CompanyShell({ children }: { children: ReactNode }) {
  const { token, identity, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const email = token
    ? ((decodeJwtPayload(token)?.email as string | undefined) ?? null)
    : null;
  const label = email ?? identity?.id ?? "Account";

  // SidebarShell expects { title, items } (see packages/ui/app-shell.tsx).
  const navGroups = useMemo<{ title: string; items: SidebarNavEntry[] }[]>(
    () => [
      {
        title: "Hiring",
        items: NAV_HIRING.map((entry) => ({
          ...entry,
          active: isActive(pathname, entry.href, entry.href === "/company"),
        })),
      },
      {
        title: "Workspace",
        items: NAV_WORKSPACE.map((entry) => ({
          ...entry,
          active: isActive(pathname, entry.href),
        })),
      },
    ],
    [pathname],
  );

  const renderNavItem = ({ href, label: navLabel, icon: Icon, active, badge }: SidebarNavEntry) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={sidebarNavItemClass(active, "border")}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{navLabel}</span>
      {badge !== undefined && badge > 0 && (
        <Badge tone="info" className="min-w-4 px-1 text-[10px]">
          {badge > 9 ? "9+" : badge}
        </Badge>
      )}
    </Link>
  );

  const renderMobileLink = ({ href, label: navLabel, active }: SidebarNavEntry) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className={sidebarMobileLinkClass(active, "border")}
    >
      {navLabel}
    </Link>
  );

  return (
    <SidebarShell
      navGroups={navGroups}
      renderNavItem={renderNavItem}
      renderMobileLink={renderMobileLink}
      brand={
        <Link href="/company" className="mb-4 flex items-center gap-2 px-2">
          <Logo size="md" />
          <span className="text-xs font-medium text-muted-foreground">for companies</span>
        </Link>
      }
      mobileBrand={
        <Link href="/company" aria-label="Aptura company home" className="flex lg:hidden">
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
                {identity.role.replace(/_/g, " ")}
              </p>
            )}
          </div>
        </>
      }
      topbar={
        <>
          <span className="hidden rounded-full border border-line bg-surface-2 px-3 py-1 text-[0.78rem] font-semibold text-brand-strong sm:inline">
            Pre-launch · company workspace
          </span>
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger aria-label="Account menu" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Avatar name={label} size="sm" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[200px]">
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/company/settings">Settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-danger"
                  onSelect={() => {
                    logout();
                    router.push("/login");
                  }}
                >
                  <LogOut className="mr-2 size-4" /> Sign out
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

function isActive(pathname: string | null, href: string, exact = false) {
  if (!pathname) return false;
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
