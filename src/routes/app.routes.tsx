import React, { Suspense, lazy } from "react";
import { RouteObject, Navigate } from "react-router-dom";
import MainLayout from '../components/layout/MainLayout';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import OnboardingGuard from "../components/auth/OnboardingGuard";
import PageLoader from "../components/ui/PageLoader";

// App Pages (Lazy Loaded)
const Dashboard = lazy(() => import('../pages/Dashboard'));
const ProductsPage = lazy(() => import('../pages/products/ProductsPage'));
const PartnersPage = lazy(() => import('../pages/partners/PartnersPage'));
const CarriersPage = lazy(() => import("../pages/carriers/CarriersPage"));
const ServicesPage = lazy(() => import("../pages/services/ServicesPage"));
const SalesDashboard = lazy(() => import("../pages/SalesDashboard"));
const SalesGoalsPage = lazy(() => import("../pages/sales/SalesGoalsPage"));
const OSPage = lazy(() => import("../pages/os/OSPage"));
const ContasAReceberPage = lazy(() => import("../pages/financeiro/ContasAReceberPage"));
const ContasPagarPage = lazy(() => import("../pages/financeiro/ContasPagarPage"));
const CentrosDeCustoPage = lazy(() => import("../pages/financeiro/CentrosDeCustoPage"));
const TesourariaPage = lazy(() => import("../pages/financeiro/TesourariaPage"));
const CobrancasBancariasPage = lazy(() => import("../pages/financeiro/CobrancasBancariasPage"));
const ExtratoPage = lazy(() => import("../pages/financeiro/ExtratoPage"));
const CepSearchPage = lazy(() => import("../pages/tools/CepSearchPage"));
const CnpjSearchPage = lazy(() => import("../pages/tools/CnpjSearchPage"));
const NfeInputPage = lazy(() => import("../pages/tools/NfeInputPage"));
const XmlTesterPage = lazy(() => import('../pages/tools/XmlTesterPage'));
const LogsPage = lazy(() => import("../pages/dev/LogsPage"));
const SupabaseDemoPage = lazy(() => import("../pages/tools/SupabaseDemoPage"));

// RH Pages
const CargosPage = lazy(() => import("../pages/rh/CargosPage"));
const CompetenciasPage = lazy(() => import("../pages/rh/CompetenciasPage"));
const ColaboradoresPage = lazy(() => import("../pages/rh/ColaboradoresPage"));
const MatrizCompetenciasPage = lazy(() => import("../pages/rh/MatrizCompetenciasPage"));
const TreinamentosPage = lazy(() => import("../pages/rh/TreinamentosPage"));
const RHDashboard = lazy(() => import("../pages/rh/RHDashboard"));

// Indústria Pages
const IndustriaDashboardPage = lazy(() => import("../pages/industria/IndustriaDashboardPage"));
const ProducaoPage = lazy(() => import("../pages/industria/producao/ProducaoPage"));
const BeneficiamentoPage = lazy(() => import("../pages/industria/beneficiamento/BeneficiamentoPage"));
const BomsPage = lazy(() => import("../pages/industria/boms/BomsPage"));
const RoteirosPage = lazy(() => import("../pages/industria/RoteirosPage"));
const CentrosTrabalhoPage = lazy(() => import("../pages/industria/CentrosTrabalhoPage"));
const ExecucaoPage = lazy(() => import("../pages/industria/ExecucaoPage"));
const ChaoDeFabricaPage = lazy(() => import("../pages/industria/ChaoDeFabricaPage"));
const MateriaisClientePage = lazy(() => import("../pages/industria/MateriaisClientePage"));

// Suprimentos Pages
const EstoquePage = lazy(() => import("../pages/suprimentos/EstoquePage"));
const ComprasPage = lazy(() => import("../pages/suprimentos/ComprasPage"));
const RelatoriosSuprimentosPage = lazy(() => import("../pages/suprimentos/RelatoriosPage"));

// Vendas Pages
const PedidosVendasPage = lazy(() => import("../pages/vendas/PedidosVendasPage"));
const CrmPage = lazy(() => import("../pages/vendas/crm/CrmPage"));

