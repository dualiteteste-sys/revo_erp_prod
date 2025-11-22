import { createBrowserRouter, Navigate } from "react-router-dom";

// Layouts and Guards
import MainLayout from './components/layout/MainLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import OnboardingGuard from "./components/auth/OnboardingGuard";
import AuthLayout from "./pages/auth/AuthLayout";

// Public Pages
import LandingPage from './pages/landing/LandingPage';

// Auth & Onboarding Pages
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignUpPage";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import PendingVerificationPage from './pages/auth/PendingVerificationPage';
import CallbackPage from "@/pages/auth/Callback";
import UpdatePasswordPage from "./pages/auth/UpdatePasswordPage";
import ConfirmedPage from "./pages/auth/Confirmed";
import AcceptInvite from "./pages/onboarding/AcceptInvite";

// App Pages
import Dashboard from './pages/Dashboard';
import ProductsPage from './pages/products/ProductsPage';
import PartnersPage from './pages/partners/PartnersPage';
import CarriersPage from "./pages/carriers/CarriersPage";
import ServicesPage from "./pages/services/ServicesPage";
import SalesDashboard from "./pages/SalesDashboard";
import SalesGoalsPage from "./pages/sales/SalesGoalsPage";
import OSPage from "./pages/os/OSPage";
import ContasAReceberPage from "./pages/financeiro/ContasAReceberPage";
import ContasPagarPage from "./pages/financeiro/ContasPagarPage";
import CentrosDeCustoPage from "./pages/financeiro/CentrosDeCustoPage";
import CepSearchPage from "./pages/tools/CepSearchPage";
import CnpjSearchPage from "./pages/tools/CnpjSearchPage";
import NfeInputPage from "./pages/tools/NfeInputPage";
import LogsPage from "./pages/dev/LogsPage";
import SupabaseDemoPage from "./pages/tools/SupabaseDemoPage";

// RH Pages
import CargosPage from "./pages/rh/CargosPage";
import CompetenciasPage from "./pages/rh/CompetenciasPage";
import ColaboradoresPage from "./pages/rh/ColaboradoresPage";
import MatrizCompetenciasPage from "./pages/rh/MatrizCompetenciasPage";
import TreinamentosPage from "./pages/rh/TreinamentosPage";
import RHDashboard from "./pages/rh/RHDashboard";

// Suprimentos Pages
import EstoquePage from "./pages/suprimentos/EstoquePage";
import ComprasPage from "./pages/suprimentos/ComprasPage";

// Vendas Pages
import PedidosVendasPage from "./pages/vendas/PedidosVendasPage";

export const router = createBrowserRouter([
  // Public routes
  { path: "/", element: <LandingPage /> },

  // Auth routes (Layout com Card Branco)
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
  
  // Rotas de Auth Standalone (Processamento/Bootstrap)
  { path: "/auth/callback", element: <CallbackPage /> },
  { path: "/auth/confirmed", element: <ConfirmedPage /> },
  { path: "/auth/update-password", element: <UpdatePasswordPage /> },
  { path: "/onboarding/accept", element: <AcceptInvite /> },

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
        { path: "dashboard", element: <Dashboard /> },
        
        // Cadastros
        { path: "products", element: <ProductsPage /> },
        { path: "partners", element: <PartnersPage /> },
        { path: "carriers", element: <CarriersPage /> },
        { path: "services", element: <ServicesPage /> },

        // Vendas
        { path: "sales-dashboard", element: <SalesDashboard /> },
        { path: "vendas/metas", element: <SalesGoalsPage /> },
        { path: "vendas/pedidos", element: <PedidosVendasPage /> },

        // Serviços (Módulo)
        { path: "ordens-de-servico", element: <OSPage /> },

        // Suprimentos
        { path: "suprimentos/estoque", element: <EstoquePage /> },
        { path: "suprimentos/compras", element: <ComprasPage /> },
        { path: "nfe-input", element: <NfeInputPage /> },

        // Financeiro
        { path: "financeiro/contas-a-receber", element: <ContasAReceberPage /> },
        { path: "financeiro/contas-a-pagar", element: <ContasPagarPage /> },
        { path: "financeiro/centros-de-custo", element: <CentrosDeCustoPage /> },

        // RH
        { path: "rh/dashboard", element: <RHDashboard /> },
        { path: "rh/cargos", element: <CargosPage /> },
        { path: "rh/competencias", element: <CompetenciasPage /> },
        { path: "rh/colaboradores", element: <ColaboradoresPage /> },
        { path: "rh/matriz", element: <MatrizCompetenciasPage /> },
        { path: "rh/treinamentos", element: <TreinamentosPage /> },

        // Ferramentas
        { path: "cep-search", element: <CepSearchPage /> },
        { path: "cnpj-search", element: <CnpjSearchPage /> },

        // Desenvolvedor
        { path: "desenvolvedor/logs", element: <LogsPage /> },
        { path: "desenvolvedor/supabase-demo", element: <SupabaseDemoPage /> },

        // Fallback: Redireciona qualquer rota não encontrada dentro de /app para o dashboard
        { path: "*", element: <Navigate to="dashboard" replace /> },
    ]
  },

  // Catch-all global: Redireciona para a landing page
  { path: "*", element: <Navigate to="/" replace /> }
]);

export default router;
