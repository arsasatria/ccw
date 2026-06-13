import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
};

export function PageHeader({ title, subtitle, action, className }: Props) {
  return (
    <div className={cn("flex items-end justify-between gap-6 pb-8", className)}>
      <div>
        <h1 className="font-serif text-[32px] leading-[1.1] tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-prose text-[13px] italic text-ink-muted">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
