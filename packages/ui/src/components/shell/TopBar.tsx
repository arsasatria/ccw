import { Logo } from "@/components/common/Logo";
import { InlineNav } from "./InlineNav";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "@/components/common/ThemeToggle";

/**
 * Legacy props retained for backward compatibility with AppShell during the
 * T17 -> T18 transition. The new TopBar composition is self-contained and
 * does not consume these; they will be removed when AppShell is updated in T18.
 */
interface TopBarProps {
  onSave?: () => void;
  onSaveAndRestart?: () => void;
  onOpenCommandPalette?: () => void;
  isCheckingUpdate?: boolean;
  hasUpdate?: boolean;
  onCheckForUpdates?: () => void;
}

export function TopBar(_legacy: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 h-[60px] border-b border-line bg-paper">
      <div className="mx-auto flex h-full max-w-[1100px] items-center gap-8 px-8">
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <span className="font-serif text-[14px] text-ink">ccw</span>
        </div>
        <InlineNav />
        <div className="ml-auto flex items-center gap-2">
          <CommandPalette.Trigger />
          <ThemeToggle />
          <div
            className="ml-1 h-6 w-6 rounded-full"
            style={{ background: "linear-gradient(135deg, var(--accent-2), var(--accent-3))" }}
            aria-label="Account"
          />
        </div>
      </div>
    </header>
  );
}
