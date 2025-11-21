import { createBrowserRouter, Navigate } from "react-router-dom";

// Layouts and Guards
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import OnboardingGuard from "./components/auth/OnboardingGuard";
import AuthLayout from "./pages/auth/AuthLayout";

// Public Pages
import LandingPage from './pages/landing/LandingPage';
import RevoSendPage from './pages/landing/RevoSendPage';
import RevoFluxoPage from './pages/landing/RevoFluxoPage';

// Auth & Onboarding Pages
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignUpPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import PendingVerificationPage from './pages/auth/PendingVerificationPage';
import CallbackPage from "@/pages/auth/Callback";
import UpdatePasswordPage from "./pages/auth/UpdatePasswordPage";

// App Pages
import Dashboard from './pages/Dashboard';
import ProductsPage from './pages/products/ProductsPage';
import PartnersPage from './pages/partners/PartnersPage';
import UsersPage from './pages/settings/general/UsersPage';
import ServicesPage from './pages/services/ServicesPage';
import OSPage from './pages/os/OSPage';
import CarriersPage from './pages/carriers/CarriersPage';
import SalesDashboard from './pages/SalesDashboard';
import SalesGoalsPage from './pages/sales/SalesGoalsPage';
import ContasAReceberPage from './pages/financeiro/ContasAReceberPage';
import ContasPagarPage from './pages/financeiro/ContasPagarPage';
import CentrosDeCustoPage from './pages/financeiro/CentrosDeCustoPage';
import CepSearchPage from './pages/tools/CepSearchPage';
import CnpjSearchPage from './pages/tools/CnpjSearchPage';
import NfeInputPage from './pages/tools/NfeInputPage';
import LogsPage from './pages/dev/LogsPage';
import SupabaseDemoPage from './pages/tools/SupabaseDemoPage';
import SuccessPage from './pages/billing/SuccessPage';
import CancelPage from './pages/billing/CancelPage';

export const router = createBrowserRouter([
  // Public routes
  { path: "/", element: <LandingPage /> },
  { path: "/revo-send", element: <RevoSendPage /> },
  { path: "/revo-fluxo", element: <RevoFluxoPage /> },

  // Auth routes
  {
    path: "/auth",
    element: <AuthLayout />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "signup", element: <SignupPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "pending-verification", element: <PendingVerificationPage /> },
    ],
  },
  { path: "/auth/callback", element: <CallbackPage /> },
  { path: "/auth/update-password", element: <UpdatePasswordPage /> },
  { path: "/onboarding/accept", element: <UpdatePasswordPage /> },

  // Protected app routes
  {
    path: "/app",
    element: (
      <ProtectedRoute>
        <OnboardingGuard>
          <MainLayout />
        </OnboardingGuard>
      </ProtectedRoute>
    ),
    children: [
        { index: true, element: <Navigate to="dashboard" replace /> },
        
        // Dashboard
        { path: "dashboard", element: <Dashboard /> },
        
        // Cadastros
        { path: "products", element: <ProductsPage /> },
        { path: "partners", element: <PartnersPage /> },
        { path: "services", element: <ServicesPage /> },
        { path: "carriers", element: <CarriersPage /> },
        
        // Vendas
        { path: "sales-dashboard", element: <SalesDashboard /> },
        { path: "vendas/metas", element: <SalesGoalsPage /> },
        
        // Serviços
        { path: "ordens-de-servico", element: <OSPage /> },
        
        // Financeiro
        { path: "financeiro/contas-a-receber", element: <ContasAReceberPage /> },
        { path: "financeiro/contas-a-pagar", element: <ContasPagarPage /> },
        { path: "financeiro/centros-de-custo", element: <CentrosDeCustoPage /> },
        
        // Ferramentas
        { path: "cep-search", element: <CepSearchPage /> },
        { path: "cnpj-search", element: <CnpjSearchPage /> },
        { path: "nfe-input", element: <NfeInputPage /> },
        
        // Desenvolvedor
        { path: "desenvolvedor/logs", element: <LogsPage /> },
        { path: "desenvolvedor/supabase-demo", element: <SupabaseDemoPage /> },
        
        // Configurações
        { path: "configuracoes/geral/users", element: <UsersPage /> },
        
        // Billing
        { path: "billing/success", element: <SuccessPage /> },
        { path: "billing/cancel", element: <CancelPage /> },

        // Fallback
        { path: "*", element: <Navigate to="dashboard" replace /> },
    ]
  },

  // Catch-all
  { path: "*", element: <Navigate to="/" replace /> }
]);

export default router;
