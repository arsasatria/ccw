import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface/40 p-8 text-center",
        className
      )}
    >
      {icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-surface-2 text-fg-muted ring-1 ring-inset ring-border">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <div className="text-sm font-medium text-fg">{title}</div>
        {description && (
          <div className="text-xs text-fg-muted">{description}</div>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
