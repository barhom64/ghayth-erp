import { lazy, Suspense, useEffect } from "react";
import { connectRealtime } from "@/lib/realtime";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AppProvider, useAppContext } from "@/contexts/app-context";
import { SettingsProvider } from "@/contexts/settings-context";
import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { ErrorBoundary } from "@/components/error-boundary";
import { PageErrorBoundary } from "@/components/page-error-boundary";
import type { ModuleType } from "@/contexts/app-context";

import { hrRoutes } from "@/routes/hrRoutes";
import { financeRoutes } from "@/routes/financeRoutes";
import { fleetRoutes } from "@/routes/fleetRoutes";
import { governanceRoutes } from "@/routes/governanceRoutes";
import { biRoutes } from "@/routes/biRoutes";
import { adminRoutes } from "@/routes/adminRoutes";
import { settingsRoutes } from "@/routes/settingsRoutes";
import { legalRoutes } from "@/routes/legalRoutes";
import { propertyRoutes } from "@/routes/propertyRoutes";
import { storeRoutes } from "@/routes/storeRoutes";
import { documentsRoutes } from "@/routes/documentsRoutes";
import { requestsRoutes } from "@/routes/requestsRoutes";
import { commsRoutes } from "@/routes/commsRoutes";
import { miscRoutes } from "@/routes/miscRoutes";
import { umrahRoutes } from "@/routes/umrahRoutes";
import { websiteRoutes } from "@/routes/websiteRoutes";
import { warehouseRoutes } from "@/routes/warehouseRoutes";

import Login from "@/pages/login";
import Setup from "@/pages/setup";
import NotFound from "@/pages/not-found";

const Dashboard = lazy(() => import("@/pages/dashboard"));
const PrintVerify = lazy(() => import("@/pages/print-verify"));
const OnboardingSelf = lazy(() => import("@/pages/onboarding-self"));
const ResetPassword = lazy(() => import("@/pages/reset-password"));
// Standalone /driver-portal/* retired (#1354) — drivers now log in
// via the regular /login and land on /me/driver (dashboard auto-
// redirects them based on user.role === "driver").

interface RouteConfig {
  path: string;
  component: React.LazyExoticComponent<any>;
  module?: ModuleType;
  subKey?: string;
  minRoleLevel?: number;
}

const tagRoutes = (routes: { path: string; component: any; subKey?: string; minRoleLevel?: number }[], module: ModuleType, minRoleLevel?: number): RouteConfig[] =>
  routes.map(r => ({ ...r, module, minRoleLevel: r.minRoleLevel ?? minRoleLevel }));

const allModuleRoutes: RouteConfig[] = [
  ...tagRoutes(hrRoutes, "hr"),
  ...tagRoutes(financeRoutes, "finance"),
  ...tagRoutes(fleetRoutes, "fleet"),
  ...tagRoutes(governanceRoutes, "governance", 60),
  ...tagRoutes(biRoutes, "bi", 40),
  ...tagRoutes(legalRoutes, "legal", 40),
  ...tagRoutes(propertyRoutes, "property"),
  ...tagRoutes(storeRoutes, "store"),
  ...tagRoutes(documentsRoutes, "documents"),
  ...tagRoutes(requestsRoutes, "requests"),
  ...tagRoutes(commsRoutes, "comms"),
  ...tagRoutes(adminRoutes, "admin", 90),
  ...tagRoutes(settingsRoutes, "settings", 70),
  // VIS-001 (Ghaith Operating Foundation): umrah is a leader track and must be
  // gated by its own module exactly like fleet/property/finance. It was
  // previously spread raw (no module gate), so any authenticated user could
  // reach /umrah/* directly. featureCatalog defines umrah under moduleKey
  // "umrah", so umrah-granted users carry "umrah" in allowedModules; owners/GM
  // keep ALL_MODULES. See docs/frontend/PAGE_VISIBILITY_INVENTORY.md.
  ...tagRoutes(umrahRoutes, "umrah"),
  ...tagRoutes(warehouseRoutes, "warehouse"),
  ...tagRoutes(websiteRoutes, "website"),
  ...miscRoutes,
];

// QueryCache + MutationCache with noop onError — without this, a query that
// fails with ApiError has a brief window where React Query considers the
// rejection "unhandled" (even though it's stored in .error), which trips
// Replit's runtime-error-modal overlay. Registering onError tells React
// Query we acknowledge errors globally; the actual user-facing message
// still comes from <PageStateWrapper> which reads .error from the hook.
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: () => { /* handled by PageStateWrapper */ } }),
  mutationCache: new MutationCache({ onError: () => { /* handled by useApiMutation toast */ } }),
  defaultOptions: {
    queries: {
      retry: 1,
      // Refetch when the user returns to the tab/app, so data is fresh the
      // moment they look — the cheap half of "stay live-linked with the web".
      // The other half is the realtime SSE push (lib/realtime.ts).
      refetchOnWindowFocus: true,
      throwOnError: false,
    },
    mutations: {
      throwOnError: false,
    },
  },
});

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center" dir="rtl">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-xl font-bold text-gray-800 mb-2">غير مصرح بالوصول</h2>
      <p className="text-muted-foreground">ليس لديك صلاحية الوصول لهذا القسم بالدور الحالي</p>
    </div>
  );
}

