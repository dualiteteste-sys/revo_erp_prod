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
const MeiosPagamentoPage = lazyImport(() => import("../pages/cadastros/MeiosPagamentoPage"));
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
const HealthPage = lazyImport(() => import("../pages/dev/HealthPage"));
const SchemaDiagnosticsPage = lazyImport(() => import("../pages/dev/SchemaDiagnosticsPage"));
const UiPlaygroundPage = lazyImport(() => import("../pages/dev/UiPlaygroundPage"));
const ErrorReportsPage = lazyImport(() => import("../pages/dev/ErrorReportsPage"));
const Ops403Page = lazyImport(() => import("../pages/dev/Ops403Page"));
const SystemErrorsPage = lazyImport(() => import("../pages/dev/SystemErrorsPage"));
const OpsRlsInventoryPage = lazyImport(() => import("../pages/dev/OpsRlsInventoryPage"));
const OpsBackupsPage = lazyImport(() => import("../pages/dev/OpsBackupsPage"));
const OpsTenantBackupsPage = lazyImport(() => import("../pages/dev/OpsTenantBackupsPage"));
const OpsStripeDedupePage = lazyImport(() => import("../pages/dev/OpsStripeDedupePage"));
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
            {
              path: "products",
              element: (
                <RequirePermission permission={{ domain: "produtos", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><ProductsPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "partners",
              element: (
                <RequirePermission permission={{ domain: "partners", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><PartnersPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "carriers",
              element: (
                <RequirePermission permission={{ domain: "logistica", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><CarriersPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "services",
              element: (
                <PlanGuard feature="servicos">
                  <RequirePermission permission={{ domain: "servicos", action: "view" }}>
                    <Suspense fallback={<PageLoader />}><ServicesPage /></Suspense>
                  </RequirePermission>
                </PlanGuard>
              ),
            },
            {
              path: "cadastros/grupos-produtos",
              element: (
                <RequirePermission permission={{ domain: "produtos", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><GrupoProdutosPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "cadastros/unidades-medida",
              element: (
                <RequirePermission permission={{ domain: "produtos", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><UnidadesPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "cadastros/embalagens",
              element: (
                <RequirePermission permission={{ domain: "produtos", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><EmbalagensPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "cadastros/vendedores",
              element: (
                <RequirePermission permission={{ domain: "vendedores", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><VendedoresPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "cadastros/meios-pagamento",
              element: (
                <RequirePermission permission={{ domain: "contas_a_pagar", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><MeiosPagamentoPage /></Suspense>
                </RequirePermission>
              ),
            },

            // Indústria
            { path: "industria/qualidade/motivos", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "qualidade", action: "view" }}><Suspense fallback={<PageLoader />}><MotivosRefugoPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/qualidade/planos", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "qualidade", action: "view" }}><Suspense fallback={<PageLoader />}><PlanosInspecaoPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/qualidade/lotes", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "qualidade", action: "view" }}><Suspense fallback={<PageLoader />}><LotesQualidadePage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/dashboard", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><IndustriaDashboardPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/status-beneficiamentos", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><StatusBeneficiamentosPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/producao", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><ProducaoPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/ordens", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><OrdensPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/mrp", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "mrp", action: "view" }}><Suspense fallback={<PageLoader />}><MrpDemandasPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/pcp", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "mrp", action: "view" }}><Suspense fallback={<PageLoader />}><PcpDashboardPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/relatorios", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><RelatoriosIndustriaPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/boms", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><BomsPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/roteiros", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><RoteirosPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/centros-trabalho", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><CentrosTrabalhoPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/execucao", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><ExecucaoPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/chao-de-fabrica", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><ChaoDeFabricaPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/operador", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><OperadorPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/operadores", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><OperadoresPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/automacao", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><AutomacaoPage /></Suspense></RequirePermission></PlanGuard> },
            { path: "industria/materiais-cliente", element: <PlanGuard feature="industria"><RequirePermission permission={{ domain: "industria", action: "view" }}><Suspense fallback={<PageLoader />}><MateriaisClientePage /></Suspense></RequirePermission></PlanGuard> },

            // Vendas
            { path: "sales-dashboard", element: <RequirePermission permission={{ domain: "vendas", action: "view" }}><Suspense fallback={<PageLoader />}><SalesDashboard /></Suspense></RequirePermission> },
            { path: "vendas/metas", element: <RequirePermission permission={{ domain: "vendas", action: "view" }}><Suspense fallback={<PageLoader />}><SalesGoalsPage /></Suspense></RequirePermission> },
            { path: "vendas/pedidos", element: <RequirePermission permission={{ domain: "vendas", action: "view" }}><Suspense fallback={<PageLoader />}><PedidosVendasPage /></Suspense></RequirePermission> },
            { path: "vendas/crm", element: <RequirePermission permission={{ domain: "crm", action: "view" }}><Suspense fallback={<PageLoader />}><CrmPage /></Suspense></RequirePermission> },
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
                  <RequirePermission permission={{ domain: "servicos", action: "view" }}>
                    <Suspense fallback={<PageLoader />}><ContratosServicosPage /></Suspense>
                  </RequirePermission>
                </PlanGuard>
              ),
            },
            {
              path: "servicos/notas",
              element: (
                <PlanGuard feature="servicos">
                  <RequirePermission permission={{ domain: "servicos", action: "view" }}>
                    <Suspense fallback={<PageLoader />}><NotasServicoPage /></Suspense>
                  </RequirePermission>
                </PlanGuard>
              ),
            },
            {
              path: "servicos/cobrancas",
              element: (
                <PlanGuard feature="servicos">
                  <RequirePermission permission={{ domain: "servicos", action: "view" }}>
                    <Suspense fallback={<PageLoader />}><CobrancasServicosPage /></Suspense>
                  </RequirePermission>
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
            { path: "suprimentos/estoque", element: <RequirePermission permission={{ domain: "suprimentos", action: "view" }}><Suspense fallback={<PageLoader />}><EstoquePage /></Suspense></RequirePermission> },
            { path: "suprimentos/compras", element: <RequirePermission permission={{ domain: "suprimentos", action: "view" }}><Suspense fallback={<PageLoader />}><ComprasPage /></Suspense></RequirePermission> },
            { path: "nfe-input", element: <Suspense fallback={<PageLoader />}><NfeInputPage /></Suspense> },
            { path: "suprimentos/relatorios", element: <RequirePermission permission={{ domain: "suprimentos", action: "view" }}><Suspense fallback={<PageLoader />}><RelatoriosSuprimentosPage /></Suspense></RequirePermission> },
            { path: "suprimentos/recebimentos", element: <RequirePermission permission={{ domain: "suprimentos", action: "view" }}><Suspense fallback={<PageLoader />}><RecebimentoListPage /></Suspense></RequirePermission> },
            { path: "suprimentos/recebimento-manual", element: <RequirePermission permission={{ domain: "suprimentos", action: "view" }}><Suspense fallback={<PageLoader />}><RecebimentoManualPage /></Suspense></RequirePermission> },
            { path: "suprimentos/recebimento/:id", element: <RequirePermission permission={{ domain: "suprimentos", action: "view" }}><Suspense fallback={<PageLoader />}><ConferenciaPage /></Suspense></RequirePermission> },

            // Fiscal (NF-e)
            { path: "fiscal/nfe", element: <RequirePermission permission={{ domain: "vendas", action: "view" }}><Suspense fallback={<PageLoader />}><NfeEmissoesPage /></Suspense></RequirePermission> },
            { path: "fiscal/nfe/configuracoes", element: <RequirePermission permission={{ domain: "vendas", action: "view" }}><Suspense fallback={<PageLoader />}><NfeSettingsPage /></Suspense></RequirePermission> },

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
            {
              path: "desenvolvedor/saude",
              element: (
                <RequirePermission permission={{ domain: "ops", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><HealthPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "desenvolvedor/logs",
              element: (
                <RequirePermission permission={{ domain: "logs", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><LogsPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "desenvolvedor/diagnostico",
              element: (
                <RequirePermission permission={{ domain: "ops", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><SchemaDiagnosticsPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "desenvolvedor/ui-playground",
              element: (
                <RequirePermission permission={{ domain: "ops", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><UiPlaygroundPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "desenvolvedor/error-reports",
              element: (
                <RequirePermission permission={{ domain: "ops", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><ErrorReportsPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "desenvolvedor/erros",
              element: (
                <RequirePermission permission={{ domain: "ops", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><SystemErrorsPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "desenvolvedor/403",
              element: (
                <RequirePermission permission={{ domain: "ops", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><Ops403Page /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "desenvolvedor/rls",
              element: (
                <RequirePermission permission={{ domain: "ops", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><OpsRlsInventoryPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "desenvolvedor/backups",
              element: (
                <RequirePermission permission={{ domain: "ops", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><OpsBackupsPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "desenvolvedor/backups-tenant",
              element: (
                <RequirePermission permission={{ domain: "ops", action: "view" }}>
                  <Suspense fallback={<PageLoader />}><OpsTenantBackupsPage /></Suspense>
                </RequirePermission>
              ),
            },
            {
              path: "desenvolvedor/stripe-dedupe",
              element: (
                <RequirePermission permission={{ domain: "ops", action: "manage" }}>
                  <Suspense fallback={<PageLoader />}><OpsStripeDedupePage /></Suspense>
                </RequirePermission>
              ),
            },
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
