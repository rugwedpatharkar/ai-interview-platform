import { ApIcon, MarketingShell } from "@ip/ui";

export const metadata = {
  title: "Status — Aptura",
  description: "Aptura system status. Pre-launch: monitoring activates with the product.",
};

const SERVICES = [
  { id: "marketplace", name: "Marketplace", desc: "Job discovery, application, candidate profile" },
  { id: "auth", name: "Auth", desc: "Sign-in, registration, password reset" },
  { id: "interviews", name: "Interviews", desc: "Live proctored interview room + recording" },
  { id: "reports", name: "Reports", desc: "Evidence reports + integrity timeline" },
  { id: "notifications", name: "Notifications", desc: "Email + in-app outcomes" },
  { id: "integrations", name: "Integrations", desc: "ATS / calendar / identity (roadmap)" },
];

export default function StatusPage() {
  // Build-time timestamp so at least ONE date on this page is real — the pills
  // are frozen at "Not monitored" until the healthcheck actually lands.
  const generatedAt = new Date().toISOString();

  return (
    <MarketingShell audience="applicants">
      <section className="py-12 lg:py-20">
        <div className="ap-wrap">
          <span className="ap-eyebrow">System status</span>
          <h1
            className="mt-3 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Monitoring is not yet live.
          </h1>
          <p className="ap-lead mt-3 max-w-[60ch]">
            Aptura is pre-launch. This page is a static placeholder — the pills below are frozen,
            not populated from a healthcheck. Real per-service status, latency, and incident
            history land here when the product opens up.
          </p>
        </div>
      </section>

      {/* Banner */}
      <section className="border-t border-line py-10 lg:py-14">
        <div className="ap-wrap">
          <div
            className="grid items-center gap-4 rounded-3xl border p-6 lg:grid-cols-[auto_1fr_auto] lg:gap-8 lg:p-8"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklch, var(--ink-3) 6%, var(--surface)), var(--surface))",
              borderColor: "var(--line)",
            }}
          >
            <div className="grid size-14 place-items-center rounded-full bg-surface-2 text-ink-3">
              <ApIcon name="shield-check" className="size-7" />
            </div>
            <div>
              <h2 className="ap-h3 text-[1.4rem]">Live monitoring not yet active</h2>
              <p className="mt-1.5 text-[0.96rem] text-ink-2">
                Page generated at build time: <time dateTime={generatedAt}>{generatedAt}</time>.
                Not a live healthcheck.
              </p>
            </div>
            <span className="ap-pill">Pre-launch</span>
          </div>
        </div>
      </section>

      {/* Services grid */}
      <section className="border-t border-line py-12 lg:py-16">
        <div className="ap-wrap">
          <div className="mb-8 max-w-[62rem]">
            <span className="ap-eyebrow">Services</span>
            <h2 className="ap-h2 mt-2">Per-service status</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <article key={s.id} className="ap-cell flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="ap-h4">{s.name}</h3>
                  <span className="ap-pill">Not monitored</span>
                </div>
                <p className="text-[0.9rem] leading-snug text-ink-2">{s.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Incidents */}
      <section className="border-t border-line py-14 lg:py-20">
        <div className="ap-wrap">
          <div className="mb-6 max-w-[62rem]">
            <span className="ap-eyebrow">Recent incidents</span>
            <h2 className="ap-h2 mt-2">Incident history not yet available.</h2>
          </div>
          <div className="rounded-2xl border border-dashed border-line bg-surface-2 p-8 text-center text-[0.94rem] text-ink-3">
            Live incident history activates with the product. This panel will populate
            automatically from our monitoring system.
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
