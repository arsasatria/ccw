import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  KeyRound,
  FileCog,
  ScrollText,
  Network,
  Hourglass,
  Code2,
  Save,
  RotateCcw,
  Zap,
} from "lucide-react";
import { useConfig } from "@/components/ConfigProvider";
import { useToast } from "@/components/shell/ToastHost";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { deepEqual } from "@/lib/utils";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export default function Settings() {
  const { t } = useTranslation();
  const { config, setConfig, save, isSaving } = useConfig();
  const { show } = useToast();

  // Draft copy of the config so that edits are explicit-Save. We keep
  // `config` as the persisted (server) snapshot and `draft` as the
  // in-flight edits. `isDirty` is true when the two diverge.
  const [draft, setDraft] = React.useState<typeof config>(config);

  // Reset the draft when the server-side config changes (e.g. on initial
  // load, or after a successful save round-trip). This keeps the form
  // in sync with persisted state without clobbering local edits mid-edit.
  React.useEffect(() => {
    setDraft(config);
  }, [config]);

  const isDirty = !deepEqual(draft, config);

  if (!config || !draft) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={t("toplevel.title")}
          subtitle={t("toplevel.subtitle")}
        />
        <div className="rounded-md border border-line bg-surface p-6 text-sm text-ink-muted">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  const update = (patch: Partial<typeof config>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("toplevel.title")}
        subtitle={t("toplevel.subtitle")}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <SettingCard icon={<ScrollText className="h-4 w-4" />} title={t("toplevel.logging")}>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="log-enabled">{t("toplevel.log")}</Label>
              <p className="text-xs text-ink-muted">{t("toplevel.log_hint")}</p>
            </div>
            <Switch
              id="log-enabled"
              checked={draft.LOG}
              onCheckedChange={(v) => update({ LOG: v })}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="log-level">{t("toplevel.log_level")}</Label>
            <Select
              value={draft.LOG_LEVEL}
              onValueChange={(v) => update({ LOG_LEVEL: v })}
            >
              <SelectTrigger id="log-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOG_LEVELS.map((lvl) => (
                  <SelectItem key={lvl} value={lvl}>
                    {lvl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SettingCard>

        <SettingCard icon={<Network className="h-4 w-4" />} title={t("toplevel.server")}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="host">{t("toplevel.host")}</Label>
              <Input
                id="host"
                value={draft.HOST}
                onChange={(e) => update({ HOST: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">{t("toplevel.port")}</Label>
              <Input
                id="port"
                type="number"
                value={draft.PORT}
                onChange={(e) => update({ PORT: Number(e.target.value) })}
                className="font-mono"
              />
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="proxy">{t("toplevel.proxy_url")}</Label>
            <Input
              id="proxy"
              placeholder="http://127.0.0.1:7890"
              value={draft.PROXY_URL}
              onChange={(e) => update({ PROXY_URL: e.target.value })}
              className="font-mono"
            />
          </div>
        </SettingCard>

        <SettingCard icon={<Hourglass className="h-4 w-4" />} title={t("toplevel.timeout")}>
          <div className="space-y-2">
            <Label htmlFor="timeout">{t("toplevel.timeout")}</Label>
            <Input
              id="timeout"
              value={draft.API_TIMEOUT_MS}
              onChange={(e) => update({ API_TIMEOUT_MS: e.target.value })}
              className="font-mono"
            />
            <p className="text-xs text-ink-muted">
              {t("toplevel.timeout_hint")}
            </p>
          </div>
        </SettingCard>

        <SettingCard icon={<KeyRound className="h-4 w-4" />} title={t("toplevel.auth")}>
          <div className="space-y-2">
            <Label htmlFor="apikey">{t("toplevel.apikey")}</Label>
            <Input
              id="apikey"
              type="password"
              value={draft.APIKEY}
              onChange={(e) => update({ APIKEY: e.target.value })}
              className="font-mono"
            />
            <p className="text-xs text-ink-muted">
              {t("toplevel.apikey_hint")}
            </p>
          </div>
        </SettingCard>

        <SettingCard icon={<Code2 className="h-4 w-4" />} title={t("toplevel.claude")}>
          <div className="space-y-2">
            <Label htmlFor="claude-path">{t("toplevel.claude_path")}</Label>
            <Input
              id="claude-path"
              placeholder="claude"
              value={draft.CLAUDE_PATH}
              onChange={(e) => update({ CLAUDE_PATH: e.target.value })}
              className="font-mono"
            />
          </div>
        </SettingCard>

        <SettingCard icon={<FileCog className="h-4 w-4" />} title={t("toplevel.advanced")}>
          <div className="space-y-2">
            <Label htmlFor="custom-router">
              {t("toplevel.custom_router_path")}
            </Label>
            <Input
              id="custom-router"
              placeholder="/path/to/custom-router.js"
              value={draft.CUSTOM_ROUTER_PATH ?? ""}
              onChange={(e) => update({ CUSTOM_ROUTER_PATH: e.target.value })}
              className="font-mono"
            />
            <p className="text-xs text-ink-muted">
              {t("toplevel.custom_router_path_placeholder")}
            </p>
          </div>
        </SettingCard>

        <SettingCard
          icon={<Zap className="h-4 w-4" />}
          title={t("toplevel.token_efficiency")}
          className="md:col-span-2"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="token-saver">{t("toplevel.token_saver")}</Label>
              <p className="text-xs text-ink-muted">
                {t("toplevel.token_saver_hint")}
              </p>
            </div>
            <Switch
              id="token-saver"
              checked={draft.tokenSaver ?? true}
              onCheckedChange={(v) => update({ tokenSaver: v })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="terse-mode">{t("toplevel.terse_mode")}</Label>
              <p className="text-xs text-ink-muted">
                {t("toplevel.terse_mode_hint")}
              </p>
            </div>
            <Switch
              id="terse-mode"
              checked={draft.terseMode ?? false}
              onCheckedChange={(v) => update({ terseMode: v })}
            />
          </div>
        </SettingCard>
      </div>

      {isDirty && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3 shadow-sm">
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
    </div>
  );
}

function SettingCard({
  icon,
  title,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center gap-2.5 space-y-0 pb-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-2 text-accent-1">
          {icon}
        </div>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
