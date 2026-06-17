import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Search,
  Trash2,
  Eye,
  EyeOff,
  X,
  KeyRound,
  Workflow as WorkflowIcon,
  Server,
  Filter,
  Pencil,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { useConfig } from "@/components/ConfigProvider";
import { useToast } from "@/components/shell/ToastHost";
import { PageHeader } from "@/components/common/PageHeader";
import { Avatar } from "@/components/common/Avatar";
import { StatusPill } from "@/components/common/StatusPill";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { ComboInput } from "@/components/ui/combo-input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api, fetchProviderModels, FetchProviderModelsError } from "@/lib/api";
import { cn, hostnameFromUrl, maskKey, normalizeAccounts } from "@/lib/utils";
import type { Provider, ProviderAccount, ProviderTransformer } from "@/types";

interface ProviderTemplate {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer?: ProviderTransformer;
  [key: string]: unknown;
}

export default function ProvidersPage() {
  const { t } = useTranslation();
  const { config, setConfig, save } = useConfig();
  const { show } = useToast();

  const [search, setSearch] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingData, setEditingData] = useState<Provider | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<ProviderTemplate[]>([]);
  const [availableTransformers, setAvailableTransformers] = useState<
    { name: string; endpoint: string | null }[]
  >([]);
  const [providerParamInputs, setProviderParamInputs] = useState<
    Record<string, { name: string; value: string }>
  >({});
  const [modelParamInputs, setModelParamInputs] = useState<
    Record<string, { name: string; value: string }>
  >({});

  useEffect(() => {
    // Templates live on a public R2 bucket. If the network is down or the
    // bucket is unreachable, the "Add from template" shortcut is empty —
    // surface a warning so the user knows the empty list isn't a bug.
    fetch("https://pub-0dc3e1677e894f07bbea11b17a29e032.r2.dev/providers.json")
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Templates fetch returned ${r.status}`);
        }
        return r.json();
      })
      .then((d) => setTemplates(d || []))
      .catch((err) => {
        show(
          `${t("providers.templates_unavailable")}: ${(err as Error).message}`,
          "error",
        );
      });
  }, [show, t]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{
          transformers: { name: string; endpoint: string | null }[];
        }>("/transformers");
        setAvailableTransformers(res.transformers);
      } catch {
        // ignore
      }
    })();
  }, []);

  const providers = config?.Providers ?? [];

  // Returns true when `name` (case-insensitive) matches a different
  // existing provider. The currently-edited provider is excluded so
  // saving without renaming the existing one stays a no-op.
  const isProviderNameDuplicate = (name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    return providers.some((p, i) => {
      if (!isNew && i === editingIdx) return false;
      return p.name.toLowerCase() === trimmed.toLowerCase();
    });
  };

  const handleAdd = () => {
    const data: Provider = {
      name: "",
      api_base_url: "",
      api_key: "",
      models: [],
      accounts: [],
      rotation: "error",
    };
    setEditingIdx(providers.length);
    setEditingData(data);
    setIsNew(true);
    setShowKey(false);
    setNameError(null);
    setKeyError(null);
  };

  const handleEdit = (idx: number) => {
    const source = providers[idx];
    const cloned = JSON.parse(JSON.stringify(source)) as Provider;
    // Back-compat migration: if the saved provider has the legacy single
    // `api_key` but no `accounts`, pre-seed the pool with one row so the
    // Account-pool editor shows the existing key. If `accounts` already
    // exists, leave it alone. (Trimming happens in normalizeAccounts at
    // save time, not here.)
    if (
      (!cloned.accounts || cloned.accounts.length === 0) &&
      cloned.api_key &&
      cloned.api_key.trim().length > 0
    ) {
      cloned.accounts = [{ apiKey: cloned.api_key, label: "" }];
    } else if (!cloned.accounts) {
      cloned.accounts = [];
    }
    if (!cloned.rotation) {
      cloned.rotation = "error";
    }
    setEditingIdx(idx);
    setEditingData(cloned);
    setIsNew(false);
    setShowKey(false);
    setNameError(null);
    setKeyError(null);
  };

  const handleSave = async () => {
    if (!editingData) return;

    if (!editingData.name || !editingData.name.trim()) {
      setNameError(t("providers.name_required"));
      return;
    }

    const trimmed = editingData.name.trim();
    const duplicate = providers.some((p, i) => {
      if (!isNew && i === editingIdx) return false;
      return p.name.toLowerCase() === trimmed.toLowerCase();
    });
    if (duplicate) {
      setNameError(t("providers.name_duplicate"));
      return;
    }

    const hasLegacyKey = !!(editingData.api_key && editingData.api_key.trim());
    const hasAccountKeys = (editingData.accounts ?? []).some(
      (a) => a.apiKey && a.apiKey.trim().length > 0
    );
    if (!hasLegacyKey && !hasAccountKeys) {
      setKeyError(t("providers.api_key_required"));
      return;
    }

    // Normalize the account pool + legacy key before persisting. See
    // normalizeAccounts for the collapse rules.
    const normalized = normalizeAccounts({
      api_key: editingData.api_key,
      accounts: editingData.accounts,
      rotation: editingData.rotation,
    });
    const toSave: Provider = {
      ...editingData,
      api_key: normalized.api_key,
      accounts: normalized.accounts,
      rotation: normalized.rotation,
    };

    const list = [...providers];
    if (isNew) {
      list.push(toSave);
    } else if (editingIdx !== null) {
      list[editingIdx] = toSave;
    }
    if (!config) return;
    setConfig({ ...config, Providers: list });
    try {
      await save();
      setEditingIdx(null);
      setEditingData(null);
      setIsNew(false);
      show(t("app.save") + " ✓", "success");
    } catch (e) {
      show(`Save failed: ${(e as Error).message}`, "error");
    }
  };

  const handleCancel = () => {
    setEditingIdx(null);
    setEditingData(null);
    setIsNew(false);
    setNameError(null);
    setKeyError(null);
  };

  const handleDelete = (idx: number) => {
    setDeletingIdx(idx);
  };

  const confirmDelete = async () => {
    if (deletingIdx === null) return;
    if (!config) return;
    const list = providers.filter((_, i) => i !== deletingIdx);
    setConfig({ ...config, Providers: list });
    try {
      await save();
      setDeletingIdx(null);
      show(t("providers.delete") + " ✓", "success");
    } catch (e) {
      show(`Save failed: ${(e as Error).message}`, "error");
    }
  };

  const filtered = providers.filter((p) => {
    if (!search) return true;
    const term = search.toLowerCase();
    if (p.name.toLowerCase().includes(term)) return true;
    if (p.api_base_url.toLowerCase().includes(term)) return true;
    if (p.models.some((m) => m.toLowerCase().includes(term))) return true;
    return false;
  });

  const addLabel = t("providers.header.add");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("providers.title")}
        subtitle={t("providers.subtitle")}
        action={
          <Button size="sm" onClick={handleAdd}>
            <Plus className="h-3.5 w-3.5" />
            {addLabel}
          </Button>
        }
      />

      {filtered.length === 0 ? (
        providers.length === 0 ? (
          <EmptyState
            glass
            title={t("providers.empty.title")}
            description={t("providers.empty.description")}
            action={
              <Button size="sm" onClick={handleAdd}>
                <Plus className="h-3.5 w-3.5" />
                {addLabel}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t("providers.no_results_title")}
            description={t("providers.no_results_description")}
          />
        )
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("providers.search.placeholder")}
                aria-label={t("providers.search.placeholder")}
                className="pl-8"
              />
            </div>
            <span className="text-[12px] text-ink-muted">
              {t("providers.count", {
                count: filtered.length,
                total: providers.length,
              })}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filtered.map((p) => {
              const realIdx = providers.indexOf(p);
              const modelCount = p.models?.length ?? 0;
              const transformerCount = p.transformer?.use?.length ?? 0;
              const hasKey = !!(p.api_key && p.api_key.trim().length > 0);
              return (
                <div
                  key={realIdx}
                  className="group rounded-md border border-line bg-surface p-5 transition-colors hover:border-line-strong"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={p.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-serif text-[16px] leading-tight tracking-[-0.01em] text-ink truncate">
                        {p.name || (
                          <span className="italic text-ink-subtle">
                            {t("providers.unnamed")}
                          </span>
                        )}
                      </h3>
                      <p className="mt-1 truncate font-mono text-[11px] italic text-ink-muted">
                        {hostnameFromUrl(p.api_base_url)}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleEdit(realIdx)}
                        aria-label={t("providers.actions.edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(realIdx)}
                        aria-label={t("providers.actions.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <StatusPill
                      status={hasKey ? "active" : "inactive"}
                      label={t(
                        hasKey
                          ? "providers.status.active"
                          : "providers.status.inactive"
                      )}
                    />
                    {modelCount > 0 && (
                      <Badge variant="outline" className="font-mono">
                        {t("providers.models_count", { count: modelCount })}
                      </Badge>
                    )}
                    {transformerCount > 0 && (
                      <Badge variant="default" className="font-mono">
                        {t("providers.transformer_count", {
                          count: transformerCount,
                        })}
                      </Badge>
                    )}
                  </div>

                  {p.models && p.models.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {p.models.slice(0, 3).map((m) => (
                        <span
                          key={m}
                          className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-muted ring-1 ring-inset ring-line"
                        >
                          {m}
                        </span>
                      ))}
                      {p.models.length > 3 && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-ink-subtle ring-1 ring-inset ring-line">
                          +{p.models.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {hasKey && (
                    <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-3 font-mono text-[11px] text-ink-muted">
                      <KeyRound className="h-3 w-3 text-ink-subtle" />
                      <span className="truncate">{maskKey(p.api_key)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <ProviderEditDialog
        open={editingIdx !== null}
        onOpenChange={(o) => !o && handleCancel()}
        data={editingData}
        onChange={setEditingData}
        isNew={isNew}
        templates={templates}
        availableTransformers={availableTransformers}
        providerParamInputs={providerParamInputs}
        setProviderParamInputs={setProviderParamInputs}
        modelParamInputs={modelParamInputs}
        setModelParamInputs={setModelParamInputs}
        showKey={showKey}
        setShowKey={setShowKey}
        nameError={nameError}
        setNameError={setNameError}
        keyError={keyError}
        isNameDuplicate={isProviderNameDuplicate}
        onSave={handleSave}
        onCancel={handleCancel}
      />

      <ConfirmDialog
        open={deletingIdx !== null}
        onOpenChange={(o) => !o && setDeletingIdx(null)}
        title={t("providers.delete")}
        description={t("providers.delete_provider_confirm")}
        confirmLabel={t("providers.delete")}
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  );
}

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Provider | null;
  onChange: (data: Provider) => void;
  isNew: boolean;
  templates: ProviderTemplate[];
  availableTransformers: { name: string; endpoint: string | null }[];
  providerParamInputs: Record<string, { name: string; value: string }>;
  setProviderParamInputs: React.Dispatch<
    React.SetStateAction<Record<string, { name: string; value: string }>>
  >;
  modelParamInputs: Record<string, { name: string; value: string }>;
  setModelParamInputs: React.Dispatch<
    React.SetStateAction<Record<string, { name: string; value: string }>>
  >;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  nameError: string | null;
  setNameError: (e: string | null) => void;
  keyError: string | null;
  isNameDuplicate?: (name: string) => boolean;
  onSave: () => void;
  onCancel: () => void;
}

function ProviderEditDialog({
  open,
  onOpenChange,
  data,
  onChange,
  isNew,
  templates,
  availableTransformers,
  providerParamInputs,
  setProviderParamInputs,
  modelParamInputs,
  setModelParamInputs,
  showKey,
  setShowKey,
  nameError,
  setNameError,
  keyError,
  isNameDuplicate,
  onSave,
  onCancel,
}: EditDialogProps) {
  const { t } = useTranslation();
  const { show } = useToast();
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  // Fetched models from the provider's /v1/models endpoint. These are
  // shown in the ComboInput selector so the user can pick which ones
  // to add — fetched models are NOT auto-added to the selected list.
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  // Reset transient state when the dialog is opened for a different
  // provider (or a new one) so the spinner and fetched list don't
  // carry over from the previous provider.
  useEffect(() => {
    setIsFetchingModels(false);
    setAvailableModels([]);
  }, [open]);

  if (!data) return null;

  const set = (patch: Partial<Provider>) => onChange({ ...data, ...patch });

  const handleAddModel = (model: string) => {
    if (!model.trim()) return;
    const list = data.models ?? [];
    if (!list.includes(model.trim())) {
      set({ models: [...list, model.trim()] });
    }
  };

  const handleRemoveModel = (i: number) => {
    const list = [...(data.models ?? [])];
    list.splice(i, 1);
    set({ models: list });
  };

  const handleFetchModels = async () => {
    if (!data.api_base_url.trim() || !data.api_key.trim()) {
      show(t("providers.missing_credentials"), "error");
      return;
    }
    setIsFetchingModels(true);
    try {
      const models = await fetchProviderModels(
        data.api_base_url.trim(),
        data.api_key.trim()
      );
      // Store the fetched models in `availableModels` so the user can
      // pick which ones to add via the ComboInput selector. We do NOT
      // auto-merge them into `data.models` — the user explicitly opts
      // in to each model so the saved list reflects what they actually
      // want routed, not the entire provider catalog.
      setAvailableModels(models);
      const suffix = models.length === 1 ? "" : "s";
      show(
        `${t("providers.fetch_available_models")} (${models.length} model${suffix})`,
        "success"
      );
    } catch (err) {
      const message =
        err instanceof FetchProviderModelsError
          ? err.message
          : (err as Error)?.message ?? "Unknown error";
      // Append a hint that manual entry still works — many providers
      // (Anthropic, Google) don't expose /v1/models, so a failed fetch
      // is normal and the user shouldn't think the provider is broken.
      show(
        `${t("providers.fetch_models_failed")}: ${message}. ${t("providers.fetch_models_hint")}`,
        "error",
      );
    } finally {
      setIsFetchingModels(false);
    }
  };

  // Options for the model selector: fetched models that the user has
  // not already selected. Selected models are hidden from the dropdown
  // because clicking them would be a no-op (handleAddModel dedupes).
  // The text input is always available for entering a name that's
  // missing from the fetched list.
  const selectorOptions = useMemo(() => {
    const selected = new Set(
      (data.models ?? []).map((m) => m.toLowerCase())
    );
    return availableModels
      .filter((m) => !selected.has(m.toLowerCase()))
      .map((m) => ({ label: m, value: m }));
  }, [availableModels, data.models]);

  const handleTemplateImport = (raw: string) => {
    if (!raw) return;
    try {
      const tpl = JSON.parse(raw);
      const next = { ...tpl };
      if (!isNew && data.name) next.name = data.name;
      onChange(next);
    } catch {
      // ignore
    }
  };

  const handleAddTransformer = (path: string) => {
    if (!path) return;
    const transformer = data.transformer ?? { use: [] };
    onChange({
      ...data,
      transformer: { ...transformer, use: [...(transformer.use ?? []), path] },
    });
  };

  const removeTransformerAt = (i: number) => {
    if (!data.transformer?.use) return;
    const use = [...data.transformer.use];
    use.splice(i, 1);
    const next: Provider = { ...data, transformer: { ...data.transformer, use } };
    if (use.length === 0 && Object.keys(data.transformer).length === 1) {
      delete next.transformer;
    }
    onChange(next);
  };

  const handleAddModelTransformer = (model: string, path: string) => {
    if (!path) return;
    const transformer = data.transformer ?? { use: [] };
    const modelTr = transformer[model] ?? { use: [] };
    onChange({
      ...data,
      transformer: {
        ...transformer,
        [model]: {
          ...(typeof modelTr === "object" ? modelTr : { use: [] }),
          use: [
            ...(((typeof modelTr === "object" && modelTr.use) as string[]) || []),
            path,
          ],
        },
      },
    });
  };

  const removeModelTransformerAt = (model: string, i: number) => {
    if (!data.transformer?.[model]?.use) return;
    const mt = data.transformer[model];
    const use = [...(mt.use ?? [])];
    use.splice(i, 1);
    const nextMt = { ...mt, use };
    const nextTransformer: ProviderTransformer = { ...data.transformer, [model]: nextMt };
    if (use.length === 0) {
      delete (nextTransformer as Record<string, unknown>)[model];
    }
    const next: Provider = { ...data, transformer: nextTransformer };
    if (Object.keys(nextTransformer).length === 0) {
      delete next.transformer;
    }
    onChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <div className="flex h-[80vh] flex-col gap-0">
          <div className="border-b border-line p-5">
            <div className="flex items-center gap-2">
              <Avatar name={data.name || "?"} size={32} />
              <div>
                <div className="text-base font-semibold text-ink">
                  {isNew ? t("providers.add") : t("providers.edit")}
                </div>
                <div className="text-xs text-ink-muted">
                  {data.name || t("providers.unnamed")}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Filter className="h-3 w-3" />
                  {t("providers.import_from_template")}
                </Label>
                <Combobox
                  options={templates.map((p) => ({
                    label: p.name,
                    value: JSON.stringify(p),
                  }))}
                  value=""
                  onChange={handleTemplateImport}
                  placeholder={t("providers.select_template")}
                  emptyPlaceholder={t("providers.no_templates_found")}
                />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{t("providers.name")}</Label>
                <Input
                  id="name"
                  value={data.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    set({ name: newName });
                    // Real-time duplicate-name check. We only show the
                    // duplicate error here (not the "required" error,
                    // which is reserved for the save attempt) so the
                    // user gets immediate feedback while typing.
                    if (newName.trim() && isNameDuplicate?.(newName)) {
                      setNameError(t("providers.name_duplicate"));
                    } else {
                      setNameError(null);
                    }
                  }}
                  className={cn(
                    nameError && "border-danger focus-visible:ring-danger/40"
                  )}
                  aria-describedby={nameError ? "name-error" : undefined}
                  aria-invalid={!!nameError}
                />
                {nameError && (
                  <p id="name-error" role="alert" className="text-xs text-danger">
                    {nameError}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="api_base_url">{t("providers.api_base_url")}</Label>
                <Input
                  id="api_base_url"
                  value={data.api_base_url}
                  onChange={(e) => set({ api_base_url: e.target.value })}
                  className="font-mono"
                  placeholder="https://api.example.com/v1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api_key" className="flex items-center gap-1.5">
                <KeyRound className="h-3 w-3" />
                {t("providers.api_key")}
              </Label>
              <div className="relative">
                <Input
                  id="api_key"
                  type={showKey ? "text" : "password"}
                  value={data.api_key}
                  onChange={(e) => set({ api_key: e.target.value })}
                  className={cn(
                    "pr-10 font-mono",
                    keyError && "border-danger focus-visible:ring-danger/40"
                  )}
                  placeholder="$ENV_VAR"
                  aria-describedby={keyError ? "key-error" : undefined}
                  aria-invalid={!!keyError}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={
                    showKey ? t("providers.api_key_hide") : t("providers.api_key_show")
                  }
                >
                  {showKey ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              {keyError && (
                <p id="key-error" role="alert" className="text-xs text-danger">
                  {keyError}
                </p>
              )}
            </div>

            <AccountPoolSection
              accounts={data.accounts ?? []}
              rotation={data.rotation ?? "error"}
              onChangeAccounts={(accounts) => set({ accounts })}
              onChangeRotation={(rotation) => set({ rotation })}
            />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>{t("providers.models")}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleFetchModels}
                  disabled={isFetchingModels}
                  aria-label={t("providers.fetch_available_models")}
                >
                  {isFetchingModels ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t("providers.fetching_models")}
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3.5 w-3.5" />
                      {t("providers.fetch_available_models")}
                    </>
                  )}
                </Button>
              </div>
              <ComboInput
                options={selectorOptions}
                value=""
                onChange={() => undefined /* required by ComboInput; model is added via onEnter, not via controlled value */}
                onEnter={handleAddModel}
                inputPlaceholder={t("providers.models_placeholder")}
                emptyPlaceholder={
                  availableModels.length === 0
                    ? t("providers.models_selector_empty_no_fetch")
                    : t("providers.models_selector_empty_all_added")
                }
                searchPlaceholder={t("providers.models_selector_search")}
              />
              <p className="text-[11px] leading-relaxed text-ink-muted">
                {t("providers.models_selector_hint")}
              </p>
              {data.models && data.models.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {data.models.map((m, i) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink ring-1 ring-inset ring-line"
                    >
                      {m}
                      <button
                        type="button"
                        onClick={() => handleRemoveModel(i)}
                        aria-label={t("providers.actions.delete")}
                        className="text-ink-subtle transition-colors hover:text-danger"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Transformers */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <WorkflowIcon className="h-3 w-3" />
                {t("providers.provider_transformer")}
              </Label>
              <Combobox
                options={availableTransformers.map((tr) => ({
                  label: tr.name,
                  value: tr.name,
                }))}
                value=""
                onChange={handleAddTransformer}
                placeholder={t("providers.select_transformer")}
                emptyPlaceholder={t("providers.no_transformers")}
              />
              {data.transformer?.use && data.transformer.use.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {data.transformer.use.map((tr, ti) => (
                    <TransformerRow
                      key={ti}
                      label={
                        typeof tr === "string"
                          ? tr
                          : Array.isArray(tr)
                            ? String(tr[0])
                            : String(tr)
                      }
                      onRemove={() => removeTransformerAt(ti)}
                      onAddParam={(name, value) => {
                        const list: ProviderTransformer["use"] = [
                          ...(data.transformer?.use ?? []),
                        ];
                        const item = list[ti];
                        let next: ProviderTransformer["use"][number];
                        if (Array.isArray(item)) {
                          const arr = [...item];
                          if (
                            arr.length > 1 &&
                            typeof arr[1] === "object" &&
                            arr[1] !== null
                          ) {
                            arr[1] = {
                              ...(arr[1] as Record<string, unknown>),
                              [name]: value,
                            };
                          } else {
                            arr.splice(1, arr.length - 1, { [name]: value });
                          }
                          next = arr as ProviderTransformer["use"][number];
                        } else {
                          next = [item, { [name]: value }];
                        }
                        list[ti] = next;
                        onChange({
                          ...data,
                          transformer: { ...data.transformer!, use: list },
                        });
                      }}
                      paramKey={`provider-transformer-${ti}`}
                      paramInputs={providerParamInputs}
                      setParamInputs={setProviderParamInputs}
                      existingParams={
                        Array.isArray(data.transformer?.use?.[ti]) &&
                        typeof (data.transformer!.use[ti] as unknown[])[1] ===
                          "object"
                          ? ((data.transformer!.use[ti] as unknown[])[1] as Record<
                              string,
                              unknown
                            >)
                          : {}
                      }
                      onRemoveParam={(name) => {
                        const list: ProviderTransformer["use"] = [
                          ...(data.transformer?.use ?? []),
                        ];
                        const item = list[ti];
                        if (Array.isArray(item) && typeof item[1] === "object") {
                          const params = { ...(item[1] as Record<string, unknown>) };
                          delete params[name];
                          const arr = [...item];
                          if (Object.keys(params).length === 0) {
                            arr.splice(1, 1);
                          } else {
                            arr[1] = params;
                          }
                          list[ti] = arr as ProviderTransformer["use"][number];
                          onChange({
                            ...data,
                            transformer: { ...data.transformer!, use: list },
                          });
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Model transformers */}
            {data.models && data.models.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Server className="h-3 w-3" />
                  {t("providers.model_transformers")}
                </Label>
                <div className="space-y-3">
                  {data.models.map((model) => {
                    const mt = data.transformer?.[model];
                    const use: unknown[] =
                      (typeof mt === "object" && (mt as { use?: unknown[] })?.use) ||
                      [];
                    return (
                      <div
                        key={model}
                        className="rounded-md border border-line p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-mono text-xs font-medium text-ink">
                            {model}
                          </div>
                          <Badge variant="default">
                            {t("providers.transformer_count", { count: use.length })}
                          </Badge>
                        </div>
                        <Combobox
                          options={availableTransformers.map((tr) => ({
                            label: tr.name,
                            value: tr.name,
                          }))}
                          value=""
                          onChange={(v) => handleAddModelTransformer(model, v)}
                          placeholder={t("providers.select_transformer")}
                          emptyPlaceholder={t("providers.no_transformers")}
                        />
                        {use.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            {use.map((tr, ti) => (
                              <TransformerRow
                                key={ti}
                                label={
                                  typeof tr === "string"
                                    ? tr
                                    : Array.isArray(tr)
                                      ? String(tr[0])
                                      : String(tr)
                                }
                                onRemove={() => removeModelTransformerAt(model, ti)}
                                onAddParam={(name, value) => {
                                  const list: ProviderTransformer["use"] = [
                                    ...(data.transformer?.[model]?.use ?? []),
                                  ];
                                  const item = list[ti];
                                  let next: ProviderTransformer["use"][number];
                                  if (Array.isArray(item)) {
                                    const arr = [...item];
                                    if (
                                      arr.length > 1 &&
                                      typeof arr[1] === "object" &&
                                      arr[1] !== null
                                    ) {
                                      arr[1] = {
                                        ...(arr[1] as Record<string, unknown>),
                                        [name]: value,
                                      };
                                    } else {
                                      arr.splice(1, arr.length - 1, { [name]: value });
                                    }
                                    next = arr as ProviderTransformer["use"][number];
                                  } else {
                                    next = [item, { [name]: value }];
                                  }
                                  list[ti] = next;
                                  const transformer: ProviderTransformer = {
                                    ...(data.transformer ?? { use: [] }),
                                    [model]: {
                                      ...(data.transformer?.[model] ?? { use: [] }),
                                      use: list,
                                    },
                                  };
                                  onChange({ ...data, transformer });
                                }}
                                paramKey={`model-${model}-transformer-${ti}`}
                                paramInputs={modelParamInputs}
                                setParamInputs={setModelParamInputs}
                                existingParams={
                                  Array.isArray(
                                    data.transformer?.[model]?.use?.[ti]
                                  ) &&
                                  typeof (data.transformer![model]!.use![ti] as unknown[])[1] ===
                                    "object"
                                    ? ((data.transformer![model]!.use![ti] as unknown[])[1] as Record<
                                        string,
                                        unknown
                                      >)
                                    : {}
                                }
                                onRemoveParam={(name) => {
                                  const list: ProviderTransformer["use"] = [
                                    ...(data.transformer?.[model]?.use ?? []),
                                  ];
                                  const item = list[ti];
                                  if (Array.isArray(item) && typeof item[1] === "object") {
                                    const params = { ...(item[1] as Record<string, unknown>) };
                                    delete params[name];
                                    const arr = [...item];
                                    if (Object.keys(params).length === 0) {
                                      arr.splice(1, 1);
                                    } else {
                                      arr[1] = params;
                                    }
                                    list[ti] = arr as ProviderTransformer["use"][number];
                                    const transformer: ProviderTransformer = {
                                      ...(data.transformer ?? { use: [] }),
                                      [model]: {
                                        ...(data.transformer?.[model] ?? { use: [] }),
                                        use: list,
                                      },
                                    };
                                    onChange({ ...data, transformer });
                                  }
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3">
            <Button variant="outline" onClick={onCancel}>
              {t("app.cancel")}
            </Button>
            <Button onClick={onSave}>{t("app.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TransformerRow({
  label,
  onRemove,
  onAddParam,
  onRemoveParam,
  paramKey,
  paramInputs,
  setParamInputs,
  existingParams,
}: {
  label: string;
  onRemove: () => void;
  onAddParam: (name: string, value: string) => void;
  onRemoveParam: (name: string) => void;
  paramKey: string;
  paramInputs: Record<string, { name: string; value: string }>;
  setParamInputs: React.Dispatch<
    React.SetStateAction<Record<string, { name: string; value: string }>>
  >;
  existingParams: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded border border-line bg-surface-2 p-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-mono text-xs text-ink">{label}</span>
        <Button variant="ghost" size="icon-sm" onClick={onRemove}>
          <Trash2 className="h-3 w-3 text-danger" />
        </Button>
      </div>
      <div className="flex gap-1.5">
        <Input
          placeholder={t("providers.param_placeholder")}
          value={paramInputs[paramKey]?.name ?? ""}
          onChange={(e) =>
            setParamInputs((prev) => ({
              ...prev,
              [paramKey]: {
                name: e.target.value,
                value: prev[paramKey]?.value ?? "",
              },
            }))
          }
          className="h-7 text-xs"
        />
        <Input
          placeholder={t("providers.value_placeholder")}
          value={paramInputs[paramKey]?.value ?? ""}
          onChange={(e) =>
            setParamInputs((prev) => ({
              ...prev,
              [paramKey]: {
                name: prev[paramKey]?.name ?? "",
                value: e.target.value,
              },
            }))
          }
          className="h-7 text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const cur = paramInputs[paramKey];
            if (cur?.name && cur?.value) {
              onAddParam(cur.name, cur.value);
              setParamInputs((prev) => ({
                ...prev,
                [paramKey]: { name: "", value: "" },
              }));
            }
          }}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {Object.keys(existingParams).length > 0 && (
        <div className="space-y-1">
          {Object.entries(existingParams).map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between rounded bg-surface px-2 py-1 text-xs"
            >
              <span className="font-mono">
                <span className="text-ink-muted">{k}:</span>{" "}
                <span className="text-ink">{String(v)}</span>
              </span>
              <button
                type="button"
                onClick={() => onRemoveParam(k)}
                aria-label={t("providers.actions.delete")}
                className="text-ink-subtle hover:text-danger"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface AccountPoolSectionProps {
  accounts: ProviderAccount[];
  rotation: "error" | "quota";
  onChangeAccounts: (next: ProviderAccount[]) => void;
  onChangeRotation: (next: "error" | "quota") => void;
}

/**
 * Account pool editor. Renders one row per `ProviderAccount` (an
 * `apiKey` + optional `label`) plus an "Add account" button. A
 * `<select>` below the rows lets the user pick the rotation strategy.
 *
 * The legacy `api_key` field on the provider itself (rendered above
 * this section) acts as the first/legacy entry; this section is for
 * additional accounts. Save-time normalization in `handleSave`
 * collapses a single account that matches the legacy key back to the
 * legacy shape, and clears the legacy key when 2+ accounts remain.
 */
function AccountPoolSection({
  accounts,
  rotation,
  onChangeAccounts,
  onChangeRotation,
}: AccountPoolSectionProps) {
  const { t } = useTranslation();
  const count = accounts.length;

  const updateAt = (i: number, patch: Partial<ProviderAccount>) => {
    const next = accounts.map((a, idx) => (idx === i ? { ...a, ...patch } : a));
    onChangeAccounts(next);
  };

  const removeAt = (i: number) => {
    onChangeAccounts(accounts.filter((_, idx) => idx !== i));
  };

  const addRow = () => {
    onChangeAccounts([...accounts, { apiKey: "" }]);
  };

  return (
    <div className="space-y-2">
      <details
        className="rounded-md border border-line bg-surface-2/40 group"
        open={count > 0}
      >
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[13px] font-medium text-ink select-none list-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-ink-subtle" />
            {t("providers.account_pool")}
            {count > 0 && (
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-muted ring-1 ring-inset ring-line">
                {count}
              </span>
            )}
          </span>
          <span className="text-[11px] text-ink-subtle group-open:rotate-90 transition-transform">
            ›
          </span>
        </summary>
        <div className="space-y-3 px-3 pb-3 pt-1">
          <p className="text-[11px] leading-relaxed text-ink-muted">
            {t("providers.account_pool_hint")}
          </p>
          <div className="space-y-2">
            {accounts.map((acct, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-2 rounded border border-line bg-surface p-2 sm:grid-cols-[1fr_180px_auto]"
              >
                <Input
                  type="password"
                  value={acct.apiKey}
                  onChange={(e) => updateAt(i, { apiKey: e.target.value })}
                  placeholder="sk-…"
                  className="font-mono"
                  aria-label={t("providers.account_api_key")}
                />
                <Input
                  value={acct.label ?? ""}
                  onChange={(e) => updateAt(i, { label: e.target.value })}
                  placeholder={t("providers.account_label_placeholder")}
                  className="text-xs"
                  aria-label={t("providers.account_label")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeAt(i)}
                  aria-label={t("providers.account_remove_aria")}
                  className="justify-self-end"
                >
                  <X className="h-3.5 w-3.5 text-danger" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="w-full"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("providers.add_account")}
          </Button>
        </div>
      </details>

      <div className="space-y-1.5">
        <Label htmlFor="rotation" className="flex items-center gap-1.5">
          <RefreshCw className="h-3 w-3" />
          {t("providers.rotation")}
        </Label>
        <Select
          value={rotation}
          onValueChange={(v) => onChangeRotation(v as "error" | "quota")}
        >
          <SelectTrigger id="rotation" className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="error">{t("providers.rotation_error")}</SelectItem>
            <SelectItem value="quota">{t("providers.rotation_quota")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] leading-relaxed text-ink-muted">
          {t("providers.rotation_hint")}
        </p>
      </div>
    </div>
  );
}
