import Link from "next/link";
import { Logo } from "@ip/ui";
import { COMPANY_HIRE_HREF, FOOTER_TAGLINE } from "../../app/(marketing)/content";

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">{children}</ul>
    </div>
  );
}

const linkCls = "transition-colors hover:text-foreground";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo size="lg" />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">{FOOTER_TAGLINE}</p>
          </div>
          <Column title="Candidates">
            <li>
              <Link href="/jobs" className={linkCls}>
                Find jobs
              </Link>
            </li>
            <li>
              <Link href="/login" className={linkCls}>
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/register" className={linkCls}>
                Create account
              </Link>
            </li>
          </Column>
          <Column title="Companies">
            <li>
              <a href={COMPANY_HIRE_HREF} className={linkCls}>
                Post a job
              </a>
            </li>
            <li>
              <a href={COMPANY_HIRE_HREF} className={linkCls}>
                Start hiring
              </a>
            </li>
          </Column>
          <Column title="Company">
            <li>
              <a href="#how-it-works" className={linkCls}>
                How it works
              </a>
            </li>
            <li>
              <a href="#" className={linkCls}>
                About
              </a>
            </li>
          </Column>
        </div>
        <p className="mt-10 border-t border-border pt-6 text-sm text-muted-foreground">
          © 2026 Aptura · {FOOTER_TAGLINE}
        </p>
      </div>
    </footer>
  );
}
