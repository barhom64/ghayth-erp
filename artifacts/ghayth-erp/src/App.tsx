import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

import Login from "@/pages/login";
import NotFound from "@/pages/not-found";

const Dashboard = lazy(() => import("@/pages/dashboard"));

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
  ...umrahRoutes,
  ...miscRoutes,
];

const queryClient = new QueryClient();

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
      <p className="text-gray-500">ليس لديك صلاحية الوصول لهذا القسم بالدور الحالي</p>
    </div>
  );
}

function ModuleRoute({ Component, module, subKey, minRoleLevel }: { Component: React.LazyExoticComponent<any>; module?: ModuleType; subKey?: string; minRoleLevel?: number }) {
  const { canAccessModule, canAccessSubPage, roleLevel } = useAppContext();

  const blocked =
    (module && !canAccessModule(module)) ||
    (subKey && module && !canAccessSubPage(module, subKey)) ||
    (minRoleLevel !== undefined && roleLevel < minRoleLevel);

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
  const { isAuthenticated } = useAuth();
  return (
    <Switch>
      <Route path="/login" component={Login} />
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
