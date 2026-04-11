import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PortalLayout } from "@/components/layout";

const Login = lazy(() => import("@/pages/login"));
const ChangePassword = lazy(() => import("@/pages/change-password"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Invoices = lazy(() => import("@/pages/invoices"));
const InvoiceDetail = lazy(() => import("@/pages/invoice-detail"));
const Tickets = lazy(() => import("@/pages/tickets"));
const TicketDetail = lazy(() => import("@/pages/ticket-detail"));
const NewTicket = lazy(() => import("@/pages/new-ticket"));
const Profile = lazy(() => import("@/pages/profile"));
const { KBPage, KBArticlePage } = { KBPage: lazy(() => import("@/pages/kb").then(m => ({ default: m.KBPage }))), KBArticlePage: lazy(() => import("@/pages/kb").then(m => ({ default: m.KBArticlePage }))) };

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
    },
  },
});

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, mustChangePassword } = useAuth();
  const [location] = useLocation();

  if (loading) return <Spinner />;
  if (!isAuthenticated) return <Redirect to="/login" />;
  if (mustChangePassword && location !== "/change-password") {
    return <Redirect to="/change-password" />;
  }

  return (
    <PortalLayout>
      <Suspense fallback={<Spinner />}>
        {children}
      </Suspense>
    </PortalLayout>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login">
        <Suspense fallback={<Spinner />}><Login /></Suspense>
      </Route>
      <Route path="/change-password">
        <Suspense fallback={<Spinner />}><ChangePassword /></Suspense>
      </Route>

      <Route path="/">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/invoices">
        <ProtectedRoute><Invoices /></ProtectedRoute>
      </Route>
      <Route path="/invoices/:id">
        <ProtectedRoute><InvoiceDetail /></ProtectedRoute>
      </Route>
      <Route path="/tickets/new">
        <ProtectedRoute><NewTicket /></ProtectedRoute>
      </Route>
      <Route path="/tickets/:id">
        <ProtectedRoute><TicketDetail /></ProtectedRoute>
      </Route>
      <Route path="/tickets">
        <ProtectedRoute><Tickets /></ProtectedRoute>
      </Route>
      <Route path="/profile">
        <ProtectedRoute><Profile /></ProtectedRoute>
      </Route>
      <Route path="/kb/:id">
        <ProtectedRoute><KBArticlePage /></ProtectedRoute>
      </Route>
      <Route path="/kb">
        <ProtectedRoute><KBPage /></ProtectedRoute>
      </Route>

      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
