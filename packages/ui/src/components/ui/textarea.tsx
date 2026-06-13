import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-surface px-3 py-2 text-sm",
          "shadow-[inset_0_1px_0_oklch(0_0_0_/_2%)]",
          "placeholder:text-fg-subtle",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-brand/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
