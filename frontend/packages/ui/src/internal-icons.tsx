/**
 * Internal SVG icon components for @ip/ui.
 *
 * These replace lucide-react value-imports within the package boundary.
 * They are NOT exported from the package index — they are for component-internal
 * use only. App code should import from lucide-react directly.
 *
 * Path data matches the lucide MIT source (lucide.dev). viewBox is always 0 0 24 24.
 * All icons use stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round".
 */
import type { SVGAttributes } from "react";

type SvgProps = SVGAttributes<SVGSVGElement>;

function Icon({ children, ...props }: SvgProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

/** Lucide `Check` — used in checkbox, dropdown-menu, select */
export function CheckIcon(props: SvgProps) {
  return (
    <Icon {...props}>
      <polyline points="20 6 9 17 4 12" />
    </Icon>
  );
}

/** Lucide `Loader2` — spinning loader, used in button and spinner */
export function Loader2Icon(props: SvgProps) {
  return (
    <Icon {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </Icon>
  );
}

/** Lucide `Send` — used in chat-window and message-thread-view */
export function SendIcon(props: SvgProps) {
  return (
    <Icon {...props}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </Icon>
  );
}

/** Lucide `User` — used in chat-window and message-thread-view */
export function UserIcon(props: SvgProps) {
  return (
    <Icon {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Icon>
  );
}

/** Lucide `X` — used in dialog and layout (AppShell mobile close) */
export function XIcon(props: SvgProps) {
  return (
    <Icon {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </Icon>
  );
}

/** Lucide `AlertCircle` — used in alert and layout (ErrorState) */
export function AlertCircleIcon(props: SvgProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </Icon>
  );
}
