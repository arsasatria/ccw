import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollText,
  RefreshCw,
  Download,
  Trash2,
  ChevronRight,
  FileText,
  Activity,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/shell/ToastHost";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LogFile {
  name: string;
  path: string;
  size: number;
  lastModified: string;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source?: string;
  reqId?: string;
}

const LEVEL_STYLES: Record<string, string> = {
  error: "text-danger",
  warn: "text-warning",
  warning: "text-warning",
  info: "text-info",
  debug: "text-fg-subtle",
  trace: "text-fg-subtle",
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export default function Logs() {
  const { t } = useTranslation();
  const { show } = useToast();

  const [files, setFiles] = React.useState<LogFile[]>([]);
  const [active, setActive] = React.useState<LogFile | null>(null);
  const [entries, setEntries] = React.useState<LogEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [loadingFiles, setLoadingFiles] = React.useState(true);

  const loadFiles = React.useCallback(async () => {
    setLoadingFiles(true);
    try {
      const list = await api.getLogFiles();
      setFiles(list);
    } catch (err) {
      show(t("log_viewer.load_files_failed"), "error");
    } finally {
      setLoadingFiles(false);
    }
  }, [show, t]);

  const loadLogs = React.useCallback(async (file: LogFile) => {
    setLoading(true);
    try {
      const list = await api.getLogs(file.path);
      setEntries(list as unknown as LogEntry[]);
      setActive(file);
    } catch (err) {
      show(t("log_viewer.load_failed"), "error");
    } finally {
      setLoading(false);
    }
  }, [show, t]);

  React.useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  React.useEffect(() => {
    if (!active || !autoRefresh) return;
    const interval = setInterval(() => loadLogs(active), 3000);
    return () => clearInterval(interval);
  }, [active, autoRefresh, loadLogs]);

  const handleClear = async () => {
    if (!active) return;
    try {
      await api.clearLogs(active.path);
      show(t("log_viewer.logs_cleared"), "success");
      await loadLogs(active);
    } catch {
      show(t("log_viewer.clear_failed"), "error");
    }
  };

  const handleDownload = () => {
    if (!active) return;
    const blob = new Blob([entries.map((e) => `[${e.timestamp}] [${e.level}] ${e.message}`).join("\n")], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = active.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell
      title={t("log_viewer.title")}
      subtitle={t("log_viewer.subtitle")}
      actions={
        <Button variant="outline" size="sm" onClick={loadFiles}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t("log_viewer.refresh")}
        </Button>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
        {/* Files sidebar */}
        <div className="cc-card overflow-hidden self-start">
          <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">
            <FileText className="h-3 w-3" />
            {t("log_viewer.title")}
          </div>
          {loadingFiles ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : files.length === 0 ? (
            <div className="p-6 text-center text-xs text-fg-muted">
              {t("log_viewer.no_log_files_available")}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {files.map((f) => (
                <li key={f.path}>
                  <button
                    onClick={() => loadLogs(f)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2",
                      active?.path === f.path && "bg-brand-soft/40"
                    )}
                  >
                    <ScrollText className="h-3.5 w-3.5 text-fg-subtle shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="cc-text-mono truncate text-xs text-fg">
                        {f.name}
                      </div>
                      <div className="text-[10.5px] text-fg-subtle">
                        {formatBytes(f.size)}
                      </div>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-fg-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Log viewer */}
        <div className="cc-card flex flex-col overflow-hidden min-h-[600px]">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="h-3.5 w-3.5 text-fg-subtle shrink-0" />
              <span className="cc-text-mono truncate text-xs text-fg-muted">
                {active?.name ?? t("log_viewer.select_file")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                />
                {autoRefresh
                  ? t("log_viewer.auto_refresh_on")
                  : t("log_viewer.auto_refresh_off")}
              </label>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleDownload}
                disabled={!active}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleClear}
                disabled={!active}
              >
                <Trash2 className="h-3.5 w-3.5 text-danger" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 cc-text-mono text-[12.5px] leading-relaxed">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-4" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-fg-muted">
                {active
                  ? t("log_viewer.no_logs_available")
                  : t("log_viewer.select_file")}
              </div>
            ) : (
              <div className="space-y-0.5">
                {entries.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-fg-subtle tabular-nums">
                      {entry.timestamp}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 min-w-[3rem] justify-center font-mono text-[10px]",
                        LEVEL_STYLES[entry.level?.toLowerCase()] ?? "text-fg-muted"
                      )}
                    >
                      {entry.level}
                    </Badge>
                    <span className="text-fg break-all whitespace-pre-wrap">
                      {entry.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
