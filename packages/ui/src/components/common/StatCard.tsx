import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string | number;
  footnote?: string;
  className?: string;
};

export function StatCard({ label, value, footnote, className }: Props) {
  return (
    <div className={cn("rounded-md border border-line bg-surface p-6", className)}>
      <div className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink-subtle">
        {label}
      </div>
      <div className="mt-3 font-serif text-[32px] leading-[1] tracking-[-0.02em] text-ink">
        {value}
      </div>
      {footnote && (
        <div className="mt-2 text-[11px] italic text-ink-muted">{footnote}</div>
      )}
    </div>
  );
}
