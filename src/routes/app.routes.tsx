import React, { Suspense } from "react";
import { RouteObject, Navigate } from "react-router-dom";
import MainLayout from '../components/layout/MainLayout';
import ProtectedRoute from '../components/layout/ProtectedRoute';
import OnboardingGuard from "../components/auth/OnboardingGuard";
import RequirePermission from "../components/auth/RequirePermission";
import PageLoader from "../components/ui/PageLoader";
import { lazyImport } from "../utils/lazyImport";
import PlanGuard from "../components/layout/PlanGuard";

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
const OsRelatoriosPage = lazyImport(() => import("../pages/os/OsRelatoriosPage"));
const ContasAReceberPage = lazyImport(() => import("../pages/financeiro/ContasAReceberPage"));
const ContasPagarPage = lazyImport(() => import("../pages/financeiro/ContasPagarPage"));
const CentrosDeCustoPage = lazyImport(() => import("../pages/financeiro/CentrosDeCustoPage"));
const TesourariaPage = lazyImport(() => import("../pages/financeiro/TesourariaPage"));
const CobrancasBancariasPage = lazyImport(() => import("../pages/financeiro/CobrancasBancariasPage"));
const ExtratoPage = lazyImport(() => import("../pages/financeiro/ExtratoPage"));
const RelatoriosFinanceiroPage = lazyImport(() => import("../pages/financeiro/RelatoriosFinanceiroPage"));
const RelatoriosHubPage = lazyImport(() => import("../pages/relatorios/RelatoriosHubPage"));
const CepSearchPage = lazyImport(() => import("../pages/tools/CepSearchPage"));
const CnpjSearchPage = lazyImport(() => import("../pages/tools/CnpjSearchPage"));
const NfeInputPage = lazyImport(() => import("../pages/tools/NfeInputPage"));
const XmlTesterPage = lazyImport(() => import('../pages/tools/XmlTesterPage'));
const LogsPage = lazyImport(() => import("../pages/dev/LogsPage"));
const SupabaseDemoPage = lazyImport(() => import("../pages/tools/SupabaseDemoPage"));
const SettingsPage = lazyImport(() => import("../pages/settings/SettingsPage"));

// Fiscal Pages
const NfeEmissoesPage = lazyImport(() => import("../pages/fiscal/NfeEmissoesPage"));
const NfeSettingsPage = lazyImport(() => import("../pages/fiscal/NfeSettingsPage"));

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
const OrdensPage = lazyImport(() => import("../pages/industria/OrdensPage"));
const BomsPage = lazyImport(() => import("../pages/industria/boms/BomsPage"));
const RoteirosPage = lazyImport(() => import("../pages/industria/RoteirosPage"));
const CentrosTrabalhoPage = lazyImport(() => import("../pages/industria/CentrosTrabalhoPage"));
const ExecucaoPage = lazyImport(() => import("../pages/industria/ExecucaoPage"));
const ChaoDeFabricaPage = lazyImport(() => import("../pages/industria/ChaoDeFabricaPage"));
const OperadorPage = lazyImport(() => import("../pages/industria/OperadorPage"));
const OperadoresPage = lazyImport(() => import("../pages/industria/OperadoresPage"));
const AutomacaoPage = lazyImport(() => import("../pages/industria/AutomacaoPage"));
const MotivosRefugoPage = lazyImport(() => import("../pages/industria/qualidade/MotivosRefugoPage"));
const PlanosInspecaoPage = lazyImport(() => import("../pages/industria/qualidade/PlanosInspecaoPage"));
const LotesQualidadePage = lazyImport(() => import("../pages/industria/qualidade/LotesQualidadePage"));
const MateriaisClientePage = lazyImport(() => import("../pages/industria/MateriaisClientePage"));
const MrpDemandasPage = lazyImport(() => import("../pages/industria/mrp/MrpDemandasPage"));
const PcpDashboardPage = lazyImport(() => import("../pages/industria/pcp/PcpDashboardPage"));
const StatusBeneficiamentosPage = lazyImport(() => import("../pages/industria/StatusBeneficiamentosPage"));
const RelatoriosIndustriaPage = lazyImport(() => import("../pages/industria/RelatoriosIndustriaPage"));

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
const PropostasPage = lazyImport(() => import("../pages/vendas/PropostasPage"));
const PdvPage = lazyImport(() => import("../pages/vendas/PdvPage"));
const ExpedicaoPage = lazyImport(() => import("../pages/vendas/ExpedicaoPage"));
const ComissoesPage = lazyImport(() => import("../pages/vendas/ComissoesPage"));
const AutomacoesVendasPage = lazyImport(() => import("../pages/vendas/AutomacoesVendasPage"));
const DevolucoesPage = lazyImport(() => import("../pages/vendas/DevolucoesPage"));
const RelatoriosVendasPage = lazyImport(() => import("../pages/vendas/RelatoriosVendasPage"));

// Cadastros extras
const VendedoresPage = lazyImport(() => import("../pages/cadastros/VendedoresPage"));

