import * as React from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Settings2, Pencil } from "lucide-react";
import { useConfig } from "@/components/ConfigProvider";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useToast } from "@/components/shell/ToastHost";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Transformer } from "@/types";

interface EditingState {
  index: number | null;
  data: Transformer;
  isNew: boolean;
}

export default function Transformers() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();
  const { show } = useToast();

  const [editing, setEditing] = React.useState<EditingState | null>(null);
  const [deletingIdx, setDeletingIdx] = React.useState<number | null>(null);

  const transformers = config?.transformers ?? [];

  const handleSave = () => {
    if (!editing || !config) return;
    if (!editing.data.path?.trim()) {
      show(t("transformers.path") + " is required", "error");
      return;
    }
    const list = [...transformers];
    if (editing.isNew) {
      list.push(editing.data);
    } else if (editing.index !== null) {
      list[editing.index] = editing.data;
    }
    setConfig({ ...config, transformers: list });
    setEditing(null);
    show(
      editing.isNew
        ? t("transformers.add") + " ✓"
        : t("transformers.edit") + " ✓",
      "success"
    );
  };

  const handleDelete = () => {
    if (deletingIdx === null || !config) return;
    const list = transformers.filter((_, i) => i !== deletingIdx);
    setConfig({ ...config, transformers: list });
    setDeletingIdx(null);
    show(t("transformers.delete") + " ✓", "success");
  };

  return (
    <AppShell
      title={t("transformers.title")}
      subtitle={t("transformers.subtitle")}
      actions={
        <Button
          size="sm"
          onClick={() =>
            setEditing({ index: null, data: { path: "" }, isNew: true })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          {t("transformers.add")}
        </Button>
      }
    >
      {transformers.length === 0 ? (
        <EmptyState
          title={t("transformers.empty_title")}
          description={t("transformers.empty_description")}
          action={
            <Button
              size="sm"
              onClick={() =>
                setEditing({ index: null, data: { path: "" }, isNew: true })
              }
            >
              <Plus className="h-3.5 w-3.5" />
              {t("transformers.add")}
            </Button>
          }
        />
      ) : (
        <div className="cc-card overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_100px] items-center border-b border-border bg-surface-2 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-fg-subtle">
            <div>{t("transformers.path")}</div>
            <div>{t("transformers.options_count", { count: 0 }).split(" ")[0]}</div>
            <div className="text-right">—</div>
          </div>
          <ul className="divide-y divide-border">
            {transformers.map((tr, i) => {
              const optCount = tr.options ? Object.keys(tr.options).length : 0;
              return (
                <li
                  key={i}
                  className="grid grid-cols-[1fr_140px_100px] items-center gap-2 px-4 py-2.5 transition-colors hover:bg-surface-2/60"
                >
                  <div className="min-w-0">
                    <div className="cc-text-mono truncate text-sm text-fg">
                      {tr.name ?? tr.path}
                    </div>
                    {tr.name && tr.name !== tr.path && (
                      <div className="cc-text-mono truncate text-[11px] text-fg-subtle">
                        {tr.path}
                      </div>
                    )}
                  </div>
                  <div>
                    {optCount > 0 ? (
                      <Badge variant="outline" className="font-mono">
                        {optCount} keys
                      </Badge>
                    ) : (
                      <span className="text-[11px] text-fg-subtle">—</span>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        setEditing({ index: i, data: { ...tr }, isNew: false })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeletingIdx(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.isNew
                ? t("transformers.add")
                : t("transformers.edit")}
            </DialogTitle>
            <DialogDescription>
              {t("transformers.subtitle")}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tr-name">{t("transformers.name")}</Label>
                <Input
                  id="tr-name"
                  placeholder="my-transformer"
                  value={editing.data.name ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      data: { ...editing.data, name: e.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tr-path">{t("transformers.path")}</Label>
                <Input
                  id="tr-path"
                  placeholder="~/ccw/transformers/foo.ts"
                  value={editing.data.path}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      data: { ...editing.data, path: e.target.value },
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tr-options">
                  {t("transformers.options_label")}
                </Label>
                <Textarea
                  id="tr-options"
                  placeholder='{ "key": "value" }'
                  rows={6}
                  className="cc-text-mono"
                  value={JSON.stringify(editing.data.options ?? {}, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = e.target.value.trim()
                        ? JSON.parse(e.target.value)
                        : {};
                      setEditing({
                        ...editing,
                        data: { ...editing.data, options: parsed },
                      });
                    } catch {
                      // ignore parse errors while typing
                    }
                  }}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              {t("app.cancel")}
            </Button>
            <Button onClick={handleSave}>{t("app.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deletingIdx !== null}
        onOpenChange={(o) => !o && setDeletingIdx(null)}
        title={t("transformers.delete")}
        description={t("transformers.delete_transformer_confirm")}
        confirmLabel={t("transformers.delete")}
        destructive
        onConfirm={handleDelete}
      />
    </AppShell>
  );
}
