import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/hooks/useTheme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  return (
    <button
      onClick={toggle}
      aria-label={t("palette.toggle_theme")}
      className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-muted hover:bg-surface-2 hover:text-ink focus-warm"
    >
      {theme === "dark" ? <Sun size={16} strokeWidth={1.5} /> : <Moon size={16} strokeWidth={1.5} />}
    </button>
  );
}
