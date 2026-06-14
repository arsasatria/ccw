import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
    "transition-colors duration-150",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-surface-2 text-ink border border-line",
        success: "bg-success/10 text-success border-transparent",
        warning: "bg-warning/10 text-warning border-transparent",
        danger: "bg-danger/10 text-danger border-transparent",
        accent: "gradient-accent text-accent-fg border-transparent",
        outline: "border border-line text-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants };
