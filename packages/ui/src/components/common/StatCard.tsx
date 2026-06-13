import * as React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  trend?: { value: string; positive?: boolean };
  className?: string;
  iconClassName?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  className,
  iconClassName,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "cc-card relative flex flex-col gap-2 p-4 transition-colors hover:border-border-strong",
        className
      )}
    >
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span className="font-medium uppercase tracking-wide text-[10.5px]">{label}</span>
        {icon && (
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-fg-muted ring-1 ring-inset ring-border",
              iconClassName
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="cc-text-mono text-2xl font-semibold tracking-tight text-fg">
        {value}
      </div>
      {(hint || trend) && (
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          {trend && (
            <span
              className={cn(
                "font-medium",
                trend.positive ? "text-success" : "text-danger"
              )}
            >
              {trend.value}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </div>
  );
}
