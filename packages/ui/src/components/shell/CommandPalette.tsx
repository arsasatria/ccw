import * as React from "react";
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
  Save,
  RefreshCw,
  CircleArrowUp,
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

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onSaveAndRestart: () => void;
  onCheckForUpdates: () => void;
  onToggleTheme: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onSave,
  onSaveAndRestart,
  onCheckForUpdates,
  onToggleTheme,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

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
          <CommandItem onSelect={run(onSave)}>
            <Save className="h-4 w-4" />
            {t("topbar.save")}
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(onSaveAndRestart)}>
            <RefreshCw className="h-4 w-4" />
            {t("topbar.save_restart")}
            <CommandShortcut>⌘⇧R</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(onCheckForUpdates)}>
            <CircleArrowUp className="h-4 w-4" />
            {t("topbar.check_updates")}
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading={t("palette.heading.preferences")}>
          <CommandItem
            onSelect={run(() => i18n.changeLanguage("en"))}
          >
            <Languages className="h-4 w-4" />
            English
            {i18n.language.startsWith("en") && (
              <span className="ml-auto text-xs text-fg-subtle">active</span>
            )}
          </CommandItem>
          <CommandItem
            onSelect={run(() => i18n.changeLanguage("zh"))}
          >
            <Languages className="h-4 w-4" />
            中文
            {i18n.language.startsWith("zh") && (
              <span className="ml-auto text-xs text-fg-subtle">active</span>
            )}
          </CommandItem>
          <CommandItem onSelect={run(onToggleTheme)}>
            <Sun className="h-4 w-4" />
            {t("palette.toggle_theme")}
            <CommandShortcut>⌘⇧L</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
