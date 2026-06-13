import { cn } from "@/lib/utils";

type Status = "online" | "offline" | "active" | "inactive" | "warning" | "danger";

const COLOR: Record<Status, string> = {
  online: "bg-success",
  offline: "bg-ink-subtle",
  active: "bg-success",
  inactive: "bg-ink-subtle",
  warning: "bg-warning",
  danger: "bg-danger",
};

type Props = { status: Status; label: string; className?: string };

export function StatusPill({ status, label, className }: Props) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.1em] text-ink-muted", className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", COLOR[status])} />
      {label}
    </span>
  );
}
