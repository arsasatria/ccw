import { NavLink } from "react-router-dom";
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
  return (
    <nav className="flex items-center gap-[18px]" aria-label="Primary">
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
