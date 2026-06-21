import Link from "next/link";
import { ApIcon, MarketingShell } from "@ip/ui";

export const metadata = {
  title: "Trust Architecture — Aptura",
  description:
    "How Aptura's proctoring works — and what it doesn't do. The architecture behind a cheat-proof, privacy-respecting interview.",
};

export default function TrustPage() {
  return (
    <MarketingShell audience="applicants">
      {/* Hero */}
      <section className="relative py-16 lg:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[-10%] top-[-20%] -z-10 h-[60%]"
          style={{
            background:
              "radial-gradient(60% 50% at 80% 20%, var(--teal-glow), transparent 70%)",
          }}
        />
        <div className="ap-wrap">
          <span className="ap-eyebrow">Trust Architecture</span>
          <h1
            className="mt-4 text-[clamp(2.4rem,1.75rem+3vw,3.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            How proctoring works.
            <br />
            And what it <span className="text-teal">does not do.</span>
          </h1>
          <p className="ap-lead mt-5 max-w-[60ch]">
            A proctored interview earns trust only when both sides can see the constraints. This
            page is Aptura&apos;s architecture: what we detect, where the detectors live, what
            never leaves your browser, and who can decide what.
          </p>
        </div>
      </section>

      {/* 5-layer architecture diagram */}
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="mb-10 max-w-[62rem]">
            <span className="ap-eyebrow">The five layers</span>
            <h2 className="ap-h2 mt-2">From device pre-flight to server-authoritative auto-end.</h2>
          </div>
          <ol className="grid gap-3">
            {[
              {
                n: "01",
                title: "Identity verification",
                body: "Government-ID match + selfie liveness before the interview starts. The person on camera is the person who applied. Anti-deepfake checks on the selfie.",
              },
              {
                n: "02",
                title: "Device pre-flight",
                body: "Camera, microphone, and browser fullscreen verified before the room loads. Bandwidth + secondary-monitor + virtual-camera checks. Candidate sees what we see.",
              },
              {
                n: "03",
                title: "On-device detection",
                body: "All 40+ proctoring signals run locally in the browser. Face count, gaze, voice presence, second-voice, lips-out-of-sync, tab-switch, fullscreen-exit, screen-share — typed events only, never raw media, never frames.",
              },
              {
                n: "04",
                title: "Server-side severity assignment",
                body: "Detectors emit typed events. The server alone assigns severity (LOW · MEDIUM · HIGH). The client is never trusted to grade itself. Every event is stamped, persisted, and visible in the audit timeline.",
              },
              {
                n: "05",
                title: "Server-authoritative auto-end",
                body: "A HIGH-severity event makes the server set terminated_by_proctor and return terminated=true. The client obeys the ack and ends the room. Termination is not a client decision — the client never decides.",
              },
            ].map((layer) => (
              <li
                key={layer.n}
                className="ap-cell flex flex-col gap-2 lg:grid lg:grid-cols-[90px_1fr] lg:gap-6"
              >
                <span
                  className="text-[1.6rem] font-bold tracking-[-0.02em] text-teal"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {layer.n}
                </span>
                <div>
                  <h3 className="ap-h3">{layer.title}</h3>
                  <p className="ap-lead mt-2 text-[1rem]">{layer.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Privacy inversion */}
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div className="mb-10 max-w-[62rem]">
            <span className="ap-eyebrow">What the architecture forbids</span>
            <h2 className="ap-h2 mt-2">
              The strongest part of the system is everything we chose not to build.
            </h2>
            <p className="ap-lead mt-3">
              These aren&apos;t features under a roadmap. They are constraints that ship with every
              interview, on day one.
            </p>
          </div>
          <ul className="ap-def-list ap-def-list--privacy grid lg:grid-cols-2">
            {[
              ["No real-time human watcher.", "Reviewers only see flagged events, after the fact. No live monitor is sitting on your interview."],
              ["No raw video or audio leaves the browser.", "Detectors run on-device. Only typed event payloads (severity + timestamp + reason) reach our servers."],
              ["No emotion or affect inference.", "We do not infer stress, confidence, personality, or mood from face or voice. Not in scores. Not in reports. Not as advisory."],
              ["No identity matching beyond the ID check.", "No voiceprints. No face-match against external databases. Identity confirmation is one-shot, at the start."],
              ["No keystroke surveillance for content.", "We detect tab-switches and copy/paste events. We do not capture what you type in those switches."],
              ["No client-side severity grading.", "The client cannot say what is HIGH. Severity is server-assigned. The client cannot escalate or downgrade an event."],
              ["No silent auto-rejection.", "Aptura recommends Advance or Hold — never Reject. A named human signs every outcome with a reason."],
              ["Right-to-erase, honored across artifacts.", "Recording, transcript, scoring, and decision metadata — all in scope. One request, one cascade."],
            ].map(([b, rest]) => (
              <li key={b}>
                <ApIcon name="check" />
                <span>
                  <b>{b}</b> {rest}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="border-t border-line py-16 lg:py-24">
        <div className="ap-wrap">
          <div
            className="grid items-center gap-6 rounded-3xl border border-line p-7 lg:grid-cols-[1.2fr_auto] lg:gap-10 lg:p-12"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in oklch, var(--teal) 8%, var(--surface)), var(--surface))",
            }}
          >
            <div>
              <h2 className="ap-h2">Want to see this architecture in motion?</h2>
              <p className="ap-lead mt-3">
                The sample report shows what a real Aptura report and integrity timeline look
                like — same primitives the architecture above produces.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/sample-report" className="ap-btn ap-btn-primary ap-btn-lg">
                See a sample report
              </Link>
              <Link href="/pilot" className="ap-btn ap-btn-ghost ap-btn-lg">
                Book a pilot
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
