import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../ui-utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border-[0.5px] px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-[0.5px] focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary-hover",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary-hover",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive-hover",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * 只读状态徽标的展示属性；不推断业务状态，也不提供交互行为。
 * @example
 * ```tsx
 * const props: BadgeProps = { variant: "outline", children: "Running" };
 * ```
 */
export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
