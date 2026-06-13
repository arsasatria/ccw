import * as React from "react";
import { cn } from "@/lib/utils";

type StatusKind = "online" | "offline" | "busy" | "idle" | "neutral";

interface StatusPillProps {
  status: StatusKind;
  label?: React.ReactNode;
  className?: string;
  dotClassName?: string;
}

const STATUS_DOT: Record<StatusKind, string> = {
  online: "bg-success",
  offline: "bg-fg-subtle",
  busy: "bg-danger",
  idle: "bg-warning",
  neutral: "bg-fg-muted",
};

export function StatusPill({ status, label, className, dotClassName }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-muted ring-1 ring-inset ring-border",
        className
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {status === "online" && (
          <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 animate-cc-pulse" />
        )}
        <span
          className={cn(
            "relative inline-flex h-1.5 w-1.5 rounded-full",
            STATUS_DOT[status],
            dotClassName
          )}
        />
      </span>
      {label && <span className="text-fg-muted">{label}</span>}
    </span>
  );
}
