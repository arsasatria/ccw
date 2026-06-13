import * as React from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "@/components/shell/TopBar";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { ToastHost, useToast } from "@/components/shell/ToastHost";
import { useConfig } from "@/components/ConfigProvider";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

interface AppShellProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
}

function AppShellInner({
  children,
  title,
  subtitle,
  actions,
  toolbar,
}: AppShellProps) {
  const { config } = useConfig();
  const { show } = useToast();
  const { t } = useTranslation();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = React.useState(false);
  const [hasUpdate, setHasUpdate] = React.useState(false);

  const handleSave = React.useCallback(async () => {
    if (!config) {
      show(t("app.config_missing"), "error");
      return;
    }
    try {
      const response = (await api.updateConfig(config)) as any;
      if (response && response.success === false) {
        show(response.message || t("app.config_saved_failed"), "error");
      } else {
        show(response?.message || t("app.config_saved_success"), "success");
      }
    } catch (err) {
      show(
        t("app.config_saved_failed") + ": " + (err as Error).message,
        "error"
      );
    }
  }, [config, show, t]);

  const handleSaveAndRestart = React.useCallback(async () => {
    if (!config) {
      show(t("app.config_missing"), "error");
      return;
    }
    try {
      const saveResp = (await api.updateConfig(config)) as any;
      if (saveResp && saveResp.success === false) {
        show(saveResp.message || t("app.config_saved_failed"), "error");
        return;
      }
      const restartResp = (await api.restartService()) as any;
      if (restartResp && restartResp.success === false) {
        show(restartResp.message || t("app.config_saved_restart_failed"), "error");
        return;
      }
      show(t("app.config_saved_restart_success"), "success");
    } catch (err) {
      show(
        t("app.config_saved_restart_failed") + ": " + (err as Error).message,
        "error"
      );
    }
  }, [config, show, t]);

  const handleCheckUpdates = React.useCallback(async () => {
    setIsCheckingUpdate(true);
    try {
      const info = await api.checkForUpdates();
      if (info.hasUpdate) {
        setHasUpdate(true);
        show(
          t("app.new_version_available") +
            (info.latestVersion ? ` · v${info.latestVersion}` : ""),
          "info"
        );
      } else {
        show(t("app.no_updates_available"), "success");
      }
    } catch (err) {
      show(
        t("app.update_check_failed") + ": " + (err as Error).message,
        "error"
      );
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [show, t]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (isMod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleSaveAndRestart();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave, handleSaveAndRestart]);

  // Auto-check for updates once on mount
  React.useEffect(() => {
    if (!config) return;
    let cancelled = false;
    (async () => {
      try {
        const info = await api.checkForUpdates();
        if (!cancelled && info.hasUpdate) {
          setHasUpdate(true);
        }
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config]);

  return (
    <>
      <div className="flex h-screen w-full overflow-hidden bg-bg text-fg">
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            onSave={handleSave}
            onSaveAndRestart={handleSaveAndRestart}
            onOpenCommandPalette={() => setPaletteOpen(true)}
            isCheckingUpdate={isCheckingUpdate}
            hasUpdate={hasUpdate}
            onCheckForUpdates={handleCheckUpdates}
          />
          {toolbar}
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-7xl px-6 py-6">
              {(title || actions) && (
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div className="space-y-1">
                    {title && (
                      <h1 className="text-xl font-semibold tracking-tight text-fg">
                        {title}
                      </h1>
                    )}
                    {subtitle && (
                      <p className="text-sm text-fg-muted">{subtitle}</p>
                    )}
                  </div>
                  {actions && <div className="flex items-center gap-2">{actions}</div>}
                </div>
              )}
              {children}
            </div>
          </main>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSave={handleSave}
        onSaveAndRestart={handleSaveAndRestart}
        onCheckForUpdates={handleCheckUpdates}
        onToggleTheme={() => {
          const root = document.documentElement;
          const isLight = root.classList.contains("light");
          root.classList.toggle("light", !isLight);
          root.classList.toggle("dark", isLight);
        }}
      />
    </>
  );
}

export function AppShell(props: AppShellProps) {
  const { config, error } = useConfig();

  if (error && !config) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg text-fg">
        <div className="cc-card max-w-md p-6 text-center">
          <div className="text-sm text-danger">
            {error.message}
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg text-fg">
        <div className="space-y-3 text-center">
          <Skeleton className="mx-auto h-8 w-48" />
          <Skeleton className="mx-auto h-3 w-32" />
        </div>
      </div>
    );
  }

  return (
    <ToastHost>
      <AppShellInner {...props} />
    </ToastHost>
  );
}