// Serviços (Contratos/Notas/Cobranças)
const ContratosServicosPage = lazyImport(() => import("../pages/servicos/ContratosPage"));
const NotasServicoPage = lazyImport(() => import("../pages/servicos/NotasServicoPage"));
const CobrancasServicosPage = lazyImport(() => import("../pages/servicos/CobrancasServicosPage"));

// Suporte
const SuportePage = lazyImport(() => import("../pages/support/SuportePage"));

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

            // Configurações (painel)
            { path: "configuracoes", element: <Navigate to="/app/configuracoes/geral/empresa" replace /> },
            { path: "configuracoes/:section/:page", element: <Suspense fallback={<PageLoader />}><SettingsPage /></Suspense> },

            // Cadastros
            { path: "products", element: <Suspense fallback={<PageLoader />}><ProductsPage /></Suspense> },
            { path: "partners", element: <Suspense fallback={<PageLoader />}><PartnersPage /></Suspense> },
            { path: "carriers", element: <Suspense fallback={<PageLoader />}><CarriersPage /></Suspense> },
            { path: "services", element: <PlanGuard feature="servicos"><Suspense fallback={<PageLoader />}><ServicesPage /></Suspense></PlanGuard> },
            { path: "cadastros/grupos-produtos", element: <Suspense fallback={<PageLoader />}><GrupoProdutosPage /></Suspense> },
            { path: "cadastros/unidades-medida", element: <Suspense fallback={<PageLoader />}><UnidadesPage /></Suspense> },
            { path: "cadastros/embalagens", element: <Suspense fallback={<PageLoader />}><EmbalagensPage /></Suspense> },
            {
              path: "cadastros/vendedores",
              element: (
                <RequirePermission permission={{ domain: "vendedores", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><VendedoresPage /></Suspense>
                </RequirePermission>
              ),
            },

            // Indústria
            { path: "industria/qualidade/motivos", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><MotivosRefugoPage /></Suspense></PlanGuard> },
            { path: "industria/qualidade/planos", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><PlanosInspecaoPage /></Suspense></PlanGuard> },
            { path: "industria/qualidade/lotes", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><LotesQualidadePage /></Suspense></PlanGuard> },
            { path: "industria/dashboard", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><IndustriaDashboardPage /></Suspense></PlanGuard> },
            { path: "industria/status-beneficiamentos", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><StatusBeneficiamentosPage /></Suspense></PlanGuard> },
            { path: "industria/producao", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><ProducaoPage /></Suspense></PlanGuard> },
            { path: "industria/ordens", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><OrdensPage /></Suspense></PlanGuard> },
            { path: "industria/mrp", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><MrpDemandasPage /></Suspense></PlanGuard> },
            { path: "industria/pcp", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><PcpDashboardPage /></Suspense></PlanGuard> },
            { path: "industria/relatorios", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><RelatoriosIndustriaPage /></Suspense></PlanGuard> },
            { path: "industria/boms", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><BomsPage /></Suspense></PlanGuard> },
            { path: "industria/roteiros", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><RoteirosPage /></Suspense></PlanGuard> },
            { path: "industria/centros-trabalho", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><CentrosTrabalhoPage /></Suspense></PlanGuard> },
            { path: "industria/execucao", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><ExecucaoPage /></Suspense></PlanGuard> },
            { path: "industria/chao-de-fabrica", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><ChaoDeFabricaPage /></Suspense></PlanGuard> },
            { path: "industria/operador", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><OperadorPage /></Suspense></PlanGuard> },
            { path: "industria/operadores", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><OperadoresPage /></Suspense></PlanGuard> },
            { path: "industria/automacao", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><AutomacaoPage /></Suspense></PlanGuard> },
            { path: "industria/materiais-cliente", element: <PlanGuard feature="industria"><Suspense fallback={<PageLoader />}><MateriaisClientePage /></Suspense></PlanGuard> },

            // Vendas
            { path: "sales-dashboard", element: <Suspense fallback={<PageLoader />}><SalesDashboard /></Suspense> },
            { path: "vendas/metas", element: <Suspense fallback={<PageLoader />}><SalesGoalsPage /></Suspense> },
            { path: "vendas/pedidos", element: <Suspense fallback={<PageLoader />}><PedidosVendasPage /></Suspense> },
            { path: "vendas/crm", element: <Suspense fallback={<PageLoader />}><CrmPage /></Suspense> },
            {
              path: "vendas/propostas",
              element: (
                <RequirePermission permission={{ domain: "vendas", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><PropostasPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "vendas/pdv",
              element: (
                <RequirePermission permission={{ domain: "vendas", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><PdvPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "vendas/expedicao",
              element: (
                <RequirePermission permission={{ domain: "vendas", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><ExpedicaoPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "vendas/comissoes",
              element: (
                <RequirePermission permission={{ domain: "vendas", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><ComissoesPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "vendas/automacoes",
              element: (
                <RequirePermission permission={{ domain: "vendas", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><AutomacoesVendasPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "vendas/devolucoes",
              element: (
                <RequirePermission permission={{ domain: "vendas", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><DevolucoesPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "vendas/relatorios",
              element: (
                <RequirePermission permission={{ domain: "vendas", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><RelatoriosVendasPage /></Suspense>
                </RequirePermission>
              ),
            },

            // Relatórios (Central)
            { path: "relatorios", element: <Suspense fallback={<PageLoader />}><RelatoriosHubPage /></Suspense> },

            // Serviços (Módulo)
            {
              path: "ordens-de-servico",
              element: (
                <PlanGuard feature="servicos">
                  <RequirePermission permission={{ domain: "os", action: "view" }}>
                    <Suspense fallback={<PageLoader />}><OSPage /></Suspense>
                  </RequirePermission>
                </PlanGuard>
              ),
            },
            {
              path: "servicos/relatorios",
              element: (
                <PlanGuard feature="servicos">
                  <RequirePermission permission={{ domain: "relatorios_servicos", action: "view" }}>
                    <Suspense fallback={<PageLoader />}><OsRelatoriosPage /></Suspense>
                  </RequirePermission>
                </PlanGuard>
              ),
            },
            {
              path: "servicos/contratos",
              element: (
                <PlanGuard feature="servicos">
                  <Suspense fallback={<PageLoader />}><ContratosServicosPage /></Suspense>
                </PlanGuard>
              ),
            },
            {
              path: "servicos/notas",
              element: (
                <PlanGuard feature="servicos">
                  <Suspense fallback={<PageLoader />}><NotasServicoPage /></Suspense>
                </PlanGuard>
              ),
            },
            {
              path: "servicos/cobrancas",
              element: (
                <PlanGuard feature="servicos">
                  <Suspense fallback={<PageLoader />}><CobrancasServicosPage /></Suspense>
                </PlanGuard>
              ),
            },

            // Suporte
            {
              path: "suporte",
              element: (
                <RequirePermission permission={{ domain: "suporte", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><SuportePage /></Suspense>
                </RequirePermission>
              ),
            },

            // Suprimentos
            { path: "suprimentos/estoque", element: <Suspense fallback={<PageLoader />}><EstoquePage /></Suspense> },
            { path: "suprimentos/compras", element: <Suspense fallback={<PageLoader />}><ComprasPage /></Suspense> },
            { path: "nfe-input", element: <Suspense fallback={<PageLoader />}><NfeInputPage /></Suspense> },
            { path: "suprimentos/relatorios", element: <Suspense fallback={<PageLoader />}><RelatoriosSuprimentosPage /></Suspense> },
            { path: "suprimentos/recebimentos", element: <Suspense fallback={<PageLoader />}><RecebimentoListPage /></Suspense> },
            { path: "suprimentos/recebimento-manual", element: <Suspense fallback={<PageLoader />}><RecebimentoManualPage /></Suspense> },
            { path: "suprimentos/recebimento/:id", element: <Suspense fallback={<PageLoader />}><ConferenciaPage /></Suspense> },

            // Fiscal (NF-e)
            { path: "fiscal/nfe", element: <Suspense fallback={<PageLoader />}><NfeEmissoesPage /></Suspense> },
            { path: "fiscal/nfe/configuracoes", element: <Suspense fallback={<PageLoader />}><NfeSettingsPage /></Suspense> },

            // Financeiro
            {
              path: "financeiro/tesouraria",
              element: (
                <RequirePermission permission={{ domain: "tesouraria", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><TesourariaPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "financeiro/contas-a-receber",
              element: (
                <RequirePermission permission={{ domain: "contas_a_receber", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><ContasAReceberPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "financeiro/contas-a-pagar",
              element: (
                <RequirePermission permission={{ domain: "contas_a_pagar", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><ContasPagarPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "financeiro/centros-de-custo",
              element: (
                <RequirePermission permission={{ domain: "centros_de_custo", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><CentrosDeCustoPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "financeiro/cobrancas",
              element: (
                <RequirePermission permission={{ domain: "tesouraria", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><CobrancasBancariasPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "financeiro/extrato",
              element: (
                <RequirePermission permission={{ domain: "tesouraria", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><ExtratoPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "financeiro/relatorios",
              element: (
                <RequirePermission permission={{ domain: "relatorios_financeiro", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><RelatoriosFinanceiroPage /></Suspense>
                </RequirePermission>
              ),
            },

            // RH
            {
              path: "rh/dashboard",
              element: (
                <RequirePermission permission={{ domain: "rh", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><RHDashboard /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "rh/cargos",
              element: (
                <RequirePermission permission={{ domain: "rh", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><CargosPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "rh/competencias",
              element: (
                <RequirePermission permission={{ domain: "rh", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><CompetenciasPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "rh/colaboradores",
              element: (
                <RequirePermission permission={{ domain: "rh", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><ColaboradoresPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "rh/matriz",
              element: (
                <RequirePermission permission={{ domain: "rh", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><MatrizCompetenciasPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "rh/treinamentos",
              element: (
                <RequirePermission permission={{ domain: "rh", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><TreinamentosPage /></Suspense>
                </RequirePermission>
              ),
            },

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
