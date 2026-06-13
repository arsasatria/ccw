import * as React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Compass, ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <AppShell title="404" subtitle="Route not found">
      <div className="cc-card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Compass className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold text-fg">Page not found</h2>
        <p className="max-w-sm text-sm text-fg-muted">
          The route you tried to reach doesn't exist. Head back to the dashboard
          and pick a section from the sidebar.
        </p>
        <Button asChild size="sm" className="mt-2">
          <Link to="/dashboard">
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("app.cancel")}
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}
