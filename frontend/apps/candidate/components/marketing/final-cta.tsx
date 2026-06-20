import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { COMPANY_HIRE_HREF } from "../../app/(marketing)/content";

export function FinalCta() {
  return (
    <section className="bg-[linear-gradient(135deg,#7c3aed,#4f46e5)] text-white">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight">Ready when you are.</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/90">
          Get seen for what you can do — or screen on merit, with a result you can trust.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 font-medium text-brand-700 transition-colors hover:bg-white/90"
          >
            Find your next job <ArrowRight className="size-4" aria-hidden />
          </Link>
          <a
            href={COMPANY_HIRE_HREF}
            className="inline-flex items-center gap-2 rounded-lg border border-white/40 px-5 py-3 font-medium text-white transition-colors hover:bg-white/10"
          >
            Start hiring on merit
          </a>
        </div>
      </div>
    </section>
  );
}
