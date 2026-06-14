import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useConfig } from "@/components/ConfigProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCard } from "@/components/common/StatCard";
import { StatusPill } from "@/components/common/StatusPill";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { providerModelFromRouter } from "@/lib/utils";

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

  const hasProviders = providers.length > 0;
  const routesCount = hasProviders ? ROUTE_KINDS.length : 0;

  const providerFootnote =
    providers.length > 0
      ? providers.map((p) => p.name).join(" · ")
      : "—";
  const modelFootnote =
    providers.length > 0
      ? `across ${providers.length} ${providers.length === 1 ? "provider" : "providers"}`
      : "—";
  const routeFootnote = hasProviders
    ? `${ROUTE_KINDS.length} kinds · default · background · think · …`
    : "—";
  const transformerFootnote =
    transformerCount > 0 ? "request · response · stream" : "—";

  return (
    <div className="space-y-12">
      {/* HERO */}
      <section className="glass relative overflow-hidden rounded-lg p-8">
        <div className="glass-glow" />
        <div className="relative flex items-start justify-between gap-6">
          <div>
            <StatusPill
              status={hasProviders ? "online" : "offline"}
              label={hasProviders ? "Gateway online" : "Gateway idle"}
            />
            <h1 className="mt-3 max-w-xl font-serif text-[32px] leading-[1.1] tracking-[-0.02em] text-ink">
              {t("dashboard.hero.title")}
            </h1>
            <p className="mt-3 max-w-md text-[13px] italic text-ink-muted">
              {t("dashboard.hero.subtitle")}
            </p>
          </div>
          <div className="text-right">
            <div className="font-serif text-[36px] leading-none tracking-[-0.02em] text-ink">
              {t("dashboard.hero.reqCount", { count: 142 })}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
              requests / sec
            </div>
          </div>
        </div>
      </section>

      {/* EMPTY STATE when no providers */}
      {!hasProviders ? (
        <EmptyState
          glass
          title="Add your first provider"
          description="Start by connecting a model provider. The gateway will route requests to it."
          action={
            <Button asChild>
              <Link to="/providers">Add provider</Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* STATS */}
          <section className="grid grid-cols-4 gap-4">
            <StatCard
              label="Providers"
              value={providers.length}
              footnote={providerFootnote}
            />
            <StatCard
              label="Models"
              value={totalModels}
              footnote={modelFootnote}
            />
            <StatCard
              label="Routes"
              value={routesCount}
              footnote={routeFootnote}
            />
            <StatCard
              label="Transformers"
              value={transformerCount}
              footnote={transformerFootnote}
            />
          </section>

          {/* ROUTER MAP */}
          <section>
            <PageHeader
              title="Router map"
              subtitle="Where each request kind lands."
              action={
                <Link to="/router">
                  <Button variant="ghost">Edit</Button>
                </Link>
              }
            />
            <div className="rounded-md border border-line bg-surface">
              {routerEntries.length === 0 ? (
                <div className="px-6 py-8 text-center text-[13px] text-ink-muted">
                  No routes configured yet.
                </div>
              ) : (
                routerEntries.map(([kind, value]) => {
                  const parsed = providerModelFromRouter(
                    value as string
                  );
                  const modelLabel = parsed
                    ? `${parsed.provider} / ${parsed.model}`
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
            Manage
          </div>
          <div className="mt-1 font-serif text-[18px] text-ink">Providers</div>
          <p className="mt-2 text-[12px] text-ink-muted">
            Add, edit, or remove your model providers.
          </p>
        </Link>
        <Link
          to="/presets"
          className="rounded-md border border-line bg-surface p-6 hover:bg-surface-2"
        >
          <div className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
            Install
          </div>
          <div className="mt-1 font-serif text-[18px] text-ink">Presets</div>
          <p className="mt-2 text-[12px] text-ink-muted">
            One-click transformer & route bundles.
          </p>
        </Link>
        <Link
          to="/transformers"
          className="rounded-md border border-line bg-surface p-6 hover:bg-surface-2"
        >
          <div className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
            Configure
          </div>
          <div className="mt-1 font-serif text-[18px] text-ink">
            Transformers
          </div>
          <p className="mt-2 text-[12px] text-ink-muted">
            Custom request/response shaping.
          </p>
        </Link>
      </section>
    </div>
  );
}
