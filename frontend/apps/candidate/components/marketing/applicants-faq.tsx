"use client";

const ITEMS = [
  { q: "Will a real person watch me during the interview?", a: "No. There is no real-time human watcher. Detectors run on your device; only typed events are sent. Reviewers only see flagged events, after the fact, with the recording encrypted at rest." },
  { q: "What if I have a disability or need an accommodation?", a: "Accommodations are first-class. Extended time, captions, screen-reader-friendly question delivery, and alternative response modes are all available at request — they do not affect your score or appear in your report." },
  { q: "Can I retake the interview if my connection drops?", a: "Yes. Connection drops are not penalised. If a session is interrupted unexpectedly, you'll get a one-tap re-entry and a fresh recording — without losing prior responses." },
  { q: "Will I get feedback even if I'm not advanced?", a: "Yes. Every applicant — advanced or not — receives an outcome message with a competency-level note, the recommendation reason, and an option to request a re-score for a different role." },
  { q: "Does Aptura analyse my face for emotion?", a: "No. We do not infer emotion, affect, or personality from your face or voice. We detect presence, identity match, and proctoring signals — never feelings." },
  { q: "Can I practice before the real interview?", a: "Yes. A full practice round mirrors the real one — same UI, same rubric, no scoring against you. You'll see exactly what's being evaluated before you sit the real interview." },
  { q: "I don't have a webcam. Can I still apply?", a: "A working camera and microphone are required for the proctored interview by design. We'll guide you through low-bandwidth and mobile options. Accommodations are honored." },
  { q: "How long is the interview?", a: "Most Aptura interviews run between 18 and 35 minutes — sized to the rubric for the role. You'll see the expected duration before you start, and there are no surprise rounds." },
  { q: "What happens to my interview recording afterwards?", a: "Recordings are encrypted at rest. Retention is configurable per pilot. Right-to-erase is honored across every Aptura artifact — recording, transcript, scoring, and decision metadata." },
  { q: "Can I see what hiring teams see about me?", a: "Yes — every Aptura report includes the evidence and the reason behind the recommendation. The sample report above is the same template every applicant gets." },
];

export function ApplicantsFaq() {
  return (
    <section className="border-t border-line py-16 lg:py-24" id="faq">
      <div className="ap-wrap">
        <div className="mb-10 grid max-w-[62rem] gap-3">
          <span className="text-[0.92rem] font-semibold text-coral">— Questions, answered</span>
          <h2
            className="text-[clamp(1.85rem,1.35rem+2.1vw,2.55rem)] font-bold leading-[1.06] tracking-[-0.028em] text-ink-deep"
            style={{ fontFamily: "var(--font-display)" }}
          >
            What applicants ask first.
          </h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {ITEMS.map(({ q, a }) => (
            <details key={q} className="group rounded-xl border border-line bg-surface p-4">
              <summary
                className="flex cursor-pointer list-none items-center gap-3 font-semibold text-ink-deep"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {q}
                <span className="ml-auto text-xl text-ink-3 transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="mt-3 text-[0.95rem] leading-relaxed text-ink-2">{a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
