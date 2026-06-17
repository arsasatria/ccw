// Route-level guard for protected pages (Dashboard, Providers, etc.).
// Intentionally a no-op: authentication is enforced at the API layer via
// 401 responses. When api.ts sees a 401, it dispatches `unauthorized` and
// the listener in main.tsx navigates to /login. This keeps the gating
// logic in one place (the server's auth middleware + the API client) and
// means the UI doesn't have to duplicate "is the user logged in?" logic
// at every route. The downside is that pages render briefly before the
// 401 fires — the skeleton loader in AppShell covers that window.
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  return children;
};

export default ProtectedRoute;