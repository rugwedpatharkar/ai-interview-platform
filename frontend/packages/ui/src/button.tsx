import { type VariantProps, cva } from "class-variance-authority";
import { type LucideIcon } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ReactElement,
  cloneElement,
  forwardRef,
  isValidElement,
} from "react";

import { cn } from "./cn.js";
import { Loader2Icon } from "./internal-icons.js";

// This is the PRODUCT/app button tier (compact CVA). The Lucent LANDING deliberately
// keeps its own larger marketing button set (.btn / .btn-hero / .btn-glass in
// primitives.css) with signature spectral-gradient + glass styles that don't belong on
// product screens; the Aperture .ap-btn-* set is a third product-instrument tier. These
// are intentional tiers, not duplication to merge. Use `asChild` to style a <Link> as a
// product button without nesting an <a> in a <button>.

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-brand to-brand-strong text-primary-foreground shadow-elev-2 hover:-translate-y-px hover:brightness-[1.05] active:translate-y-0",
        secondary:
          "bg-surface-muted text-foreground hover:bg-border/70",
        outline:
          "border border-border bg-surface text-foreground shadow-sm hover:bg-surface-muted",
        ghost: "text-foreground hover:bg-surface-muted",
        destructive: "bg-danger text-white shadow-sm hover:brightness-95",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-sm",
        lg: "h-11 px-8 text-base",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

const iconSize = { default: 16, sm: 16, lg: 18, icon: 18 } as const;

type BaseButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** lucide icon rendered before the label. */
  leadingIcon?: LucideIcon;
  /** lucide icon rendered after the label. */
  trailingIcon?: LucideIcon;
  /** Shows a spinner and disables the button while truthy. */
  loading?: boolean;
  /** Render the single child element (e.g. a Next <Link>) styled as this button
   *  instead of a <button>. leadingIcon/trailingIcon/loading are ignored here —
   *  the child owns its content, href, and events. */
  asChild?: boolean;
};

type NonIconButtonProps = BaseButtonProps &
  VariantProps<typeof buttonVariants> & {
    size?: Exclude<NonNullable<VariantProps<typeof buttonVariants>["size"]>, "icon">;
    /** aria-label is optional for labelled buttons. */
    "aria-label"?: string;
  };

type IconButtonProps = BaseButtonProps &
  VariantProps<typeof buttonVariants> & {
    size: "icon";
    /** Icon-only buttons have no visible text — aria-label is required for accessibility. */
    "aria-label": string;
  };

export type ButtonProps = NonIconButtonProps | IconButtonProps;

// forwardRef so Radix `asChild` triggers (Dialog/Select) can compose a Button.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      className,
      variant,
      size,
      leadingIcon: LeadingIcon,
      trailingIcon: TrailingIcon,
      loading = false,
      disabled,
      asChild = false,
      children,
      ...props
    },
    ref,
  ) {
    // asChild: paint the button styles onto the child element (e.g. a <Link>) so a
    // link-CTA reads as a product button without an <a>-inside-<button>.
    if (asChild && isValidElement(children)) {
      const child = children as ReactElement<{ className?: string }>;
      return cloneElement(child, {
        className: cn(buttonVariants({ variant, size }), className, child.props.className),
      });
    }

    const px = iconSize[size ?? "default"];
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <Loader2Icon className="absolute size-4 animate-spin" aria-hidden />
        )}
        <span
          className={cn(
            "inline-flex items-center gap-2",
            loading && "opacity-0",
          )}
        >
          {LeadingIcon && <LeadingIcon size={px} aria-hidden />}
          {children}
          {TrailingIcon && <TrailingIcon size={px} aria-hidden />}
        </span>
      </button>
    );
  },
);

export { buttonVariants };
