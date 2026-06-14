import * as React from "react";
import { useTranslation } from "react-i18next";
import {
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
  ShieldCheck,
  Pencil,
  ArrowRight,
  Sparkles,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DynamicConfigForm } from "@/components/preset/DynamicConfigForm";
import type { RequiredInput } from "@/components/preset/DynamicConfigForm";
import { api } from "@/lib/api";

// --- Types -----------------------------------------------------------------

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
  config?: Record<string, unknown>;
  schema?: RequiredInput[];
  template?: unknown;
  configMappings?: unknown[];
  userValues?: Record<string, unknown>;
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
  const [secrets, setSecrets] = React.useState<Record<string, unknown>>({});
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
    if (tab === "market" && marketPresets.length === 0 && !marketLoading) {
      loadMarketPresets();
    }
  }, [tab, marketPresets.length, marketLoading, loadMarketPresets]);

  // --- Detail ---------------------------------------------------------------

  const openDetail = async (preset: PresetMetadata) => {
    try {
      const detail = (await api.getPreset(preset.id)) as PresetDetail;
      const merged: PresetDetail = { ...preset, ...detail };
      setSelected(merged);

      if (detail.schema && detail.schema.length > 0) {
        const initial: Record<string, unknown> = {};
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

  const handleApplyPreset = async (values?: Record<string, unknown>) => {
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
      await api.applyPreset(selected.id, inputValues as Record<string, string>);
      show(t("presets.preset_applied"), "success");
      setDetailOpen(false);
      setSecrets({});
      await loadPresets();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(err);
      show(
        t("presets.preset_apply_failed", { error: message }),
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
      const installResult = (await api.installPresetFromGitHub(
        installUrl,
        installName || undefined
      )) as { presetName?: string } | undefined;

      const actualName = installResult?.presetName || installName || installUrl;
      setInstallOpen(false);
      setInstallUrl("");
      setInstallName("");
      show(t("presets.preset_installed"), "success");
      await loadPresets();

      try {
        const detail = (await api.getPreset(actualName)) as PresetDetail;

        if (detail.schema && detail.schema.length > 0) {
          const initial: Record<string, unknown> = {};
          for (const input of detail.schema) {
            if (detail.userValues && detail.userValues[input.id] !== undefined) {
              initial[input.id] = detail.userValues[input.id];
            } else {
              initial[input.id] = input.defaultValue ?? "";
            }
          }
          setSecrets(initial);
          setSelected({
            ...detail,
            id: actualName,
            name: detail.name || actualName,
            version: detail.version || "1.0.0",
            installed: true,
          });

          setDetailOpen(true);
          show(t("presets.preset_installed_config_required"), "warning");
        }
      } catch (detailErr) {
        console.error(detailErr);
        show(t("presets.installed_open_manually"), "info");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(err);
      if (message.includes("already installed") || message.includes("已安装")) {
        show(t("presets.preset_already_installed"), "warning");
      } else {
        show(t("presets.preset_install_failed", { error: message }), "error");
      }
    } finally {
      setIsInstalling(false);
    }
  };

  // --- Install from market -------------------------------------------------

  const handleInstallFromMarket = async (preset: MarketPreset) => {
    setInstallingFromMarket(preset.id);
    try {
      const installResult = (await api.installPresetFromGitHub(
        preset.repo
      )) as { presetName?: string } | undefined;

      const actualName = installResult?.presetName || preset.name;
      show(t("presets.preset_installed"), "success");
      await loadPresets();

      try {
        const detail = (await api.getPreset(actualName)) as PresetDetail;
        const merged: PresetDetail = { ...preset, ...detail, id: actualName };

        if (detail.schema && detail.schema.length > 0) {
          const initial: Record<string, unknown> = {};
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
        }
      } catch (detailErr) {
        console.error(detailErr);
        show(t("presets.installed_open_manually"), "info");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(err);
      if (message.includes("already installed") || message.includes("已安装")) {
        show(t("presets.preset_already_installed"), "warning");
      } else {
        show(t("presets.preset_install_failed", { error: message }), "error");
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(err);
      show(
        t("presets.preset_delete_failed", { error: message }),
        "error"
      );
    }
  };

  // --- Derived -------------------------------------------------------------

  const filteredInstalled = presets.filter((p) =>
    [p.name, p.description, p.author]
      .filter((s): s is string => Boolean(s))
      .some((s) => s.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredMarket = marketPresets.filter((p) =>
    [p.name, p.description, p.author]
      .filter((s): s is string => Boolean(s))
      .some((s) => s.toLowerCase().includes(marketSearch.toLowerCase()))
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
    <div className="space-y-6">
      <PageHeader
        title={t("presets.title")}
        subtitle={t("presets.subtitle")}
        action={
          <Button size="sm" onClick={() => setInstallOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            {t("presets.install")}
          </Button>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "installed" | "market")}
      >
        <TabsList>
          <TabsTrigger value="installed" type="button">
            <Package className="h-3.5 w-3.5" />
            {t("presets.tabs.installed")}
            {presets.length > 0 && (
              <Badge variant="outline" className="ml-1.5 font-mono">
                {presets.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="market" type="button">
            <Sparkles className="h-3.5 w-3.5" />
            {t("presets.tabs.market")}
          </TabsTrigger>
        </TabsList>

        {/* INSTALLED */}
        <TabsContent value="installed" className="space-y-4">
          {loading ? (
            <InstalledSkeleton />
          ) : presets.length === 0 ? (
            <EmptyState
              glass
              title={t("presets.empty.installed.title")}
              description={t("presets.empty.installed.description")}
              action={
                <Button size="sm" onClick={() => setInstallOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  {t("presets.install")}
                </Button>
              }
            />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="relative w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("presets.search_installed_placeholder")}
                    aria-label={t("presets.search_installed_placeholder")}
                    className="pl-8"
                  />
                </div>
                <span className="text-[12px] text-ink-muted">
                  {t("presets.count", {
                    count: filteredInstalled.length,
                    total: presets.length,
                  })}
                </span>
              </div>

              {filteredInstalled.length === 0 ? (
                <EmptyState
                  title={t("presets.no_presets_found")}
                  description={t("presets.no_presets_found_hint")}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {filteredInstalled.map((p) => (
                    <InstalledCard
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
        </TabsContent>

        {/* MARKET */}
        <TabsContent value="market" className="space-y-6">
          <MarketFeaturedHero onBrowse={() => {
            document.getElementById("market-grid")?.scrollIntoView({ behavior: "smooth" });
          }} />

          {marketLoading ? (
            <InstalledSkeleton />
          ) : marketPresets.length === 0 ? (
            <EmptyState
              title={t("presets.empty.market_empty.title")}
              description={t("presets.empty.market_empty.description")}
            />
          ) : (
            <div id="market-grid" className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative w-full max-w-sm">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
                  <Input
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                    placeholder={t("presets.search_market_placeholder")}
                    aria-label={t("presets.search_market_placeholder")}
                    className="pl-8"
                  />
                </div>
                <span className="text-[12px] text-ink-muted">
                  {t("presets.count", {
                    count: filteredMarket.length,
                    total: marketPresets.length,
                  })}
                </span>
              </div>

              {filteredMarket.length === 0 ? (
                <EmptyState
                  title={t("presets.empty.market.title")}
                  description={t("presets.empty.market.description")}
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {filteredMarket.map((p) => {
                    const installed = isMarketInstalled(p);
                    const busy = installingFromMarket === p.id;
                    return (
                      <MarketCard
                        key={p.id}
                        preset={p}
                        installed={installed}
                        busy={busy}
                        onInstall={() => handleInstallFromMarket(p)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Install dialog ----------------------------------------------------- */}
      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-accent-3">
                <LinkIcon className="h-3.5 w-3.5" />
              </span>
              {t("presets.install_dialog_title")}
            </DialogTitle>
            <DialogDescription>
              {t("presets.install_dialog_description")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="preset-url">{t("presets.github_repository")}</Label>
              <Input
                id="preset-url"
                type="url"
                placeholder={t("presets.preset_url_placeholder")}
                value={installUrl}
                onChange={(e) => setInstallUrl(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-ink-muted">
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setInstallOpen(false)}
            >
              {t("app.cancel")}
            </Button>
            <Button type="button" onClick={handleInstall} disabled={isInstalling}>
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
              <Avatar name={selected?.name || "?"} size={28} />
              <span>{selected?.name}</span>
              {selected?.version && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  v{selected.version}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {t("presets.detail_dialog_description")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-1 py-1">
            {selected?.description && (
              <p className="text-sm text-ink-muted">{selected.description}</p>
            )}

            <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              {selected?.author && (
                <DetailRow
                  icon={<Pencil className="h-3 w-3" />}
                  label={t("presets.detail.author")}
                  value={selected.author}
                />
              )}
              {selected?.homepage && (
                <DetailRow
                  icon={<ExternalLink className="h-3 w-3" />}
                  label={t("presets.detail.homepage")}
                  value={
                    <a
                      href={selected.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-3 hover:underline"
                    >
                      {selected.homepage}
                    </a>
                  }
                />
              )}
              {selected?.repository && (
                <DetailRow
                  icon={<Github className="h-3 w-3" />}
                  label={t("presets.detail.repository")}
                  value={
                    <a
                      href={selected.repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-3 hover:underline"
                    >
                      {selected.repository}
                    </a>
                  }
                />
              )}
              {selected?.license && (
                <DetailRow
                  icon={<ShieldCheck className="h-3 w-3" />}
                  label={t("presets.detail.license")}
                  value={selected.license}
                />
              )}
            </div>

            {selected?.keywords && selected.keywords.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-subtle">
                  <Tag className="h-3 w-3" />
                  {t("presets.detail.keywords")}
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
              <div className="mt-6 border-t border-line pt-4">
                <div className="mb-3 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-subtle">
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
              <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
                <p className="text-xs text-ink-muted">
                  {t("presets.preset_installed")}
                </p>
                <Button
                  type="button"
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
    </div>
  );
}

// --- Sub-components --------------------------------------------------------

function InstalledSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-md border border-line bg-surface p-5 space-y-3"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

function InstalledCard({
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
    <div className="group rounded-md border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <Avatar name={preset.name} size={32} />
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[16px] leading-tight tracking-[-0.01em] text-ink truncate">
            {preset.name}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="font-mono">v{preset.version}</span>
            {preset.author && (
              <>
                <span>·</span>
                <span>{t("presets.by", { author: preset.author })}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onView}
            aria-label={t("presets.view_details")}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label={t("presets.delete")}
          >
            <Trash2 className="h-3.5 w-3.5 text-danger" />
          </Button>
        </div>
      </div>

      {preset.description && (
        <p className="mt-3 line-clamp-2 text-[12px] text-ink-muted">
          {preset.description}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <StatusPill
          status="active"
          label={t("presets.installed_label")}
        />
        {preset.license && (
          <Badge variant="outline" className="font-mono">
            {preset.license}
          </Badge>
        )}
        {preset.repository && (
          <a
            href={preset.repository}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-muted transition-colors hover:text-ink"
          >
            <Github className="h-3 w-3" />
            <span className="font-mono">{t("presets.repo")}</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function MarketCard({
  preset,
  installed,
  busy,
  onInstall,
}: {
  preset: MarketPreset;
  installed: boolean;
  busy: boolean;
  onInstall: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="group rounded-md border border-line bg-surface p-5 transition-colors hover:border-line-strong">
      <div className="flex items-start gap-3">
        <Avatar name={preset.name} size={32} />
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-[16px] leading-tight tracking-[-0.01em] text-ink truncate">
            {preset.name}
          </h3>
          {preset.author && (
            <p className="mt-0.5 font-mono text-[11px] italic text-ink-muted">
              {t("presets.by", { author: preset.author })}
            </p>
          )}
        </div>
        {installed ? (
          <StatusPill
            status="active"
            label={t("presets.installed_label")}
          />
        ) : null}
      </div>

      {preset.description && (
        <p className="mt-3 line-clamp-2 text-[12px] text-ink-muted">
          {preset.description}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
        {preset.repo ? (
          <a
            href={`https://github.com/${preset.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-w-0 items-center gap-1 text-[11px] text-ink-subtle transition-colors hover:text-ink"
          >
            <Github className="h-3 w-3 shrink-0" />
            <span className="truncate font-mono">{preset.repo}</span>
            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
          </a>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="sm"
          variant={installed ? "outline" : "default"}
          disabled={installed || busy}
          onClick={onInstall}
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
    </div>
  );
}

function MarketFeaturedHero({
  onBrowse,
}: {
  onBrowse: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="glass glass-glow relative overflow-hidden rounded-lg p-6">
      <div className="relative flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.1em] text-ink-subtle">
            {t("presets.featured.label")}
          </div>
          <h2 className="mt-2 font-serif text-[24px] leading-tight tracking-[-0.01em] text-ink">
            {t("presets.featured.title")}
          </h2>
          <p className="mt-1 text-[13px] italic text-ink-muted">
            {t("presets.featured.description")}
          </p>
          <div className="mt-4">
            <Button type="button" size="sm" onClick={onBrowse}>
              <ArrowRight className="h-3.5 w-3.5" />
              {t("presets.featured.browse")}
            </Button>
          </div>
        </div>
        <div className="hidden shrink-0 sm:flex sm:h-16 sm:w-16 sm:items-center sm:justify-center sm:rounded-md sm:bg-surface-2 sm:text-accent-3">
          <Package className="h-7 w-7" />
        </div>
      </div>
    </section>
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
    <div className="flex items-start gap-2 rounded-md border border-line bg-surface-2/50 px-3 py-2">
      <span className="mt-0.5 text-ink-subtle">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-subtle">
          {label}
        </div>
        <div className="truncate text-xs text-ink">{value}</div>
      </div>
    </div>
  );
}
