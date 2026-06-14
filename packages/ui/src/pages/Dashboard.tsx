import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useConfig } from "@/components/ConfigProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { StatusPill } from "@/components/common/StatusPill";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { providerModelFromRouter } from "@/lib/utils";

const APP_LOG_NAME = "app.log";

type ReqCountState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; count: number };

const ROUTE_KINDS = [
  "default",
  "background",
  "think",
  "longContext",
  "webSearch",
  "image",
] as const;

export default function Dashboard() {
  const { t } = useTranslation();
  const { config } = useConfig();
  const [reqCount, setReqCount] = React.useState<ReqCountState>({ status: "idle" });

  const providers = config?.Providers ?? [];
  const totalModels = providers.reduce(
    (sum, p) => sum + (p.models?.length ?? 0),
    0
  );
  const transformerCount = config?.transformers?.length ?? 0;
  const routerEntries = config?.Router
    ? Object.entries(config.Router).filter(([k, v]) => {
        if (k === "longContextThreshold") return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === "string") return v.length > 0;
        return false;
      })
    : [];

  const hasProviders = providers.length > 0;
  const routesCount = routerEntries.length;

  const providerFootnote =
    providers.length > 0
      ? providers.map((p) => p.name).join(" · ")
      : "—";
  const modelFootnote =
    providers.length > 0
      ? t("dashboard.stats.models_hint")
      : "—";
  const routeFootnote = hasProviders
    ? t("dashboard.stats.routes_hint")
    : "—";
  const transformerFootnote =
    transformerCount > 0 ? t("dashboard.stats.transformers_hint") : "—";

  const refreshRequestCount = React.useCallback(async () => {
    setReqCount({ status: "loading" });
    try {
      const files = await api.getLogFiles();
      const appLog = files.find((f) => f.name === APP_LOG_NAME);
      if (!appLog) {
        // No app.log yet — gateway has served zero requests.
        setReqCount({ status: "ready", count: 0 });
        return;
      }
      const lines = await api.getLogs(appLog.path);
      const nonEmpty = lines.filter((line) => line.trim().length > 0);
      setReqCount({ status: "ready", count: nonEmpty.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setReqCount({ status: "error", message });
    }
  }, []);

  React.useEffect(() => {
    refreshRequestCount();
  }, [refreshRequestCount]);

  const formattedCount = (count: number) => count.toLocaleString();

  const heroStat = (() => {
    switch (reqCount.status) {
      case "idle":
      case "loading":
        return {
          value: t("dashboard.hero.loading"),
          toneClass: "text-ink-muted",
        };
      case "error":
        return {
          value: t("dashboard.hero.error"),
          toneClass: "text-danger",
        };
      case "ready":
        if (reqCount.count === 0) {
          return {
            value: t("dashboard.hero.empty"),
            toneClass: "text-ink-muted",
          };
        }
        return {
          value: t("dashboard.hero.reqCount", {
            count: formattedCount(reqCount.count),
          } as Record<string, unknown>),
          toneClass: "text-ink",
        };
    }
  })();

  return (
    <div className="space-y-12">
      {/* HERO */}
      <section className="glass relative overflow-hidden rounded-lg p-8">
        <div className="glass-glow" />
        <div className="relative flex items-start justify-between gap-6">
          <div>
            <StatusPill
              status={hasProviders ? "online" : "offline"}
              label={hasProviders ? t("dashboard.gateway_online") : t("dashboard.gateway_idle")}
            />
            <h1 className="mt-3 max-w-xl font-serif text-[32px] leading-[1.1] tracking-[-0.02em] text-ink">
              {t("dashboard.hero.title")}
            </h1>
            <p className="mt-3 max-w-md text-[13px] italic text-ink-muted">
              {t("dashboard.hero.subtitle")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div
              className={`font-serif text-[28px] leading-none tracking-[-0.02em] ${heroStat.toneClass}`}
            >
              {heroStat.value}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                {t("dashboard.hero.lifetime_requests")}
              </div>
              <button
                type="button"
                onClick={refreshRequestCount}
                disabled={reqCount.status === "loading"}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-ink-subtle transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshCw
                  className={`h-3 w-3 ${
                    reqCount.status === "loading" ? "animate-spin" : ""
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* EMPTY STATE when no providers */}
      {!hasProviders ? (
        <EmptyState
          glass
          title={t("providers.empty.title")}
          description={t("providers.empty.description")}
          action={
            <Button asChild>
              <Link to="/providers">{t("providers.add")}</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* STATS */}
          <section className="grid grid-cols-4 gap-4">
            <StatCard
              label={t("dashboard.stats.providers")}
              value={providers.length}
              footnote={providerFootnote}
            />
            <StatCard
              label={t("dashboard.stats.models")}
              value={totalModels}
              footnote={modelFootnote}
            />
            <StatCard
              label={t("dashboard.stats.routes")}
              value={routesCount}
              footnote={routeFootnote}
            />
            <StatCard
              label={t("dashboard.stats.transformers")}
              value={transformerCount}
              footnote={transformerFootnote}
            />
          </section>

          {/* ROUTER MAP */}
          <section>
            <PageHeader
              title={t("dashboard.router_map.title")}
              subtitle={t("dashboard.router_map.subtitle")}
              action={
                <Link to="/router">
                  <Button variant="ghost">{t("common.edit")}</Button>
                </Link>
              }
            />
            <div className="rounded-md border border-line bg-surface">
              {routerEntries.length === 0 ? (
                <div className="px-6 py-8 text-center text-[13px] text-ink-muted">
                  {t("dashboard.router_map.empty")}
                </div>
              ) : (
                routerEntries.map(([kind, value]) => {
                  // Chain-shaped: array of "provider,model" strings. Show the
                  // first entry as the primary model; chain length is a hint
                  // for the badge.
                  const chain = Array.isArray(value)
                    ? value
                    : typeof value === "string" && value
                      ? [value]
                      : [];
                  const primary = chain[0] ?? "";
                  const parsed = providerModelFromRouter(primary);
                  const modelLabel = parsed
                    ? chain.length > 1
                      ? `${parsed.provider} / ${parsed.model} +${chain.length - 1}`
                      : `${parsed.provider} / ${parsed.model}`
                    : "—";
                  return (
                    <div
                      key={kind}
                      className="flex items-center justify-between border-b border-line px-6 py-4 last:border-b-0"
                    >
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                          {kind}
                        </div>
                        <div className="mt-1 font-serif text-[16px] text-ink">
                          {modelLabel}
                        </div>
                      </div>
                      <StatusPill
                        status={parsed ? "active" : "inactive"}
                        label={parsed ? "active" : "unassigned"}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}

      {/* QUICK ACTIONS */}
      <section className="grid grid-cols-3 gap-4">
        <Link
          to="/providers"
          className="rounded-md border border-line bg-surface p-6 hover:bg-surface-2"
        >
          <div className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
            {t("dashboard.quick.manage")}
          </div>
          <div className="mt-1 font-serif text-[18px] text-ink">
            {t("dashboard.quick.providers.title")}
          </div>
          <p className="mt-2 text-[12px] text-ink-muted">
            {t("dashboard.quick.providers.description")}
          </p>
        </Link>
        <Link
          to="/presets"
          className="rounded-md border border-line bg-surface p-6 hover:bg-surface-2"
        >
          <div className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
            {t("dashboard.quick.install")}
          </div>
          <div className="mt-1 font-serif text-[18px] text-ink">
            {t("dashboard.quick.presets.title")}
          </div>
          <p className="mt-2 text-[12px] text-ink-muted">
            {t("dashboard.quick.presets.description")}
          </p>
        </Link>
        <Link
          to="/transformers"
          className="rounded-md border border-line bg-surface p-6 hover:bg-surface-2"
        >
          <div className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
            {t("dashboard.quick.configure")}
          </div>
          <div className="mt-1 font-serif text-[18px] text-ink">
            {t("dashboard.quick.transformers.title")}
          </div>
          <p className="mt-2 text-[12px] text-ink-muted">
            {t("dashboard.quick.transformers.description")}
          </p>
        </Link>
      </section>
    </div>
  );
}
