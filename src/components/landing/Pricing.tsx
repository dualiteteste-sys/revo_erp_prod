import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthProvider";

/**
 * Pricing da landing:
 * - Anônimo: conteúdo estático, NENHUMA chamada ao Supabase.
 * - Autenticado: não busca empresas; oferece CTA "Ir para o app".
 * - Mantém layout com Tailwind. Sem toasts, sem providers adicionais.
 * - Logs leves: [PRICING]
 */

type Plan = {
  slug: "essencial" | "pro" | "max" | "industria" | "scale";
  title: string;
  monthlyAmountCents: number;
  features: string[];
  highlight?: boolean;
};

type CompareValue = "Inclui" | "Add-on" | "—";

type CompareRow = {
  feature: string;
  essencial: CompareValue | string;
  pro: CompareValue | string;
  max: CompareValue | string;
  industria: CompareValue | string;
  scale: CompareValue | string;
};

const STATIC_PLANS: Plan[] = [
  {
    slug: "essencial",
    title: "Ultria Essencial",
    monthlyAmountCents: 14900,
    features: [
      "Comércio + Serviços (o essencial, sem complicação)",
      "Pedidos + PDV simples (1 caixa)",
      "OS + Notas de Serviço",
      "Estoque + OC + Recebimentos + Importação XML",
      "Financeiro (caixa, pagar/receber, extrato e relatórios)",
      "NF-e: emissão + eventos (via provedor) + armazenamento",
      "Limites pensados para manter suporte leve (2 usuários)",
    ],
    highlight: true,
  },
  {
    slug: "pro",
    title: "Ultria Pro",
    monthlyAmountCents: 24900,
    features: [
      "Tudo do Essencial",
      "Comissões + metas + painel de vendas",
      "Expedição (fluxo completo)",
      "Automações de vendas",
      "CRM (funil/oportunidades)",
      "Relatórios avançados (vendas/financeiro/estoque)",
      "PDV até 3 caixas • até 5 usuários",
    ],
  },
  {
    slug: "max",
    title: "Ultria Max",
    monthlyAmountCents: 39000,
    features: [
      "Tudo do Pro",
      "Contratos + cobranças recorrentes",
      "Relatórios de serviços (OS) mais completos",
      "Centros de custo e visão financeira mais detalhada",
      "Ideal para serviços recorrentes",
      "Até 10 usuários",
    ],
  },
  {
    slug: "industria",
    title: "Ultria Indústria",
    monthlyAmountCents: 59000,
    features: [
      "Tudo do Pro + pacote completo Indústria",
      "Ficha Técnica + roteiros + OP/OB + execução",
      "Tela do operador / chão de fábrica",
      "Qualidade (planos/motivos) + lotes/bloqueio",
      "MRP/PCP/capacidade (progressivo)",
      "Relatórios industriais",
      "Até 10 usuários (operadores com add-on barato)",
    ],
  },
  {
    slug: "scale",
    title: "Ultria Scale",
    monthlyAmountCents: 99000,
    features: [
      "Tudo do Indústria",
      "Multiunidade / governança",
      "Perfis e permissões avançadas",
      "Auditoria/logs e SLAs",
      "API/Webhooks e integrações (pacotes)",
      "Suporte prioritário",
    ],
  },
];

