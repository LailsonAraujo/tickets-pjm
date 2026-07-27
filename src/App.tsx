import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Tickets from "./pages/Tickets";
import TicketDetail from "./pages/TicketDetail";
import Provisioning from "./pages/Provisioning";
import UsersPage from "./pages/UsersPage";
import Logs from "./pages/Logs";
import Monitor from "./pages/Monitor";
import Reports from "./pages/Reports";
import SsoConsume from "./pages/SsoConsume";
import Providers from "./pages/Providers";
import Transits from "./pages/Transits";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();

  // Rota pública de consumo SSO — não pode ficar atrás do gate de auth.
  if (typeof window !== "undefined" && window.location.pathname === "/sso/consume") {
    return (
      <Routes>
        <Route path="/sso/consume" element={<SsoConsume />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground font-mono text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Auth />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tickets" element={<Tickets />} />
        <Route path="/tickets/:id" element={<TicketDetail />} />
        <Route path="/provisioning" element={<Provisioning />} />
        <Route path="/monitor" element={<Monitor />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/providers" element={<Providers />} />
        
        <Route path="/users" element={<UsersPage />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
