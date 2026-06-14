import { createMemoryRouter, Navigate } from "react-router-dom";
import Dashboard from "@/pages/Dashboard";
import ProvidersPage from "@/pages/Providers";
import RouterPage from "@/pages/Router";
import TransformersPage from "@/pages/Transformers";
import PresetsPage from "@/pages/Presets";
import LogsPage from "@/pages/Logs";
import DebugPage from "@/pages/Debug";
import SettingsPage from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import ProtectedRoute from "@/components/ProtectedRoute";
import PublicRoute from "@/components/PublicRoute";
import { AppShell } from "@/components/shell/AppShell";

export const router = createMemoryRouter(
  [
    {
      path: "/",
      element: <Navigate to="/dashboard" replace />,
    },
    {
      path: "/login",
      element: (
        <PublicRoute>
          <Login />
        </PublicRoute>
      ),
    },
    {
      path: "/dashboard",
      element: (
        <ProtectedRoute>
          <AppShell>
            <Dashboard />
          </AppShell>
        </ProtectedRoute>
      ),
    },
    {
      path: "/providers",
      element: (
        <ProtectedRoute>
          <AppShell>
            <ProvidersPage />
          </AppShell>
        </ProtectedRoute>
      ),
    },
    {
      path: "/router",
      element: (
        <ProtectedRoute>
          <AppShell>
            <RouterPage />
          </AppShell>
        </ProtectedRoute>
      ),
    },
    {
      path: "/transformers",
      element: (
        <ProtectedRoute>
          <AppShell>
            <TransformersPage />
          </AppShell>
        </ProtectedRoute>
      ),
    },
    {
      path: "/presets",
      element: (
        <ProtectedRoute>
          <AppShell>
            <PresetsPage />
          </AppShell>
        </ProtectedRoute>
      ),
    },
    {
      path: "/logs",
      element: (
        <ProtectedRoute>
          <AppShell>
            <LogsPage />
          </AppShell>
        </ProtectedRoute>
      ),
    },
    {
      path: "/debug",
      element: (
        <ProtectedRoute>
          <AppShell>
            <DebugPage />
          </AppShell>
        </ProtectedRoute>
      ),
    },
    {
      path: "/settings",
      element: (
        <ProtectedRoute>
          <AppShell>
            <SettingsPage />
          </AppShell>
        </ProtectedRoute>
      ),
    },
    {
      path: "*",
      element: <NotFound />,
    },
  ],
  {
    initialEntries: ["/dashboard"],
  }
);