export default function Pricing() {
  const nav = useNavigate();
  const { session } = useAuth();

  const isAuthenticated = !!session?.user;
  const plans = useMemo(() => STATIC_PLANS, []);
  const [activeSlug, setActiveSlug] = useState<Plan["slug"]>("max");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  const compareRows = useMemo<CompareRow[]>(
    () => [
      { feature: "Usuários incluídos", essencial: "2", pro: "5", max: "10", industria: "10", scale: "Ilimitado" },
      { feature: "PDV (caixas)", essencial: "1", pro: "até 3", max: "até 3", industria: "Add-on", scale: "Add-on" },
      { feature: "Assistente de configuração (primeiro uso guiado)", essencial: "Inclui", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "Cadastros (clientes, produtos, serviços, etc.)", essencial: "Inclui", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "Vendas (pedidos/orçamentos)", essencial: "Inclui", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "Estoque + OC + recebimentos + importação XML", essencial: "Inclui", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "Financeiro (caixa, pagar/receber, extrato)", essencial: "Inclui", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "Centros de custo (visão detalhada)", essencial: "Inclui", pro: "Inclui", max: "Inclui (forte)", industria: "Inclui", scale: "Inclui" },
      { feature: "NF-e (emissão + eventos + armazenamento)", essencial: "Inclui", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "CRM (funil/oportunidades)", essencial: "—", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "Comissões", essencial: "—", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "Expedição (fluxo completo)", essencial: "—", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "Automações (vendas)", essencial: "—", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "Serviços: OS", essencial: "Inclui", pro: "Inclui", max: "Inclui", industria: "Add-on", scale: "Add-on/Inclui" },
      { feature: "Contratos + cobrança recorrente", essencial: "—", pro: "Add-on", max: "Inclui", industria: "Add-on", scale: "Inclui" },
      { feature: "Indústria (Ficha Técnica/OP/execução)", essencial: "—", pro: "—", max: "—", industria: "Inclui", scale: "Inclui" },
      { feature: "Qualidade + lotes/bloqueio", essencial: "—", pro: "—", max: "—", industria: "Inclui", scale: "Inclui" },
      { feature: "RH & Qualidade (cadastros e matriz)", essencial: "Inclui", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "Multiunidade / governança", essencial: "—", pro: "—", max: "—", industria: "Add-on", scale: "Inclui" },
      { feature: "Integrações (marketplaces)", essencial: "Inclui", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "API/Webhooks e integrações (pacotes)", essencial: "—", pro: "Add-on", max: "Add-on", industria: "Add-on", scale: "Inclui" },
      { feature: "Auditoria e logs (rastreamento de ações)", essencial: "Inclui", pro: "Inclui", max: "Inclui", industria: "Inclui", scale: "Inclui" },
      { feature: "Suporte prioritário / SLA", essencial: "—", pro: "—", max: "—", industria: "—", scale: "Inclui" },
    ],
    []
  );

  const money = (cents: number) =>
    `R$ ${new Intl.NumberFormat("pt-BR", { style: "decimal", minimumFractionDigits: 2 }).format(cents / 100)}`;

  const getPricing = (p: Plan) => {
    if (billingCycle === "monthly") {
      return { label: `${money(p.monthlyAmountCents)}/mês`, sub: "Teste grátis 60 dias • Sem cartão" };
    }
    const yearlyTotal = p.monthlyAmountCents * 10;
    const perMonth = Math.round(yearlyTotal / 12);
    return {
      label: `${money(perMonth)}/mês`,
      sub: `Cobrado anualmente (${money(yearlyTotal)}) • economize 2 meses`,
    };
  };

  const handleCTA = (slug: Plan["slug"]) => {
    console.log("[PRICING] CTA click", { isAuthenticated, slug });
    setActiveSlug(slug);
    if (isAuthenticated) {
      // usuário já logado: ir para app
      nav("/app", { replace: false });
      return;
    }
    // anônimo: levar para a rota de signup (sem tocar no Supabase aqui)
    nav(`/auth/signup?plan=${slug}&cycle=${billingCycle}`, { replace: false });
  };

  return (
    <section id="pricing" className="w-full py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="text-center mb-10 md:mb-14 max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight text-slate-900">
            Planos simples. Crescimento natural.
          </h2>
          <p className="mt-4 text-base md:text-lg text-slate-600">
            Escolha o mínimo que te deixa operar com segurança. Quando a operação pedir, você evolui.
          </p>
        </header>

        <div className="mt-6 mb-8 flex justify-center items-center">
          <span className={`text-sm font-medium ${billingCycle === "monthly" ? "text-blue-600" : "text-slate-500"}`}>
            Mensal
          </span>
          <button
            onClick={() => setBillingCycle(billingCycle === "monthly" ? "yearly" : "monthly")}
            aria-label={billingCycle === "yearly" ? "Alternar para mensal" : "Alternar para anual"}
            className={`mx-4 relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none ${billingCycle === "yearly" ? "bg-blue-600" : "bg-slate-200"}`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${billingCycle === "yearly" ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
          <span className={`text-sm font-medium ${billingCycle === "yearly" ? "text-blue-600" : "text-slate-500"}`}>
            Anual
          </span>
          {billingCycle === "yearly" && (
            <span className="ml-3 bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-0.5 rounded-full">
              Economize 2 meses
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 items-stretch">
          {plans.map((p) => (
            <article
              key={p.slug}
              className={[
                "rounded-3xl border p-6 shadow-sm bg-white flex flex-col h-full cursor-pointer transition-colors",
                activeSlug === p.slug ? "border-blue-600 ring-1 ring-blue-600/10" : "border-slate-200 hover:border-slate-300",
              ].join(" ")}
              onClick={() => setActiveSlug(p.slug)}
            >
              <h3 className="text-lg font-semibold text-slate-900">{p.title}</h3>
              {(() => {
                const pricing = getPricing(p);
                return (
                  <>
                    <div className="mt-2 text-3xl font-semibold text-slate-900">{pricing.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{pricing.sub}</div>
                  </>
                );
              })()}

              <ul className="mt-4 space-y-2 text-sm text-slate-700 flex-1">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-slate-900" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCTA(p.slug)}
                className={[
                  "mt-6 w-full rounded-full px-4 py-2.5 font-semibold transition-colors self-stretch",
                  activeSlug === p.slug
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-slate-100 text-slate-900 hover:bg-slate-200",
                ].join(" ")}
              >
                {isAuthenticated ? "Ir para o app" : "Começar teste grátis"}
              </button>
            </article>
          ))}
        </div>

        <div className="mt-12">
          <h3 className="text-2xl md:text-4xl font-semibold tracking-tight text-center text-slate-900">
            Compare os recursos
          </h3>
          <p className="mt-4 text-center text-sm md:text-base text-slate-600">
            Uma visão rápida do que entra em cada plano (sem termos técnicos).
          </p>

          <div className="mt-6 overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-slate-700">
                  <th className="p-4 border-b border-slate-200">Recurso</th>
                  <th className="p-4 border-b border-slate-200">Essencial</th>
                  <th className="p-4 border-b border-slate-200">Pro</th>
                  <th className="p-4 border-b border-slate-200">Max</th>
                  <th className="p-4 border-b border-slate-200">Indústria</th>
                  <th className="p-4 border-b border-slate-200">Scale</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {compareRows.map((row) => (
                  <tr key={row.feature} className="odd:bg-white even:bg-slate-50/40">
                    <td className="p-4 border-b border-slate-200 font-medium text-slate-900">{row.feature}</td>
                    <td className="p-4 border-b border-slate-200">{row.essencial}</td>
                    <td className="p-4 border-b border-slate-200">{row.pro}</td>
                    <td className="p-4 border-b border-slate-200">{row.max}</td>
                    <td className="p-4 border-b border-slate-200">{row.industria}</td>
                    <td className="p-4 border-b border-slate-200">{row.scale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="mt-10 text-center text-xs text-slate-500">
          Os limites e add-ons são ajustados no app. O objetivo do Essencial é ser simples e estável (baixo suporte).
        </footer>
      </div>
    </section>
  );
}
