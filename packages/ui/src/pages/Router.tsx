import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Zap,
  Activity,
  Sparkles,
  Clock,
  Globe,
  Image as ImageIcon,
} from "lucide-react";
import { useConfig } from "@/components/ConfigProvider";
import { AppShell } from "@/components/shell/AppShell";
import { Combobox } from "@/components/ui/combobox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn, providerModelFromRouter } from "@/lib/utils";

const ROUTE_KINDS: Array<{
  key: keyof RouterFields;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}> = [
  {
    key: "default",
    icon: Zap,
    description: "Regular user prompts",
  },
  {
    key: "background",
    icon: Activity,
    description: "Sub-tasks, hooks, async work",
  },
  {
    key: "think",
    icon: Sparkles,
    description: "Extended reasoning / chain-of-thought",
  },
  {
    key: "longContext",
    icon: Clock,
    description: "Prompts over the long-context threshold",
  },
  {
    key: "webSearch",
    icon: Globe,
    description: "Built-in web search tool",
  },
  {
    key: "image",
    icon: ImageIcon,
    description: "Image generation / vision tasks",
  },
];

interface RouterFields {
  default: string;
  background: string;
  think: string;
  longContext: string;
  webSearch: string;
  image: string;
}

export default function RouterPage() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();

  const routerConfig = config?.Router;

  const update = (key: keyof RouterFields, value: string) => {
    if (!routerConfig) return;
    setConfig({
      ...config!,
      Router: { ...routerConfig, [key]: value },
    });
  };

  const updateThreshold = (n: number) => {
    if (!routerConfig) return;
    setConfig({
      ...config!,
      Router: { ...routerConfig, longContextThreshold: n },
    });
  };

  const modelOptions = React.useMemo(() => {
    const opts: { label: string; value: string }[] = [];
    (config?.Providers ?? []).forEach((p) => {
      (p.models ?? []).forEach((m) => {
        opts.push({ label: `${p.name} / ${m}`, value: `${p.name},${m}` });
      });
    });
    return opts;
  }, [config?.Providers]);

  if (!routerConfig) {
    return (
      <AppShell title={t("router.title")} subtitle={t("router.subtitle")}>
        <div className="cc-card p-6 text-sm text-fg-muted">
          {t("common.loading")}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("router.title")}
      subtitle={t("router.subtitle")}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ROUTE_KINDS.map((route) => {
          const value = routerConfig[route.key] ?? "";
          const parsed = providerModelFromRouter(value);
          const Icon = route.icon;
          return (
            <div
              key={route.key}
              className="cc-card flex flex-col gap-3 p-4 transition-colors hover:border-border-strong"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-fg">
                      {t(`router.${route.key}`)}
                    </span>
                    {parsed ? (
                      <Badge variant="brand" className="font-mono text-[10px]">
                        {parsed.provider}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{t("router.unassigned")}</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {route.description}
                  </p>
                </div>
              </div>
              <Combobox
                options={modelOptions}
                value={value}
                onChange={(v) => update(route.key, v)}
                placeholder={t("router.selectModel")}
                searchPlaceholder={t("router.searchModel")}
                emptyPlaceholder={t("router.noModelFound")}
              />
            </div>
          );
        })}
      </div>

      <div className="cc-card mt-6 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-fg">
              {t("router.threshold.title")}
            </h3>
            <p className="mt-0.5 text-xs text-fg-muted">
              {t("router.threshold.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="threshold" className="text-xs text-fg-muted">
              {t("router.longContextThreshold")}
            </Label>
            <Input
              id="threshold"
              type="number"
              value={routerConfig.longContextThreshold ?? 60000}
              onChange={(e) => updateThreshold(Number(e.target.value))}
              className="w-28"
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
