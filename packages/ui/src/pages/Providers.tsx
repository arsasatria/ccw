import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Trash2,
  Eye,
  EyeOff,
  XCircle,
  Cpu,
  X,
  ArrowRight,
  Globe,
  KeyRound,
  Workflow as WorkflowIcon,
  Server,
  Filter,
} from "lucide-react";

import { useConfig } from "@/components/ConfigProvider";
import { AppShell } from "@/components/shell/AppShell";
import { useToast } from "@/components/shell/ToastHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { ComboInput } from "@/components/ui/combo-input";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import { cn, hostnameFromUrl, maskKey } from "@/lib/utils";
import type { Provider, ProviderTransformer } from "@/types";

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
  const { config, setConfig } = useConfig();
  const { show } = useToast();
  const navigate = useNavigate();

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
    fetch("https://pub-0dc3e1677e894f07bbea11b17a29e032.r2.dev/providers.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTemplates(d || []))
      .catch(() => undefined);
  }, []);

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

  const handleAdd = () => {
    const data: Provider = {
      name: "",
      api_base_url: "",
      api_key: "",
      models: [],
    };
    setEditingIdx(providers.length);
    setEditingData(data);
    setIsNew(true);
    setShowKey(false);
    setNameError(null);
    setKeyError(null);
  };

  const handleEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditingData(JSON.parse(JSON.stringify(providers[idx])));
    setIsNew(false);
    setShowKey(false);
    setNameError(null);
    setKeyError(null);
  };

  const handleSave = () => {
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

    if (!editingData.api_key || !editingData.api_key.trim()) {
      setKeyError(t("providers.api_key_required"));
      return;
    }

    const list = [...providers];
    if (isNew) {
      list.push(editingData);
    } else if (editingIdx !== null) {
      list[editingIdx] = editingData;
    }
    setConfig({ ...config!, Providers: list });
    setEditingIdx(null);
    setEditingData(null);
    setIsNew(false);
    show(t("app.save") + " ✓", "success");
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

  const confirmDelete = () => {
    if (deletingIdx === null) return;
    const list = providers.filter((_, i) => i !== deletingIdx);
    setConfig({ ...config!, Providers: list });
    setDeletingIdx(null);
    show(t("providers.delete") + " ✓", "success");
  };

  const filtered = providers.filter((p) => {
    if (!search) return true;
    const term = search.toLowerCase();
    if (p.name?.toLowerCase().includes(term)) return true;
    if (p.api_base_url?.toLowerCase().includes(term)) return true;
    if (p.models?.some((m) => m.toLowerCase().includes(term))) return true;
    return false;
  });

  return (
    <AppShell
      title={t("providers.title")}
      subtitle={t("providers.subtitle", { count: providers.length })}
      actions={
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("providers.search")}
              className="h-8 w-56 pl-8"
            />
          </div>
          <Button size="sm" onClick={handleAdd}>
            <Plus className="h-3.5 w-3.5" />
            {t("providers.add")}
          </Button>
        </>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Cpu className="h-4 w-4" />}
          title={
            providers.length === 0
              ? t("providers.empty_title")
              : t("providers.no_results_title")
          }
          description={
            providers.length === 0
              ? t("providers.empty_description")
              : t("providers.no_results_description")
          }
          action={
            providers.length === 0 ? (
              <Button size="sm" onClick={handleAdd}>
                <Plus className="h-3.5 w-3.5" />
                {t("providers.add")}
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p, i) => {
            const realIdx = providers.indexOf(p);
            const transformerCount = p.transformer?.use?.length ?? 0;
            return (
              <button
                key={realIdx}
                onClick={() => handleEdit(realIdx)}
                className="cc-card group flex flex-col gap-3 p-4 text-left transition-all hover:border-border-strong hover:translate-y-[-1px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ProviderAvatar name={p.name} />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-fg truncate">
                        {p.name || (
                          <span className="text-fg-subtle italic">untitled</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-fg-subtle">
                        <Globe className="h-2.5 w-2.5" />
                        <span className="cc-text-mono truncate">
                          {hostnameFromUrl(p.api_base_url)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="info" className="font-mono">
                    {p.models?.length ?? 0} models
                  </Badge>
                  {transformerCount > 0 && (
                    <Badge variant="secondary" className="font-mono">
                      {transformerCount} transformers
                    </Badge>
                  )}
                </div>

                {p.models && p.models.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.models.slice(0, 3).map((m) => (
                      <span
                        key={m}
                        className="cc-text-mono rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-fg-muted ring-1 ring-inset ring-border"
                      >
                        {m}
                      </span>
                    ))}
                    {p.models.length > 3 && (
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-fg-subtle ring-1 ring-inset ring-border">
                        +{p.models.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <Separator />

                <div className="flex items-center justify-between text-[11px] text-fg-muted">
                  <span className="cc-text-mono">{maskKey(p.api_key)}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(realIdx);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
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
        keyError={keyError}
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
    </AppShell>
  );
}

function ProviderAvatar({ name }: { name: string }) {
  const letter = (name?.[0] ?? "?").toUpperCase();
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-brand-soft to-surface-2 text-sm font-semibold text-brand ring-1 ring-inset ring-border">
      {letter}
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
  keyError: string | null;
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
  keyError,
  onSave,
  onCancel,
}: EditDialogProps) {
  const { t } = useTranslation();

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
    <DialogShim open={open} onOpenChange={onOpenChange}>
      <div className="flex h-[80vh] flex-col gap-0">
        <div className="border-b border-border p-5">
          <div className="flex items-center gap-2">
            <ProviderAvatar name={data.name || "?"} />
            <div>
              <div className="text-base font-semibold text-fg">
                {isNew ? t("providers.add") : t("providers.edit")}
              </div>
              <div className="text-xs text-fg-muted">
                {data.name || "New provider"}
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
                onChange={(e) => set({ name: e.target.value })}
                className={cn(nameError && "border-danger focus-visible:ring-danger/40")}
              />
              {nameError && (
                <p className="text-xs text-danger">{nameError}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="api_base_url">{t("providers.api_base_url")}</Label>
              <Input
                id="api_base_url"
                value={data.api_base_url}
                onChange={(e) => set({ api_base_url: e.target.value })}
                className="cc-text-mono"
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
                  "cc-text-mono pr-10",
                  keyError && "border-danger focus-visible:ring-danger/40"
                )}
                placeholder="$ENV_VAR"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            {keyError && <p className="text-xs text-danger">{keyError}</p>}
          </div>

          <div className="space-y-2">
            <Label>{t("providers.models")}</Label>
            <ComboInput
              options={(data.models ?? []).map((m) => ({ label: m, value: m }))}
              value=""
              onChange={() => undefined}
              onEnter={handleAddModel}
              inputPlaceholder={t("providers.models_placeholder")}
            />
            {data.models && data.models.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {data.models.map((m, i) => (
                  <span
                    key={m}
                    className="cc-text-mono inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg ring-1 ring-inset ring-border"
                  >
                    {m}
                    <button
                      type="button"
                      onClick={() => handleRemoveModel(i)}
                      className="text-fg-subtle transition-colors hover:text-danger"
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
              options={availableTransformers.map((t) => ({
                label: t.name,
                value: t.name,
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
                    label={typeof tr === "string" ? tr : Array.isArray(tr) ? String(tr[0]) : String(tr)}
                    onRemove={() => removeTransformerAt(ti)}
                    onAddParam={(name, value) => {
                      const list: any[] = [...((data.transformer?.use as any[]) ?? [])];
                      const t = list[ti];
                      let next: any;
                      if (Array.isArray(t)) {
                        const arr = [...t];
                        if (arr.length > 1 && typeof arr[1] === "object" && arr[1] !== null) {
                          arr[1] = { ...(arr[1] as Record<string, unknown>), [name]: value };
                        } else {
                          arr.splice(1, arr.length - 1, { [name]: value });
                        }
                        next = arr;
                      } else {
                        next = [t, { [name]: value }];
                      }
                      list[ti] = next;
                      onChange({ ...data, transformer: { ...data.transformer!, use: list } });
                    }}
                    paramKey={`provider-transformer-${ti}`}
                    paramInputs={providerParamInputs}
                    setParamInputs={setProviderParamInputs}
                    existingParams={
                      Array.isArray(data.transformer?.use?.[ti]) &&
                      typeof (data.transformer!.use[ti] as unknown[])[1] === "object"
                        ? ((data.transformer!.use[ti] as unknown[])[1] as Record<string, unknown>)
                        : {}
                    }
                    onRemoveParam={(name) => {
                      const list: any[] = [...((data.transformer?.use as any[]) ?? [])];
                      const t = list[ti];
                      if (Array.isArray(t) && typeof t[1] === "object") {
                        const params = { ...(t[1] as Record<string, unknown>) };
                        delete params[name];
                        const arr = [...t];
                        if (Object.keys(params).length === 0) {
                          arr.splice(1, 1);
                        } else {
                          arr[1] = params;
                        }
                        list[ti] = arr;
                        onChange({ ...data, transformer: { ...data.transformer!, use: list } });
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
                  const use: any[] = (typeof mt === "object" && (mt as any)?.use) || [];
                  return (
                    <div
                      key={model}
                      className="rounded-md border border-border p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="cc-text-mono text-xs font-medium text-fg">
                          {model}
                        </div>
                        <Badge variant="secondary">
                          {use.length} transformers
                        </Badge>
                      </div>
                      <Combobox
                        options={availableTransformers.map((t) => ({
                          label: t.name,
                          value: t.name,
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
                                const list = [...((data.transformer?.[model]?.use as unknown[]) ?? [])];
                                const t = list[ti];
                                let next: unknown;
                                if (Array.isArray(t)) {
                                  const arr = [...t];
                                  if (arr.length > 1 && typeof arr[1] === "object" && arr[1] !== null) {
                                    arr[1] = { ...(arr[1] as Record<string, unknown>), [name]: value };
                                  } else {
                                    arr.splice(1, arr.length - 1, { [name]: value });
                                  }
                                  next = arr;
                                } else {
                                  next = [t as string, { [name]: value }];
                                }
                                list[ti] = next as never;
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
                                Array.isArray(data.transformer?.[model]?.use?.[ti]) &&
                                typeof (data.transformer![model]!.use![ti] as unknown[])[1] === "object"
                                  ? ((data.transformer![model]!.use![ti] as unknown[])[1] as Record<string, unknown>)
                                  : {}
                              }
                              onRemoveParam={(name) => {
                                const list = [...((data.transformer?.[model]?.use as unknown[]) ?? [])];
                                const t = list[ti];
                                if (Array.isArray(t) && typeof t[1] === "object") {
                                  const params = { ...(t[1] as Record<string, unknown>) };
                                  delete params[name];
                                  const arr = [...t];
                                  if (Object.keys(params).length === 0) {
                                    arr.splice(1, 1);
                                  } else {
                                    arr[1] = params;
                                  }
                                  list[ti] = arr as never;
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

        <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2 px-5 py-3">
          <Button variant="outline" onClick={onCancel}>
            {t("app.cancel")}
          </Button>
          <Button onClick={onSave}>{t("app.save")}</Button>
        </div>
      </div>
    </DialogShim>
  );
}

// Local Dialog wrapper using the new dialog component
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
function DialogShim({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        {children}
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
  return (
    <div className="rounded border border-border bg-surface-2 p-2 space-y-2">
      <div className="flex items-center gap-2">
        <span className="cc-text-mono flex-1 text-xs text-fg">{label}</span>
        <Button variant="ghost" size="icon-sm" onClick={onRemove}>
          <Trash2 className="h-3 w-3 text-danger" />
        </Button>
      </div>
      <div className="flex gap-1.5">
        <Input
          placeholder="param"
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
          placeholder="value"
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
              <span className="cc-text-mono">
                <span className="text-fg-muted">{k}:</span>{" "}
                <span className="text-fg">{String(v)}</span>
              </span>
              <button
                onClick={() => onRemoveParam(k)}
                className="text-fg-subtle hover:text-danger"
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
