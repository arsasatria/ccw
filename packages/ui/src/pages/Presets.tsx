import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Store,
  Plus,
  Search,
  Trash2,
  Download,
  Loader2,
  Package,
  Github,
  Link as LinkIcon,
  Tag,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  Pencil,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { useToast } from "@/components/shell/ToastHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { DynamicConfigForm } from "@/components/preset/DynamicConfigForm";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// --- Types -----------------------------------------------------------------

interface InputOption {
  label: string;
  value: string | number | boolean;
  description?: string;
  disabled?: boolean;
}

interface RequiredInput {
  id: string;
  type?: "password" | "input" | "select" | "multiselect" | "confirm" | "editor" | "number";
  label?: string;
  prompt?: string;
  placeholder?: string;
  options?: InputOption[] | any;
  when?: any;
  defaultValue?: any;
  required?: boolean;
  validator?: RegExp | string;
  min?: number;
  max?: number;
  rows?: number;
  dependsOn?: string[];
}

interface PresetMetadata {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  ccwVersion?: string;
  source?: string;
  sourceType?: "local" | "gist" | "registry";
  checksum?: string;
  installed: boolean;
}

interface PresetDetail extends PresetMetadata {
  config?: any;
  schema?: RequiredInput[];
  template?: any;
  configMappings?: any[];
  userValues?: Record<string, any>;
}

interface MarketPreset {
  id: string;
  name: string;
  author?: string;
  description?: string;
  repo: string;
}

// --- Page ------------------------------------------------------------------

