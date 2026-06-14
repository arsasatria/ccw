import * as React from "react";
import { useTranslation } from "react-i18next";
import { TopBar } from "./TopBar";
import { ToastHost } from "./ToastHost";
import { useConfig } from "@/components/ConfigProvider";
import { Skeleton } from "@/components/ui/skeleton";

interface AppShellProps {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;
}

export function AppShell({ children, title, subtitle, actions, toolbar }: AppShellProps) {
  const { config, error } = useConfig();
  const { t } = useTranslation();

  if (error && !config) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-paper text-ink">
        <div className="cc-card max-w-md p-6 text-center">
          <div className="text-sm text-danger">{error.message}</div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-paper text-ink">
        <div className="space-y-3 text-center">
          <Skeleton className="mx-auto h-8 w-48" />
          <Skeleton className="mx-auto h-3 w-32" />
        </div>
      </div>
    );
  }

  return (
    <ToastHost>
      <div className="min-h-screen bg-paper text-ink">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-1.5 focus:text-[12px] focus:text-ink focus:shadow-modal"
        >
          {t("common.skip_to_content")}
        </a>
        <TopBar />
        {toolbar}
        <main id="main" className="mx-auto max-w-[1100px] px-5 py-8 md:px-8 md:py-12">
          {(title || actions) && (
            <div className="mb-6 flex items-end justify-between gap-4">
              <div className="space-y-1">
                {title && (
                  <h1 className="font-serif text-[28px] tracking-[-0.01em] text-ink">
                    {title}
                  </h1>
                )}
                {subtitle && (
                  <p className="text-[13px] italic text-ink-muted">{subtitle}</p>
                )}
              </div>
              {actions && <div className="flex items-center gap-2">{actions}</div>}
            </div>
          )}
          {children}
        </main>
      </div>
    </ToastHost>
  );
}
