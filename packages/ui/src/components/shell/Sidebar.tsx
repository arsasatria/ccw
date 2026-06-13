import * as React from "react";
import { NavLink } from "react-router-dom";
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
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/common/Logo";
import { Separator } from "@/components/ui/separator";

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const PRIMARY_NAV: NavItem[] = [
  { to: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
  { to: "/providers", labelKey: "nav.providers", icon: Cpu },
  { to: "/router", labelKey: "nav.router", icon: GitBranch },
  { to: "/transformers", labelKey: "nav.transformers", icon: Workflow },
  { to: "/presets", labelKey: "nav.presets", icon: Layers },
];

const SECONDARY_NAV: NavItem[] = [
  { to: "/logs", labelKey: "nav.logs", icon: ScrollText },
  { to: "/debug", labelKey: "nav.debug", icon: Bug },
  { to: "/settings", labelKey: "nav.settings", icon: SettingsIcon },
];

export function Sidebar() {
  const { t } = useTranslation();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>

      <Separator />

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        <NavGroup items={PRIMARY_NAV} label={t("nav.section.workspace")} t={t} />
        <NavGroup items={SECONDARY_NAV} label={t("nav.section.tools")} t={t} />
      </nav>

      <div className="px-3 pb-4">
        <div className="cc-card-elevated flex flex-col gap-2 p-3 text-xs">
          <div className="flex items-center gap-1.5 text-fg">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            <span className="font-medium">{t("nav.upsell.title")}</span>
          </div>
          <p className="text-fg-muted leading-relaxed">
            {t("nav.upsell.description")}
          </p>
        </div>
      </div>
    </aside>
  );
}

function NavGroup({
  items,
  label,
  t,
}: {
  items: NavItem[];
  label: string;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-1">
      <div className="px-2 text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-sidebar-active text-sidebar-fg"
                  : "text-sidebar-muted hover:text-sidebar-fg hover:bg-sidebar-active/60"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    isActive ? "text-brand" : "text-sidebar-muted"
                  )}
                />
                <span className="flex-1 truncate">{t(item.labelKey)}</span>
                {item.badge && (
                  <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        );
      })}
    </div>
  );
}
