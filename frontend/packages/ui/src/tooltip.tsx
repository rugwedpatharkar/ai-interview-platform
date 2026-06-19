"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn.js";

export const TooltipProvider = TooltipPrimitive.Provider;
export const TooltipRoot = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-xs rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground shadow-md",
          "data-[state=delayed-open]:animate-fade-in data-[state=closed]:animate-fade-out",
          className,
        )}
        {...props}
      >
        {props.children}
        <TooltipPrimitive.Arrow className="fill-surface" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/**
 * Convenience wrapper: wrap any element to give it a tooltip. For finer control
 * (placement, delay) compose the primitives directly. Self-contained Provider so
 * a single tooltip works without app-level setup.
 */
export function Tooltip({
  content,
  children,
  delayDuration = 200,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  delayDuration?: number;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipContent side={side}>{content}</TooltipContent>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
