import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import MonacoEditor from "@monaco-editor/react";
import {
  Send,
  Copy,
  History,
  Maximize2,
  Minimize2,
  Clock,
  Trash2,
  X,
  Activity,
  Globe,
  Code2,
  Zap,
  CheckCircle2,
  AlertCircle,
  Timer,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { requestHistoryDB, type RequestHistoryItem } from "@/lib/db";

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;

interface RequestData {
  url: string;
  method: string;
  headers: string;
  body: string;
}

interface ResponseData {
  status: number;
  responseTime: number;
  body: string;
  headers: string;
}

function statusTone(status: number): "success" | "warning" | "danger" {
  if (status >= 200 && status < 300) return "success";
  if (status >= 400) return "danger";
  return "warning";
}

function formatTime(ts: string) {
  const d = new Date(ts);
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
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
  });

  const [isLoading, setIsLoading] = React.useState(false);
  const [fullscreenEditor, setFullscreenEditor] = React.useState<
    "headers" | "body" | "response" | null
  >(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  const headersRef = React.useRef<any>(null);
  const bodyRef = React.useRef<any>(null);
  const responseRef = React.useRef<any>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const logData = params.get("logData");
    if (!logData) return;
    try {
      const parsed = JSON.parse(decodeURIComponent(logData));
      const url = parsed.url || parsed.requestUrl || parsed.endpoint || "";
      const method = (parsed.method || parsed.requestMethod || "POST").toUpperCase();

      let headers: Record<string, string> = {};
      if (parsed.headers) {
        if (typeof parsed.headers === "string") {
          try {
            headers = JSON.parse(parsed.headers);
          } catch {
            const lines = parsed.headers.split("\n");
            for (const line of lines) {
              const [key, ...rest] = line.split(":");
              if (key && rest.length) {
                headers[key.trim()] = rest.join(":").trim();
              }
            }
          }
        } else {
          headers = parsed.headers;
        }
      }

      let body: any = {};
      const bodyData = parsed.body || (parsed.request && parsed.request.body);
      if (bodyData) {
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

  const layout = (which: "headers" | "body" | "response") => {
    if (which === "headers") headersRef.current?.layout?.();
    if (which === "body") bodyRef.current?.layout?.();
    if (which === "response") responseRef.current?.layout?.();
  };

  const toggleFullscreen = (which: "headers" | "body" | "response") => {
    const entering = fullscreenEditor !== which;
    setFullscreenEditor(entering ? which : null);
    setTimeout(() => {
      layout("headers");
      layout("body");
      layout("response");
    }, 250);
  };

  const sendRequest = async () => {
    try {
      setIsLoading(true);
      const headers = JSON.parse(requestData.headers);
      const body = JSON.parse(requestData.body);

      const start = Date.now();
      const response = await fetch(requestData.url, {
        method: requestData.method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: requestData.method !== "GET" ? JSON.stringify(body) : undefined,
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
    } catch (err: any) {
      setResponseData({
        status: 0,
        responseTime: 0,
        body: `Request failed: ${err?.message || "Unknown error"}`,
        headers: "{}",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyCurl = async () => {
    try {
      const headers = JSON.parse(requestData.headers);
      const body = JSON.parse(requestData.body);
      let curl = `curl -X ${requestData.method} "${requestData.url}"`;
      for (const [k, v] of Object.entries(headers)) {
        curl += ` \\\n  -H "${k}: ${v}"`;
      }
      if (requestData.method !== "GET" && Object.keys(body).length > 0) {
        curl += ` \\\n  -d '${JSON.stringify(body)}'`;
      }
      await navigator.clipboard.writeText(curl);
      show("cURL copied to clipboard", "success");
    } catch {
      show("Failed to copy cURL", "error");
    }
  };

  const selectFromHistory = (req: RequestHistoryItem) => {
    setRequestData({
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    setResponseData({
      status: req.status,
      responseTime: req.responseTime,
      body: req.responseBody,
      headers: req.responseHeaders,
    });
    setHistoryOpen(false);
  };

  const showResponsePanel = responseData.status > 0 || isLoading;

  return (
    <AppShell
      title="HTTP Debugger"
      subtitle="Craft and inspect raw API requests against any endpoint"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
            <History className="h-3.5 w-3.5" />
            History
          </Button>
          <Button variant="outline" size="sm" onClick={copyCurl}>
            <Copy className="h-3.5 w-3.5" />
            cURL
          </Button>
        </>
      }
    >
      <div className="grid h-[calc(100vh-180px)] min-h-[640px] gap-3 lg:grid-cols-2">
        <div className="cc-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand">
                <Send className="h-3.5 w-3.5" />
              </div>
              <div>
                <div className="text-sm font-medium text-fg">Request</div>
                <div className="text-[10.5px] text-fg-subtle">
                  Configure method, URL, headers, and body
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={sendRequest}
              disabled={isLoading || !requestData.url.trim()}
            >
              {isLoading ? (
                <>
                  <Timer className="h-3.5 w-3.5 animate-pulse" />
                  Sending…
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  Send
                </>
              )}
            </Button>
          </div>

          <div className="space-y-3 p-4">
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="method" className="text-xs">
                  Method
                </Label>
                <Select
                  value={requestData.method}
                  onValueChange={(v) =>
                    setRequestData((prev) => ({ ...prev, method: v }))
                  }
                >
                  <SelectTrigger id="method" className="cc-text-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HTTP_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        <span className="cc-text-mono font-semibold">{m}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="url" className="text-xs">
                  URL
                </Label>
                <Input
                  id="url"
                  placeholder="https://api.example.com/v1/endpoint"
                  value={requestData.url}
                  onChange={(e) =>
                    setRequestData((prev) => ({ ...prev, url: e.target.value }))
                  }
                  className="cc-text-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-hidden border-t border-border">
            <Tabs defaultValue="headers" className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border bg-surface-2 px-2">
                <TabsList className="bg-transparent">
                  <TabsTrigger value="headers">Headers</TabsTrigger>
                  <TabsTrigger value="body">Body</TabsTrigger>
                </TabsList>
                <div className="px-2 text-[10.5px] text-fg-subtle">
                  JSON · Monaco
                </div>
              </div>
              <TabsContent
                value="headers"
                className="mt-0 flex-1 overflow-hidden p-2"
              >
                <EditorPane
                  fullscreen={fullscreenEditor === "headers"}
                  onToggleFullscreen={() => toggleFullscreen("headers")}
                  value={requestData.headers}
                  onChange={(v) =>
                    setRequestData((prev) => ({ ...prev, headers: v || "{}" }))
                  }
                  onMount={(e) => (headersRef.current = e)}
                  language="json"
                  label="Headers (JSON)"
                />
              </TabsContent>
              <TabsContent value="body" className="mt-0 flex-1 overflow-hidden p-2">
                <EditorPane
                  fullscreen={fullscreenEditor === "body"}
                  onToggleFullscreen={() => toggleFullscreen("body")}
                  value={requestData.body}
                  onChange={(v) =>
                    setRequestData((prev) => ({ ...prev, body: v || "{}" }))
                  }
                  onMount={(e) => (bodyRef.current = e)}
                  language="json"
                  label="Body (JSON)"
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <div className="cc-card flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-soft text-brand">
                <Activity className="h-3.5 w-3.5" />
              </div>
              <div>
                <div className="text-sm font-medium text-fg">Response</div>
                <div className="text-[10.5px] text-fg-subtle">
                  Inspect status, time, headers, and body
                </div>
              </div>
            </div>
            {responseData.status > 0 && (
              <div className="flex items-center gap-2">
                <Badge
                  variant={statusTone(responseData.status)}
                  className="cc-text-mono text-[11px]"
                >
                  {responseData.status >= 200 && responseData.status < 300 ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertCircle className="h-3 w-3" />
                  )}
                  {responseData.status}
                </Badge>
                <Badge variant="outline" className="cc-text-mono text-[11px]">
                  <Timer className="h-3 w-3" />
                  {responseData.responseTime}ms
                </Badge>
              </div>
            )}
          </div>

          {showResponsePanel ? (
            <Tabs defaultValue="body" className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-surface-2 px-2">
                <TabsList className="bg-transparent">
                  <TabsTrigger value="body">Body</TabsTrigger>
                  <TabsTrigger value="headers">Headers</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent
                value="body"
                className="mt-0 flex-1 overflow-hidden p-2"
              >
                <EditorPane
                  fullscreen={fullscreenEditor === "response"}
                  onToggleFullscreen={() => toggleFullscreen("response")}
                  value={responseData.body}
                  onChange={() => {}}
                  onMount={(e) => (responseRef.current = e)}
                  language="json"
                  label="Response body"
                  readOnly
                />
              </TabsContent>
              <TabsContent
                value="headers"
                className="mt-0 flex-1 overflow-hidden p-2"
              >
                <EditorPane
                  fullscreen={false}
                  onToggleFullscreen={() => {}}
                  value={responseData.headers}
                  onChange={() => {}}
                  onMount={() => {}}
                  language="json"
                  label="Response headers"
                  readOnly
                />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex flex-1 items-center justify-center text-xs text-fg-muted">
              <div className="space-y-2 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-fg-subtle">
                  <Globe className="h-4 w-4" />
                </div>
                <p>Send a request to see the response here.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onSelect={selectFromHistory}
      />
    </AppShell>
  );
}

function EditorPane({
  fullscreen,
  onToggleFullscreen,
  value,
  onChange,
  onMount,
  language,
  label,
  readOnly,
}: {
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  value: string;
  onChange: (v: string | undefined) => void;
  onMount: (editor: any) => void;
  language: string;
  label: string;
  readOnly?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-md border border-border",
        fullscreen && "fixed inset-0 z-[60] bg-bg p-4"
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">
          {label}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleFullscreen}
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {fullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      <div className="flex-1">
        <MonacoEditor
          height="100%"
          language={language}
          value={value}
          onChange={onChange}
          onMount={onMount}
          options={{
            minimap: { enabled: fullscreen },
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: "on",
            wordWrap: "on",
            automaticLayout: true,
            formatOnPaste: true,
            formatOnType: true,
            readOnly: !!readOnly,
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
  const [items, setItems] = React.useState<RequestHistoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");

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
    if (!window.confirm("Clear all request history?")) return;
    await requestHistoryDB.clearAllRequests();
    setItems([]);
  };

  const filtered = items.filter((i) =>
    [i.url, i.method].some((s) => s.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Request History
              <Badge variant="default" className="font-mono text-[10px]">
                {items.length}
              </Badge>
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
            <Input
              placeholder="Search by URL or method…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-xs text-fg-muted">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <Code2 className="mx-auto h-6 w-6 text-fg-subtle" />
              <p className="mt-2 text-xs text-fg-muted">No history yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((req) => (
                <li
                  key={req.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2/60"
                  onClick={() => onSelect(req)}
                >
                  <Badge
                    variant="outline"
                    className="cc-text-mono text-[10px] font-semibold"
                  >
                    {req.method}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="cc-text-mono truncate text-xs text-fg">
                      {req.url}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-fg-subtle">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        {formatTime(req.timestamp)}
                      </span>
                      <Badge
                        variant={statusTone(req.status)}
                        className="font-mono text-[9.5px]"
                      >
                        {req.status}
                      </Badge>
                      <span className="cc-text-mono">{req.responseTime}ms</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => handleDelete(req.id, e)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-danger" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-border p-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="w-full"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all history
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
