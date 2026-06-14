import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  KeyRound,
  FileCog,
  ScrollText,
  Network,
  Hourglass,
  Code2,
} from "lucide-react";
import { useConfig } from "@/components/ConfigProvider";
import { PageHeader } from "@/components/common/PageHeader";
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

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export default function Settings() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();

  if (!config) {
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
    setConfig({ ...config, ...patch });
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
              checked={config.LOG}
              onCheckedChange={(v) => update({ LOG: v })}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="log-level">{t("toplevel.log_level")}</Label>
            <Select
              value={config.LOG_LEVEL}
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
                value={config.HOST}
                onChange={(e) => update({ HOST: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">{t("toplevel.port")}</Label>
              <Input
                id="port"
                type="number"
                value={config.PORT}
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
              value={config.PROXY_URL}
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
              value={config.API_TIMEOUT_MS}
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
              value={config.APIKEY}
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
              value={config.CLAUDE_PATH}
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
              value={config.CUSTOM_ROUTER_PATH ?? ""}
              onChange={(e) => update({ CUSTOM_ROUTER_PATH: e.target.value })}
              className="font-mono"
            />
            <p className="text-xs text-ink-muted">
              {t("toplevel.custom_router_path_placeholder")}
            </p>
          </div>
        </SettingCard>
      </div>
    </div>
  );
}

function SettingCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
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
