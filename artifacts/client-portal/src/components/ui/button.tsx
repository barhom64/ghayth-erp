import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { Clock } from "lucide-react"

import { cn } from "@/lib/utils"
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
" hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
           // @replit: no hover, and add primary border
           "bg-primary text-primary-foreground border border-primary-border",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm border-destructive-border",
        outline:
          // @replit Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color. Uses shadow-xs. no shadow on active
          // No hover state
          " border [border-color:var(--button-outline)] shadow-xs active:shadow-none ",
        secondary:
          // @replit border, no hover, no shadow, secondary border.
          "border bg-secondary text-secondary-foreground border border-secondary-border ",
        // @replit no hover, transparent border
        ghost: "border border-transparent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // @replit changed sizes
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /**
   * Task #169 — when true, the button subscribes to the global
   * rate-limit cooldown and:
   *   • disables itself while the cooldown is active
   *   • replaces its children with "حاول بعد N ثانية…" (with a Clock
   *     icon) so the customer sees exactly when they may retry
   * Cleared automatically when the countdown reaches zero. Mirrors the
   * main app's Task #155 implementation.
   */
  rateLimitAware?: boolean
}

const RateLimitAwareNativeButton = React.forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "rateLimitAware" | "asChild">
>(({ className, variant, size, disabled, children, ...props }, ref) => {
  const cooldown = useRateLimitCooldown()
  const cooling = cooldown.isCoolingDown
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      disabled={disabled || cooling}
      {...props}
    >
      {cooling ? (
        <>
          <Clock className="h-3.5 w-3.5" />
          {cooldown.label}
        </>
      ) : (
        children
      )}
    </button>
  )
})
RateLimitAwareNativeButton.displayName = "RateLimitAwareNativeButton"

const RateLimitAwareSlotButton = React.forwardRef<
  HTMLElement,
  Omit<ButtonProps, "rateLimitAware" | "asChild">
>(({ className, variant, size, disabled, children, ...props }, ref) => {
  const cooldown = useRateLimitCooldown()
  const cooling = cooldown.isCoolingDown
  return (
    <Slot
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      aria-disabled={disabled || cooling || undefined}
      {...props}
    >
      {children}
    </Slot>
  )
})
RateLimitAwareSlotButton.displayName = "RateLimitAwareSlotButton"

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, rateLimitAware = false, ...props }, ref) => {
    if (rateLimitAware) {
      if (asChild) {
        return (
          <RateLimitAwareSlotButton
            className={className}
            variant={variant}
            size={size}
            ref={ref as React.Ref<HTMLElement>}
            {...props}
          />
        )
      }
      return (
        <RateLimitAwareNativeButton
          className={className}
          variant={variant}
          size={size}
          ref={ref}
          {...props}
        />
      )
    }
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
