import "./i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "remixicon/fonts/remixicon.css";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { ConfigProvider } from "@/components/ConfigProvider";

// Initialize theme before paint to avoid flash
const THEME_KEY = "ccw-theme";
type Theme = "dark" | "light" | "system";
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(THEME_KEY) as Theme | null;
  return stored || "dark";
}
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  root.classList.remove("dark", "light");
  root.classList.add(resolved);
}
applyTheme(getInitialTheme());

// Global 401 handler. api.ts dispatches `unauthorized` from a microtask when
// any API call returns 401 (and clears the stored API key). We listen here
// at module init — before React renders — so the initial config fetch in
// ConfigProvider can trigger a navigation to /login even though the React
// tree isn't mounted yet when the event fires. The replace flag avoids
// piling the protected page into the history stack.
window.addEventListener("unauthorized", () => {
  router.navigate("/login", { replace: true });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider>
      <RouterProvider router={router} />
    </ConfigProvider>
  </StrictMode>
);