export default function PresetsPage() {
  const { t } = useTranslation();
  const { show } = useToast();

  const [tab, setTab] = React.useState<"installed" | "market">("installed");

  const [presets, setPresets] = React.useState<PresetMetadata[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");

  // Install dialog
  const [installOpen, setInstallOpen] = React.useState(false);
  const [installUrl, setInstallUrl] = React.useState("");
  const [installName, setInstallName] = React.useState("");
  const [isInstalling, setIsInstalling] = React.useState(false);

  // Detail / apply
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<PresetDetail | null>(null);
  const [secrets, setSecrets] = React.useState<Record<string, any>>({});
  const [isApplying, setIsApplying] = React.useState(false);

  // Market
  const [marketPresets, setMarketPresets] = React.useState<MarketPreset[]>([]);
  const [marketLoading, setMarketLoading] = React.useState(false);
  const [marketSearch, setMarketSearch] = React.useState("");
  const [installingFromMarket, setInstallingFromMarket] = React.useState<string | null>(null);

  // Delete
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // --- Data loaders --------------------------------------------------------

  const loadPresets = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.getPresets();
      setPresets(response.presets || []);
    } catch (err) {
      console.error(err);
      show(t("presets.load_presets_failed"), "error");
    } finally {
      setLoading(false);
    }
  }, [show, t]);

  const loadMarketPresets = React.useCallback(async () => {
    setMarketLoading(true);
    try {
      const response = await api.getMarketPresets();
      setMarketPresets(response.presets || []);
    } catch (err) {
      console.error(err);
      show(t("presets.load_market_failed"), "error");
    } finally {
      setMarketLoading(false);
    }
  }, [show, t]);

  React.useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  React.useEffect(() => {
    if (tab === "market" && marketPresets.length === 0) {
      loadMarketPresets();
    }
  }, [tab, marketPresets.length, loadMarketPresets]);

  // --- Detail ---------------------------------------------------------------

  const openDetail = async (preset: PresetMetadata) => {
    try {
      const detail = await api.getPreset(preset.id);
      const merged: PresetDetail = { ...preset, ...detail };
      setSelected(merged);

      if (detail.schema && detail.schema.length > 0) {
        const initial: Record<string, any> = {};
        for (const input of detail.schema) {
          if (detail.userValues && detail.userValues[input.id] !== undefined) {
            initial[input.id] = detail.userValues[input.id];
          } else {
            initial[input.id] = input.defaultValue ?? "";
          }
        }
        setSecrets(initial);
      } else {
        setSecrets({});
      }
      setDetailOpen(true);
    } catch (err) {
      console.error(err);
      show(t("presets.load_preset_details_failed"), "error");
    }
  };

  // --- Apply preset --------------------------------------------------------

  const handleApplyPreset = async (values?: Record<string, any>) => {
    if (!selected) return;
    const inputValues = values || secrets;

    // Simple required-check (DynamicConfigForm already validates per-field)
    if (selected.schema && selected.schema.length > 0) {
      for (const input of selected.schema) {
        const value = inputValues[input.id];
        const isEmpty =
          value === undefined ||
          value === null ||
          value === "" ||
          (Array.isArray(value) && value.length === 0);
        if (input.required !== false && isEmpty) {
          show(
            t("presets.please_fill_field", { field: input.label || input.id }),
            "warning"
          );
          return;
        }
      }
    }

    setIsApplying(true);
    try {
      await api.applyPreset(selected.id, inputValues);
      show(t("presets.preset_applied"), "success");
      setDetailOpen(false);
      setSecrets({});
      await loadPresets();
    } catch (err: any) {
      console.error(err);
      show(
        t("presets.preset_apply_failed", { error: err?.message || "" }),
        "error"
      );
    } finally {
      setIsApplying(false);
    }
  };

  // --- Install from URL ----------------------------------------------------

  const handleInstall = async () => {
    if (!installUrl) {
      show(t("presets.please_provide_url"), "warning");
      return;
    }

    setIsInstalling(true);
    try {
      const installResult = await api.installPresetFromGitHub(installUrl, installName || undefined);

      try {
        const actualName = installResult?.presetName || installName || installUrl;
        const detail = await api.getPreset(actualName);

        if (detail.schema && detail.schema.length > 0) {
          const initial: Record<string, any> = {};
          for (const input of detail.schema) {
            if (detail.userValues && detail.userValues[input.id] !== undefined) {
              initial[input.id] = detail.userValues[input.id];
            } else {
              initial[input.id] = input.defaultValue ?? "";
            }
          }
          setSecrets(initial);
          setSelected({
            id: actualName,
            name: detail.name || actualName,
            version: detail.version || "1.0.0",
            installed: true,
            ...detail,
          });

          setInstallOpen(false);
          setInstallUrl("");
          setInstallName("");
          setDetailOpen(true);
          show(t("presets.preset_installed_config_required"), "warning");
        } else {
          setInstallOpen(false);
          setInstallUrl("");
          setInstallName("");
          show(t("presets.preset_installed"), "success");
          await loadPresets();
        }
      } catch (err) {
        console.error(err);
        setInstallOpen(false);
        setInstallUrl("");
        setInstallName("");
        show(t("presets.preset_installed"), "success");
        await loadPresets();
      }
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || "";
      if (msg.includes("already installed") || msg.includes("已安装")) {
        show(t("presets.preset_already_installed"), "warning");
      } else {
        show(t("presets.preset_install_failed", { error: msg }), "error");
      }
    } finally {
      setIsInstalling(false);
    }
  };

  // --- Install from market -------------------------------------------------

  const handleInstallFromMarket = async (preset: MarketPreset) => {
    setInstallingFromMarket(preset.id);
    try {
      const installResult = await api.installPresetFromGitHub(preset.repo);

      try {
        const actualName = installResult?.presetName || preset.name;
        const detail = await api.getPreset(actualName);
        const merged: PresetDetail = { ...preset, ...detail, id: actualName };

        if (detail.schema && detail.schema.length > 0) {
          const initial: Record<string, any> = {};
          for (const input of detail.schema) {
            if (detail.userValues && detail.userValues[input.id] !== undefined) {
              initial[input.id] = detail.userValues[input.id];
            } else {
              initial[input.id] = input.defaultValue ?? "";
            }
          }
          setSecrets(initial);
          setSelected(merged);
          setDetailOpen(true);
          show(t("presets.preset_installed_config_required"), "warning");
        } else {
          show(t("presets.preset_installed"), "success");
          await loadPresets();
        }
      } catch (err) {
        console.error(err);
        show(t("presets.preset_installed"), "success");
        await loadPresets();
      }
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || "";
      if (msg.includes("already installed") || msg.includes("已安装")) {
        show(t("presets.preset_already_installed"), "warning");
      } else {
        show(t("presets.preset_install_failed", { error: msg }), "error");
      }
    } finally {
      setInstallingFromMarket(null);
    }
  };

  // --- Delete --------------------------------------------------------------

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await api.deletePreset(deletingId);
      show(t("presets.preset_deleted"), "success");
      setDeletingId(null);
      await loadPresets();
    } catch (err: any) {
      console.error(err);
      show(
        t("presets.preset_delete_failed", { error: err?.message || "" }),
        "error"
      );
    }
  };

  // --- Derived -------------------------------------------------------------

  const filteredInstalled = presets.filter((p) =>
    [p.name, p.description, p.author]
      .filter(Boolean)
      .some((s) => s!.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredMarket = marketPresets.filter((p) =>
    [p.name, p.description, p.author]
      .filter(Boolean)
      .some((s) => s!.toLowerCase().includes(marketSearch.toLowerCase()))
  );

  const isMarketInstalled = (p: MarketPreset) =>
    presets.some((inst) => {
      let repo = "";
      if (inst.repository) {
        repo = inst.repository
          .replace(/^https:\/\/github\.com\//, "")
          .replace(/\.git$/, "");
      }
      return repo === p.repo || inst.name === p.name;
    });

  // --- Render --------------------------------------------------------------

  return (
    <AppShell
      title={t("presets.title")}
      subtitle={t("presets.market_description")}
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTab("market")}
            className={cn(tab === "market" && "border-border-strong bg-surface-2")}
          >
            <Store className="h-3.5 w-3.5" />
            {t("presets.market_title")}
          </Button>
          <Button
            size="sm"
            onClick={() => setInstallOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("presets.install")}
          </Button>
        </>
      }
    >
      {/* Tabs */}
      <div className="cc-card mb-3 flex items-center gap-1 p-1">
        <button
          onClick={() => setTab("installed")}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "installed"
              ? "bg-surface-3 text-fg"
              : "text-fg-muted hover:text-fg"
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            {t("presets.title")}
            <Badge variant="default" className="ml-1 font-mono text-[10px]">
              {presets.length}
            </Badge>
          </span>
        </button>
        <button
          onClick={() => setTab("market")}
          className={cn(
            "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            tab === "market"
              ? "bg-surface-3 text-fg"
              : "text-fg-muted hover:text-fg"
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5" />
            {t("presets.market_title")}
          </span>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
        <Input
          placeholder={
            tab === "installed"
              ? t("presets.search_placeholder")
              : t("presets.search_placeholder")
          }
          value={tab === "installed" ? search : marketSearch}
          onChange={(e) =>
            tab === "installed" ? setSearch(e.target.value) : setMarketSearch(e.target.value)
          }
          className="pl-9"
        />
      </div>

      {/* INSTALLED */}
      {tab === "installed" && (
        <>
          {loading ? (
            <div className="cc-card divide-y divide-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-9 w-9 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredInstalled.length === 0 ? (
            <EmptyState
              title={
                presets.length === 0
                  ? t("presets.no_presets")
                  : t("presets.no_presets_found")
              }
              description={
                presets.length === 0
                  ? t("presets.no_presets_hint")
                  : t("presets.no_presets_found_hint")
              }
              action={
                <Button size="sm" onClick={() => setInstallOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  {t("presets.install")}
                </Button>
              }
            />
          ) : (
            <div className="cc-card divide-y divide-border">
              {filteredInstalled.map((p) => (
                <PresetRow
                  key={p.id}
                  preset={p}
                  onView={() => openDetail(p)}
                  onDelete={() => setDeletingId(p.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* MARKET */}
      {tab === "market" && (
        <>
          {marketLoading ? (
            <div className="cc-card divide-y divide-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="h-9 w-9 rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredMarket.length === 0 ? (
            <EmptyState
              title={t("presets.no_presets_found")}
              description={t("presets.no_presets_found_hint")}
            />
          ) : (
            <div className="cc-card divide-y divide-border">
              {filteredMarket.map((p) => {
                const installed = isMarketInstalled(p);
                const busy = installingFromMarket === p.id;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-fg">
                          {p.name}
                        </span>
                        {installed && (
                          <Badge variant="success" className="font-mono text-[10px]">
                            {t("presets.installed_label")}
                          </Badge>
                        )}
                      </div>
                      {p.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-fg-muted">
                          {p.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-subtle">
                        {p.author && (
                          <span>{t("presets.by", { author: p.author })}</span>
                        )}
                        {p.repo && (
                          <a
                            href={`https://github.com/${p.repo}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:text-fg"
                          >
                            <Github className="h-3 w-3" />
                            <span className="font-mono">{p.repo}</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={installed ? "secondary" : "default"}
                      disabled={installed || busy}
                      onClick={() => handleInstallFromMarket(p)}
                    >
                      {busy ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t("presets.installing")}
                        </>
                      ) : installed ? (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {t("presets.installed_label")}
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          {t("presets.install")}
                        </>
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Install dialog ----------------------------------------------------- */}
      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand">
                <LinkIcon className="h-3.5 w-3.5" />
              </div>
              {t("presets.install_dialog_title")}
            </DialogTitle>
            <DialogDescription>
              {t("presets.install_dialog_description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="preset-url">
                {t("presets.github_repository")}
              </Label>
              <Input
                id="preset-url"
                type="url"
                placeholder={t("presets.preset_url_placeholder")}
                value={installUrl}
                onChange={(e) => setInstallUrl(e.target.value)}
                className="cc-text-mono"
              />
              <p className="text-xs text-fg-muted">
                {t("presets.github_url_hint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="preset-name">{t("presets.preset_name")}</Label>
              <Input
                id="preset-name"
                placeholder={t("presets.preset_name_placeholder")}
                value={installName}
                onChange={(e) => setInstallName(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallOpen(false)}>
              {t("app.cancel")}
            </Button>
            <Button onClick={handleInstall} disabled={isInstalling}>
              {isInstalling ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("presets.installing")}
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  {t("presets.install")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail / apply dialog --------------------------------------------- */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand">
                <Package className="h-3.5 w-3.5" />
              </div>
              <span>{selected?.name}</span>
              {selected?.version && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  v{selected.version}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1 py-1">
            {selected?.description && (
              <p className="text-sm text-fg-muted">{selected.description}</p>
            )}

            <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              {selected?.author && (
                <DetailRow icon={<Pencil className="h-3 w-3" />} label="Author" value={selected.author} />
              )}
              {selected?.homepage && (
                <DetailRow
                  icon={<ExternalLink className="h-3 w-3" />}
                  label="Homepage"
                  value={
                    <a
                      href={selected.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      {selected.homepage}
                    </a>
                  }
                />
              )}
              {selected?.repository && (
                <DetailRow
                  icon={<Github className="h-3 w-3" />}
                  label="Repository"
                  value={
                    <a
                      href={selected.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      {selected.repository}
                    </a>
                  }
                />
              )}
              {selected?.license && (
                <DetailRow
                  icon={<ShieldCheck className="h-3 w-3" />}
                  label="License"
                  value={selected.license}
                />
              )}
            </div>

            {selected?.keywords && selected.keywords.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <Tag className="h-3 w-3" />
                  Keywords
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.keywords.map((k) => (
                    <Badge key={k} variant="outline" className="font-mono text-[10px]">
                      {k}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {selected?.schema && selected.schema.length > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <div className="mb-3 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">
                  <ShieldCheck className="h-3 w-3" />
                  {t("presets.required_information")}
                </div>
                <DynamicConfigForm
                  schema={selected.schema}
                  presetConfig={selected.config || {}}
                  onSubmit={(values) => handleApplyPreset(values)}
                  onCancel={() => setDetailOpen(false)}
                  isSubmitting={isApplying}
                  initialValues={secrets}
                />
              </div>
            )}

            {selected && (!selected.schema || selected.schema.length === 0) && (
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
                <p className="text-xs text-fg-muted">
                  {t("presets.preset_installed")}
                </p>
                <Button
                  size="sm"
                  onClick={() => handleApplyPreset({})}
                  disabled={isApplying}
                >
                  {isApplying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3.5 w-3.5" />
                  )}
                  {t("presets.apply")}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation ----------------------------------------------- */}
      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(o) => !o && setDeletingId(null)}
        title={t("presets.delete_dialog_title")}
        description={t("presets.delete_dialog_description", {
          name: deletingId ?? "",
        })}
        confirmLabel={t("presets.delete")}
        destructive
        onConfirm={handleDelete}
      />
    </AppShell>
  );
}

// --- Sub-components --------------------------------------------------------

function PresetRow({
  preset,
  onView,
  onDelete,
}: {
  preset: PresetMetadata;
  onView: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
        <Package className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-fg">
            {preset.name}
          </span>
          <Badge variant="outline" className="font-mono text-[10px]">
            v{preset.version}
          </Badge>
          {preset.repository && (
            <a
              href={preset.repository}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-subtle transition-colors hover:text-fg"
            >
              <Github className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        {preset.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-fg-muted">
            {preset.description}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-subtle">
          {preset.author && (
            <span>{t("presets.by", { author: preset.author })}</span>
          )}
          {preset.license && (
            <>
              <span>·</span>
              <span className="font-mono">{preset.license}</span>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onView}
          title={t("presets.view_details")}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          title={t("presets.delete")}
        >
          <Trash2 className="h-3.5 w-3.5 text-danger" />
        </Button>
      </div>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-surface-2/50 px-3 py-2">
      <span className="mt-0.5 text-fg-subtle">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">
          {label}
        </div>
        <div className="truncate text-xs text-fg">{value}</div>
      </div>
    </div>
  );
}
