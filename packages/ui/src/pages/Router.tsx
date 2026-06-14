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
  Plus,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useConfig } from "@/components/ConfigProvider";
import { useToast } from "@/components/shell/ToastHost";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  cn,
  coerceChain,
  deepEqual,
  providerModelFromRouter,
} from "@/lib/utils";

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
  default: string[];
  background: string[];
  think: string[];
  longContext: string[];
  longContextThreshold: number;
  webSearch: string[];
  image: string[];
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

  const update = (key: keyof RouterFields, value: string[]) => {
    if (!draftRouter || !draft) return;
    setDraft({
      ...draft,
      Router: { ...draftRouter, [key]: value },
    });
  };

  const updateEntry = (key: keyof RouterFields, idx: number, value: string) => {
    if (!draftRouter) return;
    const chain = coerceChain(draftRouter[key]);
    const next = chain.slice();
    next[idx] = value;
    update(key, next);
  };

  const removeEntry = (key: keyof RouterFields, idx: number) => {
    if (!draftRouter) return;
    const chain = coerceChain(draftRouter[key]);
    update(
      key,
      chain.filter((_, i) => i !== idx)
    );
  };

  const addEntry = (key: keyof RouterFields) => {
    if (!draftRouter) return;
    update(key, [...coerceChain(draftRouter[key]), ""]);
  };

  const moveEntry = (key: keyof RouterFields, idx: number, delta: number) => {
    if (!draftRouter) return;
    const chain = coerceChain(draftRouter[key]);
    const target = idx + delta;
    if (target < 0 || target >= chain.length) return;
    const next = chain.slice();
    [next[idx], next[target]] = [next[target], next[idx]];
    update(key, next);
  };

  const updateThreshold = (n: number) => {
    if (!draftRouter || !draft) return;
    setDraft({
      ...draft,
      Router: { ...draftRouter, longContextThreshold: n },
    });
  };

  const handleSave = async () => {
    if (!draft || !draft.Router) return;
    // Defensive client-side normalization: server already normalizes on read,
    // but we strip empty / non-string entries here so the wire format is
    // consistent regardless of what ends up in `draft`.
    const router = draft.Router;
    const normalizedRouter: RouterFields = {
      default: coerceChain(router.default),
      background: coerceChain(router.background),
      think: coerceChain(router.think),
      longContext: coerceChain(router.longContext),
      longContextThreshold: router.longContextThreshold,
      webSearch: coerceChain(router.webSearch),
      image: coerceChain(router.image),
    };
    const normalized = { ...draft, Router: normalizedRouter };
    setConfig(normalized);
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
          const chain = coerceChain(draftRouter[route.key]);
          const firstEntry = chain[0] ?? "";
          const firstParsed = providerModelFromRouter(firstEntry);
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
                    {firstParsed ? (
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {firstParsed.provider}
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

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
                    {t("router.chain")}
                  </div>
                  {chain.length > 1 && (
                    <div className="text-[10px] text-ink-subtle">
                      {chain.length}
                    </div>
                  )}
                </div>
                {chain.length === 0 && (
                  <p className="text-xs text-ink-muted italic">
                    {t("router.chain_hint")}
                  </p>
                )}
                {chain.map((entry, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <span className="w-5 shrink-0 text-right font-mono text-[11px] text-ink-subtle">
                      {idx + 1}.
                    </span>
                    <Input
                      value={entry}
                      placeholder={t("router.entry_placeholder")}
                      onChange={(e) =>
                        updateEntry(route.key, idx, e.target.value)
                      }
                      aria-label={`${t("router.chain")} ${idx + 1}`}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => moveEntry(route.key, idx, -1)}
                      disabled={idx === 0}
                      aria-label={t("router.entry_move_up_aria")}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => moveEntry(route.key, idx, 1)}
                      disabled={idx === chain.length - 1}
                      aria-label={t("router.entry_move_down_aria")}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeEntry(route.key, idx)}
                      aria-label={t("router.entry_remove_aria")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addEntry(route.key)}
                  className="mt-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("router.add_entry")}
                </Button>
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
