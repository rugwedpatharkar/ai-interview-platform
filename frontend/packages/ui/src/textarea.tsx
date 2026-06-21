import { type TextareaHTMLAttributes, forwardRef } from "react";

import { cn } from "./cn.js";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
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
  },
);
Textarea.displayName = "Textarea";
