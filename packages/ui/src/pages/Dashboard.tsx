import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Cpu,
  GitBranch,
  Workflow,
  Layers,
  Zap,
  ArrowRight,
  Plus,
  Power,
  Clock,
  Activity,
  Sparkles,
} from "lucide-react";
import { useConfig } from "@/components/ConfigProvider";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/common/StatusPill";
import { StatCard } from "@/components/common/StatCard";
import { EmptyState } from "@/components/common/EmptyState";
import {
  providerModelFromRouter,
  hostnameFromUrl,
} from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

const ROUTE_LABELS: Record<string, { key: string; icon: React.ComponentType<{ className?: string }>; tone: string; description: string }> = {
  default: {
    key: "router.default",
    icon: Zap,
    tone: "from-brand/15 to-brand/0",
    description: "Regular user prompts",
  },
  background: {
    key: "router.background",
    icon: Activity,
    tone: "from-info/15 to-info/0",
    description: "Sub-tasks, hooks, async",
  },
  think: {
    key: "router.think",
    icon: Sparkles,
    tone: "from-warning/15 to-warning/0",
    description: "Reasoning & chain-of-thought",
  },
  longContext: {
    key: "router.longContext",
    icon: Clock,
    tone: "from-success/15 to-success/0",
    description: "Prompts over the threshold",
  },
  webSearch: {
    key: "router.webSearch",
    icon: GitBranch,
    tone: "from-fg-muted/15 to-fg-muted/0",
    description: "Built-in search tool",
  },
};

export default function Dashboard() {
  const { t } = useTranslation();
  const { config } = useConfig();

  const providers = config?.Providers ?? [];
  const totalModels = providers.reduce(
    (sum, p) => sum + (p.models?.length ?? 0),
    0
  );
  const transformerCount = config?.transformers?.length ?? 0;
  const routerEntries = config?.Router
    ? Object.entries(config.Router).filter(
        ([k, v]) => typeof v === "string" && v && k !== "longContextThreshold"
      )
    : [];

  const online = providers.length > 0;
  const port = config?.PORT ?? 0;

  return (
    <AppShell
      title={t("dashboard.title")}
      subtitle={t("dashboard.subtitle")}
      actions={
        <>
          <Button variant="outline" asChild size="sm">
            <Link to="/providers">
              <Plus className="h-3.5 w-3.5" />
              {t("dashboard.add_provider")}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/router">
              <GitBranch className="h-3.5 w-3.5" />
              {t("dashboard.configure_router")}
            </Link>
          </Button>
        </>
      }
    >
      {/* HERO */}
      <section className="cc-card relative overflow-hidden p-6 mb-6">
        <div className="absolute inset-0 cc-grid-bg opacity-50" aria-hidden />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <StatusPill
                status={online ? "online" : "offline"}
                label={
                  online
                    ? t("dashboard.gateway_running")
                    : t("dashboard.gateway_idle")
                }
              />
              {port > 0 && (
                <Badge variant="secondary" className="font-mono">
                  127.0.0.1:{port}
                </Badge>
              )}
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-fg">
              {online
                ? t("dashboard.hero_title_running")
                : t("dashboard.hero_title_idle")}
            </h2>
            <p className="text-sm text-fg-muted max-w-2xl">
              {t("dashboard.hero_description")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 text-right">
            <div className="flex items-center gap-1.5 text-xs text-fg-muted">
              <Power className="h-3 w-3" />
              {t("dashboard.status_label")}
            </div>
            <div className="cc-text-mono text-3xl font-semibold tracking-tight text-fg">
              {online ? "ONLINE" : "OFFLINE"}
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 mb-6">
        <StatCard
          label={t("dashboard.stats.providers")}
          value={providers.length}
          icon={<Cpu className="h-3.5 w-3.5" />}
          hint={t("dashboard.stats.providers_hint")}
        />
        <StatCard
          label={t("dashboard.stats.models")}
          value={totalModels}
          icon={<Layers className="h-3.5 w-3.5" />}
          hint={t("dashboard.stats.models_hint")}
        />
        <StatCard
          label={t("dashboard.stats.routes")}
          value={routerEntries.length}
          icon={<GitBranch className="h-3.5 w-3.5" />}
          hint={t("dashboard.stats.routes_hint")}
        />
        <StatCard
          label={t("dashboard.stats.transformers")}
          value={transformerCount}
          icon={<Workflow className="h-3.5 w-3.5" />}
          hint={t("dashboard.stats.transformers_hint")}
        />
      </section>

      {/* ROUTER VISUAL */}
      <section className="mb-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className="text-sm font-semibold text-fg">
              {t("dashboard.router_map.title")}
            </h3>
            <p className="text-xs text-fg-muted">
              {t("dashboard.router_map.subtitle")}
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/router" className="text-fg-muted">
              {t("dashboard.router_map.edit")}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>

        {routerEntries.length === 0 ? (
          <EmptyState
            icon={<GitBranch className="h-4 w-4" />}
            title={t("dashboard.router_map.empty_title")}
            description={t("dashboard.router_map.empty_description")}
            action={
              <Button asChild size="sm">
                <Link to="/router">{t("dashboard.router_map.empty_action")}</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {routerEntries.map(([kind, value]) => {
              const meta = ROUTE_LABELS[kind];
              if (!meta) return null;
              const parsed = providerModelFromRouter(value as string);
              const Icon = meta.icon;
              return (
                <Link
                  key={kind}
                  to="/router"
                  className={cn(
                    "cc-card relative overflow-hidden p-4 transition-all hover:border-border-strong hover:translate-y-[-1px]"
                  )}
                >
                  <div
                    className={cn(
                      "absolute inset-0 bg-gradient-to-br opacity-40",
                      meta.tone
                    )}
                    aria-hidden
                  />
                  <div className="relative flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-fg ring-1 ring-inset ring-border"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-muted">
                          {t(`router.${kind}`, kind)}
                        </span>
                      </div>
                      <div className="mt-1 cc-text-mono text-sm font-medium text-fg truncate">
                        {parsed
                          ? `${parsed.provider} / ${parsed.model}`
                          : "—"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-fg-subtle">
                        {meta.description}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* QUICK ACTIONS */}
      <section className="grid gap-3 md:grid-cols-3">
        <QuickAction
          to="/providers"
          icon={<Cpu className="h-4 w-4" />}
          title={t("dashboard.quick.providers_title")}
          description={t("dashboard.quick.providers_description")}
        />
        <QuickAction
          to="/transformers"
          icon={<Workflow className="h-4 w-4" />}
          title={t("dashboard.quick.transformers_title")}
          description={t("dashboard.quick.transformers_description")}
        />
        <QuickAction
          to="/presets"
          icon={<Layers className="h-4 w-4" />}
          title={t("dashboard.quick.presets_title")}
          description={t("dashboard.quick.presets_description")}
        />
      </section>
    </AppShell>
  );
}

function QuickAction({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="cc-card group flex items-start gap-3 p-4 transition-colors hover:border-border-strong"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-fg">{title}</span>
          <ArrowRight className="h-3.5 w-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
        </div>
        <p className="mt-0.5 text-xs text-fg-muted">{description}</p>
      </div>
    </Link>
  );
}
