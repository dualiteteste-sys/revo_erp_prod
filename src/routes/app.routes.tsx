import React, { Suspense } from "react";
import { RouteObject, Navigate } from "react-router-dom";
import MainLayout from '../components/layout/MainLayout';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import OnboardingGuard from "../components/auth/OnboardingGuard";
import PageLoader from "../components/ui/PageLoader";
import { lazyImport } from "../utils/lazyImport";

// App Pages (Lazy Loaded)
const Dashboard = lazyImport(() => import('../pages/Dashboard'));
const ProductsPage = lazyImport(() => import('../pages/products/ProductsPage'));
const PartnersPage = lazyImport(() => import('../pages/partners/PartnersPage'));
const CarriersPage = lazyImport(() => import("../pages/carriers/CarriersPage"));
const ServicesPage = lazyImport(() => import("../pages/services/ServicesPage"));
const GrupoProdutosPage = lazyImport(() => import("../pages/cadastros/GrupoProdutosPage"));
const UnidadesPage = lazyImport(() => import("../pages/cadastros/UnidadesPage"));
const EmbalagensPage = lazyImport(() => import("../pages/cadastros/EmbalagensPage"));
const SalesDashboard = lazyImport(() => import("../pages/SalesDashboard"));
const SalesGoalsPage = lazyImport(() => import("../pages/sales/SalesGoalsPage"));
const OSPage = lazyImport(() => import("../pages/os/OSPage"));
const ContasAReceberPage = lazyImport(() => import("../pages/financeiro/ContasAReceberPage"));
const ContasPagarPage = lazyImport(() => import("../pages/financeiro/ContasPagarPage"));
const CentrosDeCustoPage = lazyImport(() => import("../pages/financeiro/CentrosDeCustoPage"));
const TesourariaPage = lazyImport(() => import("../pages/financeiro/TesourariaPage"));
const CobrancasBancariasPage = lazyImport(() => import("../pages/financeiro/CobrancasBancariasPage"));
const ExtratoPage = lazyImport(() => import("../pages/financeiro/ExtratoPage"));
const CepSearchPage = lazyImport(() => import("../pages/tools/CepSearchPage"));
const CnpjSearchPage = lazyImport(() => import("../pages/tools/CnpjSearchPage"));
const NfeInputPage = lazyImport(() => import("../pages/tools/NfeInputPage"));
const XmlTesterPage = lazyImport(() => import('../pages/tools/XmlTesterPage'));
const LogsPage = lazyImport(() => import("../pages/dev/LogsPage"));
const SupabaseDemoPage = lazyImport(() => import("../pages/tools/SupabaseDemoPage"));

// RH Pages
const CargosPage = lazyImport(() => import("../pages/rh/CargosPage"));
const CompetenciasPage = lazyImport(() => import("../pages/rh/CompetenciasPage"));
const ColaboradoresPage = lazyImport(() => import("../pages/rh/ColaboradoresPage"));
const MatrizCompetenciasPage = lazyImport(() => import("../pages/rh/MatrizCompetenciasPage"));
const TreinamentosPage = lazyImport(() => import("../pages/rh/TreinamentosPage"));
const RHDashboard = lazyImport(() => import("../pages/rh/RHDashboard"));

// Indústria Pages
const IndustriaDashboardPage = lazyImport(() => import("../pages/industria/IndustriaDashboardPage"));
const ProducaoPage = lazyImport(() => import("../pages/industria/producao/ProducaoPage"));
const BeneficiamentoPage = lazyImport(() => import("../pages/industria/beneficiamento/BeneficiamentoPage"));
const BomsPage = lazyImport(() => import("../pages/industria/boms/BomsPage"));
const RoteirosPage = lazyImport(() => import("../pages/industria/RoteirosPage"));
const CentrosTrabalhoPage = lazyImport(() => import("../pages/industria/CentrosTrabalhoPage"));
const ExecucaoPage = lazyImport(() => import("../pages/industria/ExecucaoPage"));
const ChaoDeFabricaPage = lazyImport(() => import("../pages/industria/ChaoDeFabricaPage"));
const MotivosRefugoPage = lazyImport(() => import("../pages/industria/qualidade/MotivosRefugoPage"));
const PlanosInspecaoPage = lazyImport(() => import("../pages/industria/qualidade/PlanosInspecaoPage"));
const MateriaisClientePage = lazyImport(() => import("../pages/industria/MateriaisClientePage"));
const MrpDemandasPage = lazyImport(() => import("../pages/industria/mrp/MrpDemandasPage"));
const PcpDashboardPage = lazyImport(() => import("../pages/industria/pcp/PcpDashboardPage"));

// Suprimentos Pages
const EstoquePage = lazyImport(() => import("../pages/suprimentos/EstoquePage"));
const ComprasPage = lazyImport(() => import("../pages/suprimentos/ComprasPage"));
const RelatoriosSuprimentosPage = lazyImport(() => import("../pages/suprimentos/RelatoriosPage"));
const RecebimentoListPage = lazyImport(() => import("../pages/suprimentos/RecebimentoListPage"));
const ConferenciaPage = lazyImport(() => import("../pages/suprimentos/ConferenciaPage"));
const RecebimentoManualPage = lazyImport(() => import("../pages/suprimentos/RecebimentoManualPage"));

// Vendas Pages
const PedidosVendasPage = lazyImport(() => import("../pages/vendas/PedidosVendasPage"));
const CrmPage = lazyImport(() => import("../pages/vendas/crm/CrmPage"));

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
            { path: "cadastros/grupos-produtos", element: <Suspense fallback={<PageLoader />}><GrupoProdutosPage /></Suspense> },
            { path: "cadastros/unidades-medida", element: <Suspense fallback={<PageLoader />}><UnidadesPage /></Suspense> },
            { path: "cadastros/embalagens", element: <Suspense fallback={<PageLoader />}><EmbalagensPage /></Suspense> },

            // Indústria
            { path: "industria/qualidade/motivos", element: <Suspense fallback={<PageLoader />}><MotivosRefugoPage /></Suspense> },
            { path: "industria/qualidade/planos", element: <Suspense fallback={<PageLoader />}><PlanosInspecaoPage /></Suspense> },
            { path: "industria/dashboard", element: <Suspense fallback={<PageLoader />}><IndustriaDashboardPage /></Suspense> },
            { path: "industria/producao", element: <Suspense fallback={<PageLoader />}><ProducaoPage /></Suspense> },
            { path: "industria/beneficiamento", element: <Suspense fallback={<PageLoader />}><BeneficiamentoPage /></Suspense> },
            { path: "industria/mrp", element: <Suspense fallback={<PageLoader />}><MrpDemandasPage /></Suspense> },
            { path: "industria/pcp", element: <Suspense fallback={<PageLoader />}><PcpDashboardPage /></Suspense> },
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
            { path: "suprimentos/recebimentos", element: <Suspense fallback={<PageLoader />}><RecebimentoListPage /></Suspense> },
            { path: "suprimentos/recebimento-manual", element: <Suspense fallback={<PageLoader />}><RecebimentoManualPage /></Suspense> },
            { path: "suprimentos/recebimento/:id", element: <Suspense fallback={<PageLoader />}><ConferenciaPage /></Suspense> },

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
