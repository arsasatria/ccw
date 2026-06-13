import { useEffect } from "react";
import { CheckCircle2, XCircle, AlertTriangle, X, Info } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "warning" | "info";

interface ToastProps {
  message: string;
  type: ToastKind;
  onClose: () => void;
}

const STYLES: Record<ToastKind, { ring: string; icon: string; Icon: React.ComponentType<{ className?: string }> }> = {
  success: {
    ring: "ring-success/30 bg-success/10",
    icon: "text-success",
    Icon: CheckCircle2,
  },
  error: {
    ring: "ring-danger/30 bg-danger/10",
    icon: "text-danger",
    Icon: XCircle,
  },
  warning: {
    ring: "ring-warning/30 bg-warning/10",
    icon: "text-warning",
    Icon: AlertTriangle,
  },
  info: {
    ring: "ring-info/30 bg-info/10",
    icon: "text-info",
    Icon: Info,
  },
};

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3500);

    return () => clearTimeout(timer);
  }, [onClose]);

  const { ring, icon, Icon } = STYLES[type] ?? STYLES.info;

  return (
    <div
      role="status"
      className={cn(
        "fixed top-4 right-4 z-[100] flex items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3 shadow-lg",
        "ring-1 ring-inset",
        ring,
        "animate-cc-fade-in"
      )}
    >
      <Icon className={cn("h-4.5 w-4.5", icon)} />
      <span className="text-sm text-fg">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 rounded-sm text-fg-subtle transition-colors hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Close"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
