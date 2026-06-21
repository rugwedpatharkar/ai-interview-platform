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

  // Guarantee label↔input association. Resolve the input id from (in order) the child's
  // own id, the explicit htmlFor, then the generated uid — and feed the same id to the
  // <Label htmlFor>. cloneElement injects id + aria-describedby onto the direct child
  // input, but only for props the child doesn't already define (so callers that pass
  // their own id / aria-describedby stay untouched).
  const childProps = isValidElement(children)
    ? (children.props as {
        id?: string;
        "aria-describedby"?: string;
      })
    : {};
  const inputId = childProps.id ?? htmlFor ?? uid;

  const input = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          id?: string;
          "aria-describedby"?: string;
          "aria-invalid"?: boolean;
        }>,
        {
          id: inputId,
          ...(errorId && childProps["aria-describedby"] === undefined
            ? { "aria-describedby": errorId, "aria-invalid": true }
            : {}),
        },
      )
    : children;

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
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
