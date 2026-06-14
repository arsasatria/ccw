import * as React from "react";
import * as CheckboxPrimitives from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitives.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitives.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded border border-line-strong bg-surface-2",
      "ring-offset-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:gradient-accent data-[state=checked]:text-accent-fg data-[state=checked]:border-transparent",
      "data-[state=indeterminate]:gradient-accent data-[state=indeterminate]:text-accent-fg data-[state=indeterminate]:border-transparent",
      className
    )}
    {...props}
  >
    <CheckboxPrimitives.Indicator className="flex items-center justify-center text-current">
      {props.checked === "indeterminate" ? (
        <Minus className="h-3.5 w-3.5" />
      ) : (
        <Check className="h-3.5 w-3.5" />
      )}
    </CheckboxPrimitives.Indicator>
  </CheckboxPrimitives.Root>
));
Checkbox.displayName = CheckboxPrimitives.Root.displayName;

export { Checkbox };
