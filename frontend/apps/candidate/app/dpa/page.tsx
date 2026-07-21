import { LegalShell, LegalPlaceholder } from "../(legal)/legal-shell";

export const metadata = {
  title: "DPA — Aptura",
  description:
    "Aptura's Data Processing Agreement for B2B customers (companies running proctored interviews).",
};

export default function DpaPage() {
  return (
    <LegalShell
      eyebrow="Data Processing Agreement"
      title="Aptura DPA"
      effective="pre-launch — to be ratified before public launch"
      sections={[
        { id: "parties", title: "Parties", body: <LegalPlaceholder>Customer (controller) and Aptura (processor).</LegalPlaceholder> },
        { id: "subject", title: "Subject matter & duration", body: <LegalPlaceholder>Processing scope tied to the pilot or subscription term.</LegalPlaceholder> },
        { id: "nature", title: "Nature and purpose", body: <p>Processing personal data of candidates and recruiters to provide a verified, proctored interview and the resulting evidence report.</p> },
        {
          id: "categories",
          title: "Categories of data subjects and data",
          body: (
            <div className="grid gap-2">
              <p>Subjects: candidates and recruiter users.</p>
              <p>Data: identity (ID image + selfie), interview recording, transcript, on-device proctoring events, account profile, decision metadata.</p>
            </div>
          ),
        },
        { id: "subprocessors", title: "Subprocessors", body: <LegalPlaceholder>List of authorised subprocessors maintained at /privacy under Subprocessors.</LegalPlaceholder> },
        {
          id: "security",
          title: "Security measures",
          body: (
            <div className="grid gap-2">
              <ul className="ml-6 list-disc grid gap-1">
                <li>On-device detection — raw frames and audio never leave the browser.</li>
                <li>TLS 1.2+ in transit. AES-256 at rest.</li>
                <li>Role-based access controls; named-reviewer audit trails.</li>
                <li>SOC 2 on the roadmap (audit scheduled pre-launch).</li>
              </ul>
            </div>
          ),
        },
        { id: "rights", title: "Data subject rights", body: <p>Aptura assists customer with access, rectification, erasure, and portability requests within two business days of receipt.</p> },
        { id: "transfers", title: "International transfers", body: <LegalPlaceholder>Standard Contractual Clauses + transfer mechanisms appropriate to deployment region.</LegalPlaceholder> },
        { id: "term", title: "Term and termination", body: <LegalPlaceholder>Mirrors the pilot or subscription term; return or deletion of data on termination.</LegalPlaceholder> },
        { id: "liability", title: "Liability and indemnity", body: <LegalPlaceholder>As per the master agreement, capped per the Terms of Service.</LegalPlaceholder> },
        { id: "contact", title: "Contact", body: <p>DPA questions: <a className="text-brand-strong" href="mailto:dpa@aptura.app">dpa@aptura.app</a>.</p> },
      ]}
    />
  );
}
