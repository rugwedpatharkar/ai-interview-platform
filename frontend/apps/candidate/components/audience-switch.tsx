"use client";

/**
 * Audience switcher for the consolidated Lucent landing. Toggles the landing body
 * IN PLACE (via `onSelect`) — no route navigation. Rendered inside the `.lucent`
 * nav of `landing-page.tsx`; styled by `.lucent .aud-switch` in globals.css.
 */
export function AudienceSwitch({
  active,
  onSelect,
}: {
  active: "candidates" | "hiring";
  onSelect: (a: "candidates" | "hiring") => void;
}) {
  return (
    <div className="aud-switch" role="group" aria-label="Choose what you're here for">
      <button
        type="button"
        className={active === "candidates" ? "on" : undefined}
        aria-pressed={active === "candidates"}
        onClick={() => onSelect("candidates")}
      >
        <span className="aud-lbl-full">For candidates</span>
        <span className="aud-lbl-short">Candidates</span>
      </button>
      <button
        type="button"
        className={active === "hiring" ? "on" : undefined}
        aria-pressed={active === "hiring"}
        onClick={() => onSelect("hiring")}
      >
        <span className="aud-lbl-full">For hiring teams</span>
        <span className="aud-lbl-short">Hiring</span>
      </button>
    </div>
  );
}
