"use client";

import { type ImgHTMLAttributes, useState } from "react";

import { cn } from "./cn.js";

const sizes = {
  sm: "size-7 text-xs",
  md: "size-9 text-sm",
  lg: "size-11 text-base",
} as const;

/** Derive up-to-two-letter initials from a display name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export interface AvatarProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** Display name — used for initials fallback and as default alt text. */
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
}

/**
 * Circular avatar. Shows the image when `src` is set and loads; otherwise (or on
 * load error) falls back to brand-tinted initials.
 */
export function Avatar({
  name,
  src,
  size = "md",
  className,
  alt,
  ...props
}: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-brand-100 font-medium text-brand-700 dark:bg-brand-500/20 dark:text-brand-300",
        sizes[size],
        className,
      )}
    >
      {showImage ? (
        <img
          src={src!}
          alt={alt ?? name}
          className="size-full object-cover"
          onError={() => setFailed(true)}
          {...props}
        />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
    </span>
  );
}
