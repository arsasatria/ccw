import * as React from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Cpu,
  GitBranch,
  Workflow,
  Layers,
  ScrollText,
  Bug,
  Settings as SettingsIcon,
  RotateCw,
  Languages,
  Sun,
  Moon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useTheme } from "@/hooks/useTheme";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { theme, toggle } = useTheme();

  const go = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  const run = (fn: () => void) => () => {
    fn();
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("palette.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("palette.empty")}</CommandEmpty>

        <CommandGroup heading={t("palette.heading.navigation")}>
          <CommandItem onSelect={() => go("/dashboard")}>
            <LayoutDashboard className="h-4 w-4" />
            {t("nav.dashboard")}
          </CommandItem>
          <CommandItem onSelect={() => go("/providers")}>
            <Cpu className="h-4 w-4" />
            {t("nav.providers")}
          </CommandItem>
          <CommandItem onSelect={() => go("/router")}>
            <GitBranch className="h-4 w-4" />
            {t("nav.router")}
          </CommandItem>
          <CommandItem onSelect={() => go("/transformers")}>
            <Workflow className="h-4 w-4" />
            {t("nav.transformers")}
          </CommandItem>
          <CommandItem onSelect={() => go("/presets")}>
            <Layers className="h-4 w-4" />
            {t("nav.presets")}
          </CommandItem>
          <CommandItem onSelect={() => go("/logs")}>
            <ScrollText className="h-4 w-4" />
            {t("nav.logs")}
          </CommandItem>
          <CommandItem onSelect={() => go("/debug")}>
            <Bug className="h-4 w-4" />
            {t("nav.debug")}
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <SettingsIcon className="h-4 w-4" />
            {t("nav.settings")}
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading={t("palette.heading.actions")}>
          <CommandItem onSelect={run(() => window.location.reload())}>
            <RotateCw className="h-4 w-4" />
            {t("palette.reload_gateway")}
            <CommandShortcut>⌘⇧R</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading={t("palette.heading.preferences")}>
          <CommandItem onSelect={run(() => i18n.changeLanguage("en"))}>
            <Languages className="h-4 w-4" />
            English
            {i18n.language.startsWith("en") && (
              <span className="ml-auto text-xs text-ink-subtle">active</span>
            )}
          </CommandItem>
          <CommandItem onSelect={run(() => i18n.changeLanguage("zh"))}>
            <Languages className="h-4 w-4" />
            中文
            {i18n.language.startsWith("zh") && (
              <span className="ml-auto text-xs text-ink-subtle">active</span>
            )}
          </CommandItem>
          <CommandItem onSelect={run(toggle)}>
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            {t("palette.toggle_theme")}
            <CommandShortcut>⌘⇧L</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

CommandPalette.Trigger = function Trigger() {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-sm border border-line bg-surface px-2.5 text-[12px] text-ink-muted hover:bg-surface-2 focus-warm"
        aria-label={t("common.open_command_palette")}
      >
        <span>{t("common.search")}</span>
        <kbd className="rounded-sm border border-line bg-paper px-1 text-[10px]">⌘K</kbd>
      </button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </>
  );
};
