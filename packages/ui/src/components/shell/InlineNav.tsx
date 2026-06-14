import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const ROUTES = [
  { to: "/dashboard",    label: "Dashboard" },
  { to: "/providers",    label: "Providers" },
  { to: "/router",       label: "Router" },
  { to: "/transformers", label: "Transformers" },
  { to: "/presets",      label: "Presets" },
  { to: "/logs",         label: "Logs" },
  { to: "/debug",        label: "Debug" },
  { to: "/settings",     label: "Settings" },
];

export function InlineNav() {
  const { t } = useTranslation();
  return (
    <nav className="flex items-center gap-[18px]" aria-label={t("common.primary_navigation")}>
      {ROUTES.map((r) => (
        <NavLink
          key={r.to}
          to={r.to}
          className={({ isActive }) =>
            cn(
              "text-[13px] transition-colors focus-warm rounded-sm",
              isActive
                ? "text-ink font-medium"
                : "text-ink-muted hover:text-ink"
            )
          }
        >
          {r.label}
        </NavLink>
      ))}
    </nav>
  );
}
