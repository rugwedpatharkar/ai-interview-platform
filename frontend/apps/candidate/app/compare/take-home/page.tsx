import Link from "next/link";
import { ApIcon, MarketingShell } from "@ip/ui";

export const metadata = {
  title: "Aptura vs. take-home tests — Aptura",
  description:
    "Why a verified proctored interview produces a more defensible hiring signal than a take-home test in the era of AI copilots.",
};

export default function CompareTakeHomePage() {
  return (
    <MarketingShell audience="hiring-teams">
      <section className="py-16 lg:py-24">
        <div className="ap-wrap">
          <span className="ap-eyebrow">Aptura vs. take-home tests</span>
          <h1
            className="mt-4 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            A take-home tells you who has{" "}
            <span className="text-brand">access to tools.</span>
            <br />
            An Aptura interview tells you who can <span className="text-brand">do the work.</span>
          </h1>
          <p className="ap-lead mt-5 max-w-[60ch]">
            Take-homes used to be a fair signal. In an era of AI copilots, screen-sharing relays,
            and ghost-collaborator tools, they aren&apos;t. A proctored interview is.
          </p>
        </div>
      </section>

      <section className="border-t border-line py-14 lg:py-20">
        <div className="ap-wrap">
          <div className="ap-compare">
            <div className="ap-compare-row ap-compare-head">
              <div>Capability</div>
              <div className="col">Take-home test</div>
              <div className="col">Unverified video</div>
              <div className="col us">Aptura · verified interview</div>
            </div>
            {(
              [
                ["Identity is verified before the assessment", "no", "no", "ID match + liveness"],
                ["Cheating is detected during the assessment", "no", "no", "40-signal proctoring"],
                ["Every score is backed by quoted evidence", "no", "mid", "Transcript-linked"],
                ["Bias-aware by design (audit on the roadmap)", "no", "no", "By design"],
                ["Every applicant gets a real answer", "no", "mid", "Always"],
                ["Decision audit trail preserved", "no", "no", "Per decision"],
                ["Reproducible — re-score on demand", "no", "no", "Same evidence, new lens"],
                ["No second takes, no off-platform retries", "n/a", "no", "Enforced"],
              ] as const
            ).map(([cap, r, t, u]) => (
              <div key={cap} className="ap-compare-row">
                <div>{cap}</div>
                <div><Cell value={r} /></div>
                <div><Cell value={t} /></div>
                <div className="ap-compare-us"><Cell value={u} us /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="grid gap-6 lg:grid-cols-2">
            <article className="ap-cell">
              <h3 className="ap-h3">Why take-homes broke</h3>
              <ul className="mt-4 grid gap-2.5 text-[0.96rem] leading-relaxed text-ink-2">
                <li className="flex gap-2.5"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />AI copilots that finish the brief in 90 seconds.</li>
                <li className="flex gap-2.5"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />Marketplaces for ghost-collaborators who solve it for a fee.</li>
                <li className="flex gap-2.5"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />No way to confirm the submitter is the candidate.</li>
                <li className="flex gap-2.5"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />Reviewers grade a polished output, not the reasoning that produced it.</li>
                <li className="flex gap-2.5"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-current opacity-50" />The good candidates pay the time cost; the gamers don&apos;t.</li>
              </ul>
            </article>
            <article className="ap-cell ap-cell--anchor">
              <h3 className="ap-h3">Why a verified interview works</h3>
              <ul className="mt-4 grid gap-2.5 text-[0.96rem] leading-relaxed text-ink-2">
                <li className="flex gap-2.5"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-brand opacity-80" />Identity is verified before the room opens.</li>
                <li className="flex gap-2.5"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-brand opacity-80" />Reasoning happens live, on a fullscreen-locked surface.</li>
                <li className="flex gap-2.5"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-brand opacity-80" />40+ proctoring signals run on-device — never raw media.</li>
                <li className="flex gap-2.5"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-brand opacity-80" />Every score points to a quoted line in the transcript.</li>
                <li className="flex gap-2.5"><span className="mt-[10px] size-1 shrink-0 rounded-full bg-brand opacity-80" />HIGH-severity events end the session — server-authoritative.</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div
            className="grid items-center gap-6 rounded-3xl border border-line p-7 lg:grid-cols-[1.2fr_auto] lg:gap-10 lg:p-12"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklch, var(--brand) 8%, var(--surface)), var(--surface))",
            }}
          >
            <div>
              <h2 className="ap-h2">Run a pilot on one open role.</h2>
              <p className="ap-lead mt-3">
                Replace the take-home with one Aptura proctored interview. Get a written summary
                of what proctoring caught, the reports your reviewers actually used, and the
                integration shape we&apos;d build for you.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/pilot" className="ap-btn ap-btn-primary ap-btn-lg">
                Book a pilot
              </Link>
              <Link href="/sample-report" className="ap-btn ap-btn-ghost ap-btn-lg">
                <ApIcon name="dl" className="size-4" /> See a sample report
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}

function Cell({ value, us }: { value: string; us?: boolean }) {
  const lower = value.toLowerCase();
  if (lower === "no") return <span className="ap-compare-no">No</span>;
  if (lower === "n/a") return <span className="ap-compare-no">N/A</span>;
  if (lower === "mid") return <span className="ap-compare-mid">Partial</span>;
  if (us) {
    return (
      <span className="ap-compare-yes">
        <ApIcon name="check" className="size-[14px]" /> {value}
      </span>
    );
  }
  return <span className="ap-compare-no">{value}</span>;
}
