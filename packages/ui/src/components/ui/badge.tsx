import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
    "transition-colors duration-150",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-brand-soft text-brand",
        secondary: "bg-surface-2 text-fg-muted ring-1 ring-inset ring-border",
        outline: "text-fg-muted ring-1 ring-inset ring-border",
        success: "bg-success/12 text-success ring-1 ring-inset ring-success/30",
        warning: "bg-warning/12 text-warning ring-1 ring-inset ring-warning/30",
        danger: "bg-danger/12 text-danger ring-1 ring-inset ring-danger/30",
        info: "bg-info/12 text-info ring-1 ring-inset ring-info/30",
        brand: "bg-brand text-brand-fg",
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
