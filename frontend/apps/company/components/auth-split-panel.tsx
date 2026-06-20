import { LogoMark } from "@ip/ui";

/**
 * The right-hand brand panel of the split auth layout. A `--gradient-brand`
 * surface (violet→indigo) carrying the aperture mark, the Aptura tagline, and
 * the proctored/fair/merit value line. Fairness framing — focus and clarity,
 * never a watching eye; no "surveillance" copy. Decorative rings are
 * `aria-hidden`; the panel is an `<aside>` so the form keeps focus order.
 * Hidden below `lg` — the form pane fills the viewport on mobile.
 */
export function AuthSplitPanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(135deg,#7c3aed,#4f46e5)] p-10 text-white lg:flex">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 size-80 rounded-full border border-white/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-16 size-72 rounded-full border border-white/10"
      />
      <LogoMark size="lg" className="relative bg-white/10 text-white" />
      <div className="relative">
        <p className="font-display text-3xl font-semibold leading-tight">
          Get seen. Get interviewed. Get hired.
        </p>
        <p className="mt-4 max-w-sm text-base text-white/85">
          No ghosting. Proctored &amp; fair. Judged on merit.
        </p>
        <ul className="mt-6 flex flex-col gap-2 text-sm text-white/80">
          <li>Every application gets an answer</li>
          <li>One proctored interview — same rules for everyone</li>
          <li>Evaluated on evidence, not pedigree</li>
        </ul>
      </div>
      <p className="relative text-xs text-white/60">© 2026 Aptura</p>
    </aside>
  );
}
