import { LegalShell, LegalPlaceholder } from "../(legal)/legal-shell";

export const metadata = {
  title: "Terms — Aptura",
  description: "Aptura's terms of service for candidates and companies.",
};

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Terms"
      title="Aptura Terms of Service"
      effective="pre-launch — to be ratified before public launch"
      sections={[
        { id: "accept", title: "Acceptance", body: <LegalPlaceholder>Using Aptura signals acceptance of these terms.</LegalPlaceholder> },
        {
          id: "service",
          title: "Service description",
          body: (
            <p>
              Aptura is a hiring marketplace and a strictly-proctored AI-interview platform. Use
              of the proctored interview requires camera + microphone access and a fullscreen
              browser session. Aptura recommends Advance or Hold — never auto-rejects; a human
              reviewer signs every outcome.
            </p>
          ),
        },
        { id: "account", title: "Accounts", body: <LegalPlaceholder>Account creation, verification, and eligibility.</LegalPlaceholder> },
        { id: "use", title: "Acceptable use", body: <LegalPlaceholder>Anti-cheat, impersonation, and abuse provisions ratified by counsel.</LegalPlaceholder> },
        { id: "ip", title: "Intellectual property", body: <LegalPlaceholder>Aptura IP; candidate transcript ownership; company report ownership.</LegalPlaceholder> },
        { id: "disclaim", title: "Disclaimers", body: <LegalPlaceholder>Service is provided as-is during pre-launch; service-level commitments are part of pilot contracts.</LegalPlaceholder> },
        { id: "liability", title: "Limitation of liability", body: <LegalPlaceholder>Liability caps ratified by counsel.</LegalPlaceholder> },
        { id: "term", title: "Termination", body: <LegalPlaceholder>Termination conditions for accounts and pilots.</LegalPlaceholder> },
        { id: "law", title: "Governing law", body: <LegalPlaceholder>Governing jurisdiction ratified by counsel.</LegalPlaceholder> },
        { id: "contact", title: "Contact", body: <p>Questions: <a className="text-brand-strong" href="mailto:legal@aptura.app">legal@aptura.app</a>.</p> },
      ]}
    />
  );
}
