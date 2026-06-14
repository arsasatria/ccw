import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import MonacoEditor from "@monaco-editor/react";
import {
  Send,
  Copy,
  History,
  Activity,
  Code2,
  Timer,
  Search,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { useToast } from "@/components/shell/ToastHost";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { requestHistoryDB, type RequestHistoryItem } from "@/lib/db";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

interface RequestData {
  url: string;
  method: HttpMethod;
  headers: string;
  body: string;
}

interface ResponseData {
  status: number;
  responseTime: number;
  body: string;
  headers: string;
  lastError: string | null;
}

function statusTone(status: number): "success" | "warning" | "danger" {
  if (status >= 200 && status < 300) return "success";
  if (status >= 400) return "danger";
  return "warning";
}

function formatTime(
  ts: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("debug.time_just_now");
  if (minutes < 60) return t("debug.time_minutes_ago", { count: minutes });
  if (minutes < 1440)
    return t("debug.time_hours_ago", { count: Math.floor(minutes / 60) });
  return d.toLocaleDateString();
}

export default function DebugPage() {
  const { t } = useTranslation();
  const { show } = useToast();
  const location = useLocation();

  const [requestData, setRequestData] = React.useState<RequestData>({
    url: "",
    method: "POST",
    headers: "{}",
    body: "{}",
  });

  const [responseData, setResponseData] = React.useState<ResponseData>({
    status: 0,
    responseTime: 0,
    body: "",
    headers: "{}",
    lastError: null,
  });

  const [isLoading, setIsLoading] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  const headersRef = React.useRef<unknown>(null);
  const bodyRef = React.useRef<unknown>(null);
  const responseRef = React.useRef<unknown>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const logData = params.get("logData");
    if (!logData) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(logData)) as Record<
        string,
        unknown
      >;
      const url = String(
        (parsed.url as string | undefined) ??
          (parsed.requestUrl as string | undefined) ??
          (parsed.endpoint as string | undefined) ??
          ""
      );
      const rawMethod = String(
        (parsed.method as string | undefined) ??
          (parsed.requestMethod as string | undefined) ??
          "POST"
      ).toUpperCase();
      const method: HttpMethod = (HTTP_METHODS as readonly string[]).includes(
        rawMethod
      )
        ? (rawMethod as HttpMethod)
        : "POST";

      const headers: Record<string, string> = {};
      const rawHeaders = parsed.headers;
      if (rawHeaders) {
        if (typeof rawHeaders === "string") {
          try {
            const obj = JSON.parse(rawHeaders) as Record<string, unknown>;
            for (const [k, v] of Object.entries(obj)) {
              headers[k] = String(v);
            }
          } catch {
            const lines = rawHeaders.split("\n");
            for (const line of lines) {
              const idx = line.indexOf(":");
              if (idx > 0) {
                const key = line.slice(0, idx).trim();
                const value = line.slice(idx + 1).trim();
                if (key) headers[key] = value;
              }
            }
          }
        } else if (typeof rawHeaders === "object" && rawHeaders !== null) {
          for (const [k, v] of Object.entries(rawHeaders)) {
            headers[k] = String(v);
          }
        }
      }

      let body: unknown = {};
      const bodyData =
        parsed.body ??
        (parsed.request as Record<string, unknown> | undefined)?.body;
      if (bodyData !== undefined && bodyData !== null) {
        if (typeof bodyData === "string") {
          try {
            body = JSON.parse(bodyData);
          } catch {
            const trimmed = bodyData.trim();
            body =
              trimmed.startsWith("{") || trimmed.startsWith("[")
                ? { raw: bodyData }
                : { content: bodyData };
          }
        } else if (typeof bodyData === "object") {
          body = bodyData;
        } else {
          body = { content: String(bodyData) };
        }
      }

      setRequestData({
        url,
        method,
        headers: JSON.stringify(headers, null, 2),
        body: JSON.stringify(body, null, 2),
      });
    } catch (err) {
      console.error("Failed to parse log data", err);
    }
  }, [location.search]);

  const sendRequest = async () => {
    if (!requestData.url.trim()) return;
    try {
      setIsLoading(true);
      const headers: Record<string, string> = {};
      let body: unknown = {};
      try {
        const parsedHeaders = JSON.parse(requestData.headers);
        if (parsedHeaders && typeof parsedHeaders === "object") {
          for (const [k, v] of Object.entries(
            parsedHeaders as Record<string, unknown>
          )) {
            headers[k] = String(v);
          }
        }
      } catch {
        // keep headers empty if user JSON is broken
      }
      try {
        body = JSON.parse(requestData.body);
      } catch {
        body = requestData.body;
      }

      const start = Date.now();
      const response = await fetch(requestData.url, {
        method: requestData.method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body:
          requestData.method !== "GET" ? JSON.stringify(body) : undefined,
      });

      const ms = Date.now() - start;
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((v, k) => (responseHeaders[k] = v));

      const text = await response.text();
      let responseBody = text;
      try {
        responseBody = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* keep raw */
      }

      const headersStr = JSON.stringify(responseHeaders, null, 2);

      setResponseData({
        status: response.status,
        responseTime: ms,
        body: responseBody,
        headers: headersStr,
        lastError: null,
      });

      await requestHistoryDB.saveRequest({
        url: requestData.url,
        method: requestData.method,
        headers: requestData.headers,
        body: requestData.body,
        status: response.status,
        responseTime: ms,
        responseBody,
        responseHeaders: headersStr,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("debug.request_failed_unknown");
      setResponseData({
        status: 0,
        responseTime: 0,
        body: t("debug.request_failed", { message }),
        headers: "{}",
        lastError: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyCurl = async () => {
    try {
      const headers = JSON.parse(requestData.headers) as Record<string, unknown>;
      const body = JSON.parse(requestData.body) as Record<string, unknown>;
      let curl = `curl -X ${requestData.method} "${requestData.url}"`;
      for (const [k, v] of Object.entries(headers)) {
        curl += ` \\\n  -H "${k}: ${String(v)}"`;
      }
      if (
        requestData.method !== "GET" &&
        body &&
        Object.keys(body).length > 0
      ) {
        curl += ` \\\n  -d '${JSON.stringify(body)}'`;
      }
      await navigator.clipboard.writeText(curl);
      show(t("debug.curl_copied"), "success");
    } catch {
      show(t("debug.curl_failed"), "error");
    }
  };

  const selectFromHistory = (req: RequestHistoryItem) => {
    const rawMethod = req.method.toUpperCase();
    const method: HttpMethod = (HTTP_METHODS as readonly string[]).includes(
      rawMethod
    )
      ? (rawMethod as HttpMethod)
      : "POST";
    setRequestData({
      url: req.url,
      method,
      headers: req.headers,
      body: req.body,
    });
    setResponseData({
      status: req.status,
      responseTime: req.responseTime,
      body: req.responseBody,
      headers: req.responseHeaders,
      lastError: null,
    });
    setHistoryOpen(false);
  };

  const showResponsePanel =
    responseData.status > 0 || isLoading || !!responseData.lastError;

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[640px] flex-col gap-6">
      <PageHeader
        title={t("debug.title")}
        subtitle={t("debug.subtitle")}
        action={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={sendRequest}
              disabled={isLoading || !requestData.url.trim()}
            >
              {isLoading ? (
                <>
                  <Timer className="h-3.5 w-3.5 animate-pulse" />
                  {t("debug.sending")}
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  {t("debug.send")}
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHistoryOpen(true)}
            >
              <History className="h-3.5 w-3.5" />
              {t("debug.history")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyCurl}
            >
              <Copy className="h-3.5 w-3.5" />
              {t("debug.curl")}
            </Button>
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 grid-rows-2 gap-4">
        {/* REQUEST PANE */}
        <section
          aria-labelledby="debug-request-heading"
          className="flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-surface"
        >
          <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-surface text-accent-3">
                <Send className="h-3.5 w-3.5" />
              </span>
              <h2
                id="debug-request-heading"
                className="font-serif text-[14px] italic text-ink"
              >
                {t("debug.request_title")}
              </h2>
            </div>
            <span className="text-[10.5px] text-ink-subtle">
              {t("debug.request_subtitle")}
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
            <div className="w-[140px] space-y-1.5">
              <Label htmlFor="debug-method" className="text-[10.5px] text-ink-subtle">
                {t("debug.method")}
              </Label>
              <Select
                value={requestData.method}
                onValueChange={(v) =>
                  setRequestData((prev) => ({ ...prev, method: v as HttpMethod }))
                }
              >
                <SelectTrigger id="debug-method" className="font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HTTP_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      <span className="font-mono font-semibold">{m}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[240px] flex-1 space-y-1.5">
              <Label htmlFor="debug-url" className="text-[10.5px] text-ink-subtle">
                {t("debug.url")}
              </Label>
              <Input
                id="debug-url"
                placeholder={t("debug.url_placeholder")}
                value={requestData.url}
                onChange={(e) =>
                  setRequestData((prev) => ({ ...prev, url: e.target.value }))
                }
                className="font-mono"
              />
            </div>
          </div>

          <Tabs
            defaultValue="headers"
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex items-center justify-between border-b border-line bg-surface-2 px-2">
              <TabsList className="bg-transparent">
                <TabsTrigger value="headers">{t("debug.headers")}</TabsTrigger>
                <TabsTrigger value="body">{t("debug.body")}</TabsTrigger>
              </TabsList>
              <span className="px-2 text-[10.5px] text-ink-subtle">
                {t("debug.json_label")}
              </span>
            </div>
            <TabsContent
              value="headers"
              className="mt-0 min-h-0 flex-1 overflow-hidden p-2"
            >
              <MonacoPane
                value={requestData.headers}
                onChange={(v) =>
                  setRequestData((prev) => ({ ...prev, headers: v || "{}" }))
                }
                onMount={(e) => {
                  headersRef.current = e;
                }}
                language="json"
                ariaLabel={t("debug.headers_placeholder")}
              />
            </TabsContent>
            <TabsContent
              value="body"
              className="mt-0 min-h-0 flex-1 overflow-hidden p-2"
            >
              <MonacoPane
                value={requestData.body}
                onChange={(v) =>
                  setRequestData((prev) => ({ ...prev, body: v || "{}" }))
                }
                onMount={(e) => {
                  bodyRef.current = e;
                }}
                language="json"
                ariaLabel={t("debug.body_placeholder")}
              />
            </TabsContent>
          </Tabs>
        </section>

        {/* RESPONSE PANE */}
        <section
          aria-labelledby="debug-response-heading"
          className="flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-paper"
        >
          <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-surface text-accent-3">
                <Activity className="h-3.5 w-3.5" />
              </span>
              <h2
                id="debug-response-heading"
                className="font-serif text-[14px] italic text-ink"
              >
                {t("debug.response_title")}
              </h2>
            </div>
            <span className="text-[10.5px] text-ink-subtle">
              {t("debug.response_subtitle")}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {responseData.status > 0 && (
                <>
                  <Badge
                    variant={statusTone(responseData.status)}
                    className="font-mono text-[11px]"
                  >
                    {responseData.status >= 200 && responseData.status < 300 ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <AlertCircle className="h-3 w-3" />
                    )}
                    {responseData.status}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="font-mono text-[11px]"
                  >
                    <Timer className="h-3 w-3" />
                    {responseData.responseTime}ms
                  </Badge>
                </>
              )}
            </div>
          </div>

          {showResponsePanel ? (
            <Tabs
              defaultValue="body"
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex items-center border-b border-line bg-surface-2 px-2">
                <TabsList className="bg-transparent">
                  <TabsTrigger value="body">
                    {t("debug.response_body")}
                  </TabsTrigger>
                  <TabsTrigger value="headers">
                    {t("debug.response_headers")}
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent
                value="body"
                className="mt-0 min-h-0 flex-1 overflow-hidden p-2"
              >
                <MonacoPane
                  value={responseData.body}
                  onChange={() => undefined}
                  onMount={(e) => {
                    responseRef.current = e;
                  }}
                  language="json"
                  readOnly
                  ariaLabel={t("debug.response_body")}
                />
              </TabsContent>
              <TabsContent
                value="headers"
                className="mt-0 min-h-0 flex-1 overflow-hidden p-2"
              >
                <MonacoPane
                  value={responseData.headers}
                  onChange={() => undefined}
                  onMount={(e) => {
                    responseRef.current = e;
                  }}
                  language="json"
                  readOnly
                  ariaLabel={t("debug.response_headers")}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState
                title={t("debug.response_empty_title")}
                description={t("debug.response_empty")}
                action={
                  <Button
                    type="button"
                    size="sm"
                    onClick={sendRequest}
                    disabled={!requestData.url.trim()}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("debug.send")}
                  </Button>
                }
              />
            </div>
          )}
        </section>
      </div>

      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onSelect={selectFromHistory}
      />
    </div>
  );
}

interface MonacoPaneProps {
  value: string;
  onChange: (v: string | undefined) => void;
  onMount: (editor: unknown) => void;
  language: string;
  readOnly?: boolean;
  ariaLabel: string;
}

function MonacoPane({
  value,
  onChange,
  onMount,
  language,
  readOnly = false,
  ariaLabel,
}: MonacoPaneProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex h-full flex-col overflow-hidden rounded-sm border border-line bg-surface-2"
    >
      <div className="flex-1">
        <MonacoEditor
          height="100%"
          language={language}
          value={value}
          onChange={onChange}
          onMount={onMount}
          options={{
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: "on",
            wordWrap: "on",
            automaticLayout: true,
            formatOnPaste: true,
            formatOnType: true,
            readOnly,
          }}
        />
      </div>
    </div>
  );
}

function HistoryDrawer({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (req: RequestHistoryItem) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = React.useState<RequestHistoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [confirmClearOpen, setConfirmClearOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setItems(await requestHistoryDB.getRequests());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await requestHistoryDB.deleteRequest(id);
    setItems((prev) => prev.filter((r) => r.id !== id));
  };

  const handleClearAll = async () => {
    await requestHistoryDB.clearAllRequests();
    setItems([]);
    setConfirmClearOpen(false);
  };

  const filtered = items.filter((i) =>
    [i.url, i.method].some((s) => s.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-line px-4 py-3">
          <DialogTitle className="flex items-center gap-2 font-serif italic">
            <History className="h-4 w-4" />
            {t("debug.history")}
            <Badge variant="default" className="font-mono text-[10px]">
              {items.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
            <Input
              placeholder={t("debug.search_placeholder")}
              aria-label={t("debug.search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-xs text-ink-muted">
              {t("debug.loading")}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <Code2 className="mx-auto h-6 w-6 text-ink-subtle" />
              <p className="mt-2 text-xs text-ink-muted">
                {t("debug.no_history")}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((req) => (
                <li
                  key={req.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60"
                  onClick={() => onSelect(req)}
                >
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] font-semibold"
                  >
                    {req.method}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs text-ink">
                      {req.url}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-ink-subtle">
                      <span className="font-mono">
                        {formatTime(req.timestamp, t)}
                      </span>
                      <Badge
                        variant={statusTone(req.status)}
                        className="font-mono text-[9.5px]"
                      >
                        {req.status}
                      </Badge>
                      <span className="font-mono">{req.responseTime}ms</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => handleDelete(req.id, e)}
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-line p-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmClearOpen(true)}
              className="w-full"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("debug.clear_all")}
            </Button>
          </div>
        )}
      </DialogContent>

      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title={t("debug.clear_all")}
        description={t("debug.clear_all_confirm")}
        confirmLabel={t("debug.clear_all")}
        destructive
        onConfirm={handleClearAll}
      />
    </Dialog>
  );
}
