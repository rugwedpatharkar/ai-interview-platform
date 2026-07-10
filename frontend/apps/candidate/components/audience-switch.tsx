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
        For candidates
      </button>
      <button
        type="button"
        className={active === "hiring" ? "on" : undefined}
        aria-pressed={active === "hiring"}
        onClick={() => onSelect("hiring")}
      >
        For hiring teams
      </button>
    </div>
  );
}
