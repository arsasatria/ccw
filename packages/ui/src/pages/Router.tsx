import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Zap,
  Activity,
  Sparkles,
  Clock,
  Globe,
  Image as ImageIcon,
  Save,
  RotateCcw,
} from "lucide-react";
import { useConfig } from "@/components/ConfigProvider";
import { useToast } from "@/components/shell/ToastHost";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn, deepEqual, providerModelFromRouter } from "@/lib/utils";

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
  const { config, setConfig, save, isSaving } = useConfig();
  const { show } = useToast();

  // Draft copy of the persisted config. Edits live in `draft` until the
  // user explicitly hits Save; `isDirty` is true when the two diverge.
  const [draft, setDraft] = React.useState<typeof config>(config);

  // Keep the draft in sync with the server-side config (initial load,
  // post-save round-trip, etc.). This intentionally resets unsaved edits
  // when the persisted snapshot changes — explicit Save is the contract.
  React.useEffect(() => {
    setDraft(config);
  }, [config]);

  const routerConfig = config?.Router;
  const draftRouter = draft?.Router;
  const isDirty = !deepEqual(draft, config);

  const update = (key: keyof RouterFields, value: string) => {
    if (!draftRouter || !draft) return;
    setDraft({
      ...draft,
      Router: { ...draftRouter, [key]: value },
    });
  };

  const updateThreshold = (n: number) => {
    if (!draftRouter || !draft) return;
    setDraft({
      ...draft,
      Router: { ...draftRouter, longContextThreshold: n },
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setConfig(draft);
    try {
      await save();
      show(`${t("app.save")} ✓`, "success");
    } catch (e) {
      show(`Save failed: ${(e as Error).message}`, "error");
    }
  };

  const handleReset = () => {
    setDraft(config);
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

  if (!routerConfig || !draftRouter || !draft) {
    return (
      <div className="space-y-8">
        <PageHeader
          title={t("router.title")}
          subtitle={t("router.subtitle")}
        />
        <div className="rounded-md border border-line bg-surface p-6 text-sm text-ink-muted">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("router.title")}
        subtitle={t("router.subtitle")}
      />

      {isDirty && (
        <div className="sticky top-4 z-10 flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-warning" />
            {t("toplevel.unsaved_changes") ?? "Unsaved changes"}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isSaving}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t("app.reset") ?? "Reset"}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Save className="h-3.5 w-3.5" />
              {isSaving
                ? t("app.saving") ?? "Saving…"
                : t("app.save") ?? "Save"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {ROUTE_KINDS.map((route) => {
          const value = draftRouter[route.key] ?? "";
          const parsed = providerModelFromRouter(value);
          const Icon = route.icon;
          return (
            <div
              key={route.key}
              className={cn(
                "rounded-md border border-line bg-surface p-6",
                "transition-colors hover:border-line-strong"
              )}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent-1">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-serif text-[16px] italic text-ink">
                      {t(`router.${route.key}`)}
                    </h3>
                    {parsed ? (
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {parsed.provider}
                      </Badge>
                    ) : (
                      <StatusPill
                        status="inactive"
                        label={t("router.unassigned")}
                      />
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {route.description}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <Combobox
                  options={modelOptions}
                  value={value}
                  onChange={(v) => update(route.key, v)}
                  placeholder={t("router.selectModel")}
                  searchPlaceholder={t("router.searchModel")}
                  emptyPlaceholder={t("router.noModelFound")}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-md border border-line bg-surface p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-serif text-[16px] italic text-ink">
              {t("router.threshold.title")}
            </h3>
            <p className="mt-0.5 text-xs text-ink-muted">
              {t("router.threshold.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="threshold" className="text-xs text-ink-muted">
              {t("router.longContextThreshold")}
            </Label>
            <Input
              id="threshold"
              type="number"
              value={draftRouter.longContextThreshold ?? 60000}
              onChange={(e) => updateThreshold(Number(e.target.value))}
              className="w-28"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
