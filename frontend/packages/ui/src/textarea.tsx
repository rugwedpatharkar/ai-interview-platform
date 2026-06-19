import type { TextareaHTMLAttributes } from "react";

import { cn } from "./cn.js";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition-[border-color,box-shadow] placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30",
        className,
      )}
      {...props}
    />
  );
}
