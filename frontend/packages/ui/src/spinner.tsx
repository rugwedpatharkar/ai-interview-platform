import { Loader2 } from "lucide-react";

import { cn } from "./cn.js";

const sizes = { sm: "size-4", md: "size-5", lg: "size-6" } as const;

export function Spinner({
  className,
  size = "sm",
}: {
  className?: string;
  size?: keyof typeof sizes;
}) {
  return (
    <Loader2
      role="status"
      aria-label="Loading"
      className={cn("animate-spin text-muted-foreground", sizes[size], className)}
    />
  );
}
