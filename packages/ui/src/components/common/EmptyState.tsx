import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  glass?: boolean; // when true, wrap in glass card
  className?: string;
};

export function EmptyState({ title, description, action, glass, className }: Props) {
  return (
    <div
      className={cn(
        glass ? "glass relative overflow-hidden" : "rounded-md border border-line bg-surface",
        "flex flex-col items-center justify-center gap-4 p-12 text-center",
        className
      )}
    >
      <h2 className="font-serif text-[24px] leading-tight tracking-[-0.01em] text-ink">
        {title}
      </h2>
      {description && (
        <p className="max-w-sm text-[13px] text-ink-muted">{description}</p>
      )}
      {action}
    </div>
  );
}
