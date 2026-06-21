import Link from "next/link";
import { Logo, buttonVariants, cn } from "@ip/ui";
import { COMPANY_HIRE_HREF } from "../../app/(marketing)/content";
import { AppearanceToggle } from "../appearance-toggle";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" aria-label="Aptura home">
          <Logo />
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <a
            href={COMPANY_HIRE_HREF}
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            For companies
          </a>
          <a
            href="#how-it-works"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            How it works
          </a>
          <AppearanceToggle />
          <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
            Sign in
          </Link>
          <Link href="/register" className={cn(buttonVariants({ size: "sm" }))}>
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
