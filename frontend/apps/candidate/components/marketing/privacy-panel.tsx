import { ApIcon } from "@ip/ui";

const ITEMS: Array<[string, string]> = [
  ["No real-time human watcher.", "Reviewers only see flagged events, after the fact."],
  ["No raw video or audio leaves the browser.", "Detectors run on-device; only typed events are sent."],
  ["No emotion or affect inference.", '"Candidate looked stressed" scoring? Never.'],
  ["No identity matching beyond the ID check.", "No voiceprints, no face match against other databases."],
  ["No keystroke surveillance for content.", "We track tab-switches, not what you type elsewhere."],
  ["Encrypted at rest. Deleted on request.", "Right-to-erase honored across every Aptura artifact."],
];

/**
 * Privacy half of the original DefenseSplit — rendered standalone on the applicants
 * landing as section §5 (the applicant trust answer), and still rendered inside
 * DefenseSplit on the hiring teams landing as its right column.
 */
export function PrivacyPanel() {
  return (
    <div className="ap-def-panel ap-def-panel--privacy">
      <h3 className="ap-h3 flex items-center gap-2">
        <ApIcon name="shield-check" className="size-6 text-brand" />
        What Aptura does{" "}
        <em className="not-italic font-medium text-brand-strong">not</em> do
      </h3>
      <ul className="ap-def-list ap-def-list--privacy">
        {ITEMS.map(([title, rest]) => (
          <li key={title}>
            <ApIcon name="check" />
            <span>
              <b>{title}</b> {rest}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
