// Server component — pure JSX + a hard-coded href. First tab-stop on any
// page that adopts it; visible only on keyboard focus. Target the same id
// on <main> for a jump that skips shell navigation.

export function SkipToContent({
  targetId = "main-content",
  label = "Skip to main content",
}: {
  targetId?: string;
  label?: string;
}) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-ink-deep focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
    >
      {label}
    </a>
  );
}
