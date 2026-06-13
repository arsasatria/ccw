import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Save,
  RefreshCw,
  CircleArrowUp,
  Languages,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TopBarProps {
  onSave: () => void;
  onSaveAndRestart: () => void;
  onOpenCommandPalette: () => void;
  isCheckingUpdate?: boolean;
  hasUpdate?: boolean;
  onCheckForUpdates?: () => void;
}

export function TopBar({
  onSave,
  onSaveAndRestart,
  onOpenCommandPalette,
  isCheckingUpdate = false,
  hasUpdate = false,
  onCheckForUpdates,
}: TopBarProps) {
  const { t, i18n } = useTranslation();
  const [shortcut, setShortcut] = React.useState("Ctrl K");

  React.useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    setShortcut(isMac ? "⌘ K" : "Ctrl K");
  }, []);

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-bg/80 px-5 backdrop-blur">
      <button
        onClick={onOpenCommandPalette}
        className={cn(
          "group flex h-8 w-72 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm",
          "text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted"
        )}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left text-xs">
          {t("topbar.search_placeholder")}
        </span>
        <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-fg-subtle">
          {shortcut}
        </kbd>
      </button>

      <div className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCheckForUpdates}
            disabled={isCheckingUpdate}
            className="relative"
          >
            <CircleArrowUp
              className={cn(
                "h-4 w-4",
                hasUpdate && "text-brand"
              )}
            />
            {hasUpdate && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand ring-2 ring-bg" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("topbar.check_updates")}</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Language">
            <Languages className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onSelect={() => i18n.changeLanguage("en")}
            className="justify-between"
          >
            <span>English</span>
            {i18n.language.startsWith("en") && <Check className="h-3.5 w-3.5 text-brand" />}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => i18n.changeLanguage("zh")}
            className="justify-between"
          >
            <span>中文</span>
            {i18n.language.startsWith("zh") && <Check className="h-3.5 w-3.5 text-brand" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ThemeToggle />

      <div className="mx-1 h-5 w-px bg-border" />

      <Button variant="outline" size="sm" onClick={onSave}>
        <Save className="h-3.5 w-3.5" />
        {t("topbar.save")}
      </Button>
      <Button size="sm" onClick={onSaveAndRestart}>
        <RefreshCw className="h-3.5 w-3.5" />
        {t("topbar.save_restart")}
      </Button>
    </header>
  );
}
