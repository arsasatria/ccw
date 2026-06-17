import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function Login() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Auto-redirect if already authenticated
  useEffect(() => {
    const existing = localStorage.getItem("apiKey");
    if (!existing) return;
    setBusy(true);
    api
      .getConfig()
      .then(() => nav("/dashboard", { replace: true }))
      .catch(() => {
        localStorage.removeItem("apiKey");
      })
      .finally(() => setBusy(false));
  }, [nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      api.setApiKey(key);
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "apiKey",
          newValue: key,
          url: window.location.href,
        }),
      );
      await api.getConfig();
      nav("/dashboard");
    } catch (err) {
      api.setApiKey("");
      const msg =
        err && typeof err === "object" && "message" in err && typeof err.message === "string"
          ? err.message
          : "";
      // The api client throws `Error("Unauthorized")` for 401s. Surface
      // that to the user as an invalid-key error rather than bouncing
      // them to /dashboard, which would re-trigger the 401.
      if (msg.includes("401") || msg === "Unauthorized") {
        setError(t("login.invalidApiKey"));
      } else {
        // Tolerate other errors and proceed (matches current behavior)
        nav("/dashboard");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="glass relative w-[380px] overflow-hidden rounded-lg p-8 shadow-glass">
        <div className="glass-glow" />
        <div className="relative">
          <div className="mb-6 flex items-center gap-2">
            <Logo size={28} />
          </div>
          <h1 className="font-serif text-[24px] leading-tight tracking-[-0.01em] text-ink">
            {t("login.title")}
          </h1>
          <p className="mt-2 text-[13px] italic text-ink-muted">
            {t("login.description")}
          </p>
          <form className="mt-6 space-y-3" onSubmit={onSubmit}>
            <Input
              id="apiKey"
              type="password"
              placeholder={t("login.apiKeyPlaceholder")}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoFocus
              required
              disabled={busy}
              aria-label={t("login.apiKey")}
              aria-describedby={error ? "login-error" : undefined}
            />
            {error && (
              <p id="login-error" role="alert" className="text-[12px] text-danger">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {t("login.signIn")}
            </Button>
          </form>
          <p className="mt-6 text-center text-[11px] italic text-ink-subtle">
            {t("login.tagline")}
          </p>
        </div>
      </div>
    </div>
  );
}
