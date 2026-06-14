import { useEffect } from "react";
import { CheckCircle2, XCircle, AlertTriangle, X, Info } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "warning" | "info";
type ToastVariant = "glass";

interface ToastProps {
  message: string;
  type: ToastKind;
  onClose: () => void;
  /**
   * Optional visual variant. `glass` applies the global `.glass` utility —
   * intended for one-off use (e.g. a "Saved" confirmation). Cap to a single
   * glass toast per page so the surface stays calm.
   */
  variant?: ToastVariant;
}

const STYLES: Record<
  ToastKind,
  {
    /** Extra left-border styling applied on top of the base border. */
    leftBorder: string;
    icon: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  success: {
    leftBorder: "border-l-2 border-l-success",
    icon: "text-success",
    Icon: CheckCircle2,
  },
  error: {
    leftBorder: "border-l-2 border-l-danger",
    icon: "text-danger",
    Icon: XCircle,
  },
  warning: {
    leftBorder: "",
    icon: "text-warning",
    Icon: AlertTriangle,
  },
  info: {
    leftBorder: "",
    icon: "text-info",
    Icon: Info,
  },
};

export function Toast({ message, type, onClose, variant }: ToastProps) {
  const { t } = useTranslation();
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3500);

    return () => clearTimeout(timer);
  }, [onClose]);

  const { leftBorder, icon, Icon } = STYLES[type] ?? STYLES.info;

  return (
    <div
      role="status"
      className={cn(
        "fixed top-4 right-4 z-[100] flex items-center gap-3 rounded-lg border border-line bg-surface px-3.5 py-3 text-ink shadow-modal",
        leftBorder,
        variant === "glass" && "glass",
        "animate-cc-fade-in"
      )}
    >
      <Icon className={cn("h-4.5 w-4.5", icon)} />
      <span className="text-sm text-ink">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 rounded-sm text-ink-subtle transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label={t("common.close")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
