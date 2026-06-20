import {
  type ReactElement,
  type ReactNode,
  cloneElement,
  isValidElement,
  useId,
} from "react";

import { Label } from "./label.js";

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  const uid = useId();
  const errorId = error ? `${uid}-error` : undefined;

  // Wire aria-describedby + aria-invalid onto the direct child input when there's an
  // error, so screen readers announce the error and invalid state without consumers
  // needing manual wiring.
  const input =
    errorId && isValidElement(children)
      ? cloneElement(
          children as ReactElement<{
            "aria-describedby"?: string;
            "aria-invalid"?: boolean;
          }>,
          {
            "aria-describedby": errorId,
            "aria-invalid": true,
          },
        )
      : children;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {input}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={errorId} className="text-sm text-danger" role="alert" aria-live="polite">
          {error}
        </p>
      )}
    </div>
  );
}
