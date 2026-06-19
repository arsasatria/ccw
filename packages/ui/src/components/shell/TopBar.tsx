import { useTranslation } from "react-i18next";
import { Logo } from "@/components/common/Logo";
import { InlineNav } from "./InlineNav";
import { CommandPalette } from "./CommandPalette";
import { ThemeToggle } from "@/components/common/ThemeToggle";

export function TopBar() {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-40 h-[60px] border-b border-line bg-paper">
      <div className="mx-auto flex h-full max-w-[1100px] items-center gap-8 px-8">
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <span className="font-serif text-[14px] text-ink">CCW</span>
        </div>
        <InlineNav />
        <div className="ml-auto flex items-center gap-2">
          <CommandPalette.Trigger />
          <ThemeToggle />
          <div
            className="ml-1 h-6 w-6 rounded-full"
            style={{ background: "linear-gradient(135deg, var(--accent-2), var(--accent-3))" }}
            aria-label={t("common.account")}
          />
        </div>
      </div>
    </header>
  );
}
