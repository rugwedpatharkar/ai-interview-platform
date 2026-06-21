import { LegalShell, LegalPlaceholder } from "../(legal)/legal-shell";

export const metadata = {
  title: "Privacy — Aptura",
  description:
    "Aptura's privacy policy — what we collect, how we use it, retention, and your rights.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Privacy"
      title="Aptura Privacy Policy"
      effective="pre-launch — to be ratified before public launch"
      sections={[
        {
          id: "who",
          title: "Who we are",
          body: (
            <LegalPlaceholder>
              Aptura is a pre-launch hiring marketplace and proctored-interview platform. This
              policy applies to candidates and recruiters using Aptura&apos;s products and the{" "}
              <code>aptura.app</code> domain.
            </LegalPlaceholder>
          ),
        },
        {
          id: "data",
          title: "What we collect",
          body: (
            <div className="grid gap-3">
              <p>
                Aptura is designed to collect the minimum data needed for a verified interview.
                Specifically:
              </p>
              <ul className="ml-6 list-disc grid gap-1">
                <li>Identity verification: government-ID image + selfie, for one-time match.</li>
                <li>Interview recording + transcript + on-device proctoring events.</li>
                <li>Account profile: name, email, role preferences (candidate) or company profile (recruiter).</li>
                <li>Usage telemetry: page loads, feature usage, errors. Aggregated, never sold.</li>
              </ul>
              <p>
                <b className="text-ink-deep">Raw video/audio frames never leave your browser.</b>{" "}
                Detectors run on-device; only typed event payloads reach our servers.
              </p>
            </div>
          ),
        },
        {
          id: "use",
          title: "How we use it",
          body: (
            <LegalPlaceholder>
              Solely to provide the proctored interview, the evidence report, and the recruiter
              decision workflow. Not for advertising, not sold to third parties, not used to train
              third-party AI models.
            </LegalPlaceholder>
          ),
        },
        {
          id: "basis",
          title: "Legal basis",
          body: <LegalPlaceholder>Contract performance; consent (recording); legitimate interest (integrity).</LegalPlaceholder>,
        },
        {
          id: "retention",
          title: "Retention",
          body: (
            <div className="grid gap-3">
              <p>Retention is configurable per pilot. Defaults (pre-launch):</p>
              <ul className="ml-6 list-disc grid gap-1">
                <li>Interview recording: 90 days, then deletion or anonymisation.</li>
                <li>Transcript + scoring + decision metadata: 365 days.</li>
                <li>Account profile: lifetime of the account.</li>
              </ul>
              <p>Right-to-erase cascades across every artifact above.</p>
            </div>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <div className="grid gap-3">
              <p>
                Access, rectification, erasure, restriction, portability, and objection — honored
                via{" "}
                <a className="text-teal-strong" href="mailto:privacy@aptura.app">
                  privacy@aptura.app
                </a>
                . Two business-day response SLA.
              </p>
              <LegalPlaceholder>Region-specific rights (GDPR, CCPA) ratified by counsel.</LegalPlaceholder>
            </div>
          ),
        },
        {
          id: "subprocessors",
          title: "Subprocessors",
          body: (
            <LegalPlaceholder>
              List of subprocessors (cloud, LLM provider, identity provider, transcription) ratified
              and published before launch.
            </LegalPlaceholder>
          ),
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <p>
              Questions about this policy or your data:{" "}
              <a className="text-teal-strong" href="mailto:privacy@aptura.app">
                privacy@aptura.app
              </a>
              .
            </p>
          ),
        },
      ]}
    />
  );
}
