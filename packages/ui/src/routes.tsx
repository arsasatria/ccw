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
import { Login } from "@/components/Login";
import ProtectedRoute from "@/components/ProtectedRoute";
import PublicRoute from "@/components/PublicRoute";

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
          <Dashboard />
        </ProtectedRoute>
      ),
    },
    {
      path: "/providers",
      element: (
        <ProtectedRoute>
          <ProvidersPage />
        </ProtectedRoute>
      ),
    },
    {
      path: "/router",
      element: (
        <ProtectedRoute>
          <RouterPage />
        </ProtectedRoute>
      ),
    },
    {
      path: "/transformers",
      element: (
        <ProtectedRoute>
          <TransformersPage />
        </ProtectedRoute>
      ),
    },
    {
      path: "/presets",
      element: (
        <ProtectedRoute>
          <PresetsPage />
        </ProtectedRoute>
      ),
    },
    {
      path: "/logs",
      element: (
        <ProtectedRoute>
          <LogsPage />
        </ProtectedRoute>
      ),
    },
    {
      path: "/debug",
      element: (
        <ProtectedRoute>
          <DebugPage />
        </ProtectedRoute>
      ),
    },
    {
      path: "/settings",
      element: (
        <ProtectedRoute>
          <SettingsPage />
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
