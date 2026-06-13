import { cn } from "@/lib/utils";
import { swatchFor } from "@/lib/palette";

type Props = {
  name: string;
  size?: number; // default 28
  className?: string;
};

export function Avatar({ name, size = 28, className }: Props) {
  const letter = (name.trim()[0] ?? "?").toUpperCase();
  const sw = swatchFor(name);
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md font-medium text-[12px] text-accent-fg shrink-0",
        className
      )}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${sw.from}, ${sw.to})`,
      }}
      aria-label={name}
    >
      {letter}
    </div>
  );
}
