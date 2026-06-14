import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-cc-shimmer rounded-md bg-surface-2", className)}
      {...props}
    />
  );
}