export const appRoutes: RouteObject[] = [
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
            {
                path: "dashboard",
                element: <Suspense fallback={<PageLoader />}><Dashboard /></Suspense>
            },

            // Cadastros
            { path: "products", element: <Suspense fallback={<PageLoader />}><ProductsPage /></Suspense> },
            { path: "partners", element: <Suspense fallback={<PageLoader />}><PartnersPage /></Suspense> },
            { path: "carriers", element: <Suspense fallback={<PageLoader />}><CarriersPage /></Suspense> },
            { path: "services", element: <Suspense fallback={<PageLoader />}><ServicesPage /></Suspense> },

            // Indústria
            { path: "industria/dashboard", element: <Suspense fallback={<PageLoader />}><IndustriaDashboardPage /></Suspense> },
            { path: "industria/producao", element: <Suspense fallback={<PageLoader />}><ProducaoPage /></Suspense> },
            { path: "industria/beneficiamento", element: <Suspense fallback={<PageLoader />}><BeneficiamentoPage /></Suspense> },
            { path: "industria/boms", element: <Suspense fallback={<PageLoader />}><BomsPage /></Suspense> },
            { path: "industria/roteiros", element: <Suspense fallback={<PageLoader />}><RoteirosPage /></Suspense> },
            { path: "industria/centros-trabalho", element: <Suspense fallback={<PageLoader />}><CentrosTrabalhoPage /></Suspense> },
            { path: "industria/execucao", element: <Suspense fallback={<PageLoader />}><ExecucaoPage /></Suspense> },
            { path: "industria/chao-de-fabrica", element: <Suspense fallback={<PageLoader />}><ChaoDeFabricaPage /></Suspense> },
            { path: "industria/materiais-cliente", element: <Suspense fallback={<PageLoader />}><MateriaisClientePage /></Suspense> },

            // Vendas
            { path: "sales-dashboard", element: <Suspense fallback={<PageLoader />}><SalesDashboard /></Suspense> },
            { path: "vendas/metas", element: <Suspense fallback={<PageLoader />}><SalesGoalsPage /></Suspense> },
            { path: "vendas/pedidos", element: <Suspense fallback={<PageLoader />}><PedidosVendasPage /></Suspense> },
            { path: "vendas/crm", element: <Suspense fallback={<PageLoader />}><CrmPage /></Suspense> },

            // Serviços (Módulo)
            { path: "ordens-de-servico", element: <Suspense fallback={<PageLoader />}><OSPage /></Suspense> },

            // Suprimentos
            { path: "suprimentos/estoque", element: <Suspense fallback={<PageLoader />}><EstoquePage /></Suspense> },
            { path: "suprimentos/compras", element: <Suspense fallback={<PageLoader />}><ComprasPage /></Suspense> },
            { path: "nfe-input", element: <Suspense fallback={<PageLoader />}><NfeInputPage /></Suspense> },
            { path: "suprimentos/relatorios", element: <Suspense fallback={<PageLoader />}><RelatoriosSuprimentosPage /></Suspense> },

            // Financeiro
            { path: "financeiro/tesouraria", element: <Suspense fallback={<PageLoader />}><TesourariaPage /></Suspense> },
            { path: "financeiro/contas-a-receber", element: <Suspense fallback={<PageLoader />}><ContasAReceberPage /></Suspense> },
            { path: "financeiro/contas-a-pagar", element: <Suspense fallback={<PageLoader />}><ContasPagarPage /></Suspense> },
            { path: "financeiro/centros-de-custo", element: <Suspense fallback={<PageLoader />}><CentrosDeCustoPage /></Suspense> },
            { path: "financeiro/cobrancas", element: <Suspense fallback={<PageLoader />}><CobrancasBancariasPage /></Suspense> },
            { path: "financeiro/extrato", element: <Suspense fallback={<PageLoader />}><ExtratoPage /></Suspense> },

            // RH
            { path: "rh/dashboard", element: <Suspense fallback={<PageLoader />}><RHDashboard /></Suspense> },
            { path: "rh/cargos", element: <Suspense fallback={<PageLoader />}><CargosPage /></Suspense> },
            { path: "rh/competencias", element: <Suspense fallback={<PageLoader />}><CompetenciasPage /></Suspense> },
            { path: "rh/colaboradores", element: <Suspense fallback={<PageLoader />}><ColaboradoresPage /></Suspense> },
            { path: "rh/matriz", element: <Suspense fallback={<PageLoader />}><MatrizCompetenciasPage /></Suspense> },
            { path: "rh/treinamentos", element: <Suspense fallback={<PageLoader />}><TreinamentosPage /></Suspense> },

            // Ferramentas
            { path: "cep-search", element: <Suspense fallback={<PageLoader />}><CepSearchPage /></Suspense> },
            { path: "cnpj-search", element: <Suspense fallback={<PageLoader />}><CnpjSearchPage /></Suspense> },

            // Desenvolvedor
            { path: "desenvolvedor/logs", element: <Suspense fallback={<PageLoader />}><LogsPage /></Suspense> },
            { path: "desenvolvedor/supabase-demo", element: <Suspense fallback={<PageLoader />}><SupabaseDemoPage /></Suspense> },
            {
                path: 'tools/xml-tester',
                element: (
                    <Suspense fallback={<PageLoader />}>
                        <XmlTesterPage />
                    </Suspense>
                ),
            },

            // Fallback: Redireciona qualquer rota não encontrada dentro de /app para o dashboard
            { path: "*", element: <Navigate to="dashboard" replace /> },
        ]
    },
];
