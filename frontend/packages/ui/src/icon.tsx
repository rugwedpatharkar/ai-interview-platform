import type { LucideIcon, LucideProps } from "lucide-react";

import { cn } from "./cn.js";

const sizes = { xs: "size-3", sm: "size-4", md: "size-5", lg: "size-6" } as const;

export interface IconProps extends Omit<LucideProps, "ref"> {
  /** A lucide-react icon component, e.g. `Sparkles`. */
  icon: LucideIcon;
  size?: keyof typeof sizes;
}

/**
 * Thin wrapper around a lucide icon with a fixed size scale and `aria-hidden`
 * by default (icons are decorative unless given an explicit aria-label).
 */
export function Icon({ icon: IconComponent, size = "sm", className, ...props }: IconProps) {
  return (
    <IconComponent
      aria-hidden
      className={cn(sizes[size], "shrink-0", className)}
      {...props}
    />
  );
}