function ModuleRoute({ Component, module, subKey, minRoleLevel }: { Component: React.LazyExoticComponent<any>; module?: ModuleType; subKey?: string; minRoleLevel?: number }) {
  // GAP_MATRIX P1 — use effectiveRoleLevel (highest across all RBAC assignments)
  // to match the sidebar, which also uses effectiveRoleLevel. Using roleLevel
  // (assignment-only) caused a divergence where the sidebar hid a link but the
  // route still rendered (or vice versa) for users with multiple role grants.
  const { canAccessModule, canAccessSubPage, effectiveRoleLevel, isFeatureEnabled } = useAppContext();

  const blocked =
    (module && !canAccessModule(module)) ||
    // VIS-002: partial activation — block routes of a track the company
    // disabled. Default-ON (empty disabled set) ⇒ no behaviour change.
    (module && !isFeatureEnabled(module)) ||
    (subKey && module && !canAccessSubPage(module, subKey)) ||
    (minRoleLevel !== undefined && effectiveRoleLevel < minRoleLevel);

  if (blocked) return <AccessDenied />;
  return (
    <PageErrorBoundary>
      <Component />
    </PageErrorBoundary>
  );
}

function ProtectedRoutes() {
  return (
    <SidebarLayout>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />

          {allModuleRoutes.map((r) => (
            <Route key={r.path} path={r.path}>
              <ModuleRoute Component={r.component} module={r.module} subKey={r.subKey} minRoleLevel={r.minRoleLevel} />
            </Route>
          ))}

          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </SidebarLayout>
  );
}

function Router() {
  const { isAuthenticated, loading } = useAuth();
  // Live link: while authenticated, hold an SSE connection so server-side
  // changes (anyone, anywhere in this company) push in and the open screens
  // refetch — no manual refresh. Tears down on logout / unmount.
  useEffect(() => {
    if (!isAuthenticated) return;
    const disconnect = connectRealtime(queryClient);
    return disconnect;
  }, [isAuthenticated]);
  if (loading) return <PageLoader />;
  return (
    <Switch>
      <Route path="/login" component={Login} />
      {/* B1 + B3 — first-time setup. Unauthenticated. The page guards
          itself against double-setup by probing /auth/setup-state on
          mount and redirecting to /login if any company exists. */}
      <Route path="/setup" component={Setup} />
      {/* Public QR-verify page — every PDF the print engine emits embeds a
          QR pointing here, so regulators / counter staff can confirm a
          doc's audit row without an ERP account. The /api/print/verify/:jobId
          endpoint backing it is anonymous + rate-limited server-side. */}
      <Route path="/print/verify/:jobId">
        <Suspense fallback={<PageLoader />}>
          <PrintVerify />
        </Suspense>
      </Route>
      {/* صفحة الاستكمال الذاتي للموظف — عامة (?token=...). يملأ الموظف بياناته
          الشخصية فقط؛ الخلفية تتحقق من الرمز ولا تمنح أي دخول للنظام. */}
      <Route path="/onboarding">
        <Suspense fallback={<PageLoader />}>
          <OnboardingSelf />
        </Suspense>
      </Route>
      {/* Public token pages (?token=...) — set/reset password without a
          session. BOTH must be registered here, BEFORE the authenticated
          catch-all below; otherwise the link falls through to the catch-all
          and "enters the system" instead of showing the set-password form.
          /reset-password = forgot-password links; /activate = new-user
          invitation + activation links. One component, endpoint chosen by
          path. */}
      <Route path="/reset-password">
        <Suspense fallback={<PageLoader />}>
          <ResetPassword />
        </Suspense>
      </Route>
      <Route path="/activate">
        <Suspense fallback={<PageLoader />}>
          <ResetPassword />
        </Suspense>
      </Route>
      {/* /driver-portal/* retired (#1354) — drivers now use the regular
          /login + RBAC role gating; their dashboard is /me/driver. */}
      <Route>
        {isAuthenticated ? <ProtectedRoutes /> : <Redirect to="/login" />}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <AppProvider>
                <SettingsProvider>
                  <Router />
                </SettingsProvider>
              </AppProvider>
            </AuthProvider>
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
