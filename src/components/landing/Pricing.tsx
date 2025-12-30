import React, { useMemo } from "react";
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
  slug: "essencial" | "pro" | "operacao" | "industria" | "scale";
  title: string;
  priceLabel: string; // estático p/ landing (pode vir de env no futuro)
  billingNote?: string;
  features: string[];
  highlight?: boolean;
};

const STATIC_PLANS: Plan[] = [
  {
    slug: "essencial",
    title: "Revo Essencial",
    priceLabel: "R$ 119/mês",
    billingNote: "Teste grátis 30 dias • Sem cartão",
    features: [
      "Comércio + Serviços (o mínimo redondo)",
      "Pedidos + PDV simples (1 caixa)",
      "OS + Notas de Serviço (MVP)",
      "Estoque + OC + Recebimentos + Importação XML",
      "Financeiro básico (caixa, pagar/receber, extrato)",
      "NF-e: rascunhos + configurações",
      "Limites para manter suporte leve (2 usuários)",
    ],
    highlight: true,
  },
  {
    slug: "pro",
    title: "Revo Pro",
    priceLabel: "R$ 249/mês",
    billingNote: "Comércio em crescimento",
    features: [
      "Tudo do Essencial",
      "Comissões + metas + painel de vendas",
      "Expedição (fluxo completo)",
      "Automações de vendas (MVP)",
      "CRM (funil/oportunidades) (MVP)",
      "Relatórios avançados (vendas/financeiro/estoque)",
      "PDV até 3 caixas • até 5 usuários",
    ],
  },
  {
    slug: "operacao",
    title: "Revo Operação",
    priceLabel: "R$ 390/mês",
    billingNote: "Serviços + Financeiro forte",
    features: [
      "Tudo do Pro",
      "Contratos + cobranças recorrentes",
      "Relatórios de serviços (OS) mais completos",
      "Centros de custo e visão financeira mais detalhada",
      "Ideal para serviços recorrentes",
    ],
  },
  {
    slug: "industria",
    title: "Revo Indústria",
    priceLabel: "R$ 590/mês",
    billingNote: "Chão de fábrica (PCP/OP) • Implantação recomendada",
    features: [
      "Tudo do Pro + pacote completo Indústria",
      "BOM + roteiros + OP/OB + execução",
      "Tela do operador / chão de fábrica",
      "Qualidade (planos/motivos) + lotes/bloqueio",
      "MRP/PCP/capacidade (progressivo)",
      "Relatórios industriais",
      "Até 10 usuários (operadores com add-on barato)",
    ],
  },
  {
    slug: "scale",
    title: "Revo Scale",
    priceLabel: "R$ 990/mês",
    billingNote: "Multiunidade + governança + integrações",
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

  const handleCTA = (slug: Plan["slug"]) => {
    console.log("[PRICING] CTA click", { isAuthenticated, slug });
    if (isAuthenticated) {
      // usuário já logado: ir para app
      nav("/app", { replace: false });
      return;
    }
    // anônimo: levar para a rota de signup (sem tocar no Supabase aqui)
    nav(`/auth/signup?plan=${slug}&cycle=monthly`, { replace: false });
  };

  return (
    <section className="w-full py-12 md:py-16 lg:py-20 bg-neutral-950 text-neutral-200">
      <div className="container mx-auto px-4">
        <header className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
            Planos simples, crescimento real
          </h2>
          <p className="mt-3 text-neutral-400">
            Comece agora — sem cartão. Sem fricção. Sem surpresas.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
          {plans.map((p) => (
            <article
              key={p.slug}
              className={[
                "rounded-2xl border border-neutral-800 p-6 shadow-sm",
                p.highlight ? "ring-1 ring-neutral-700" : "",
              ].join(" ")}
            >
              <h3 className="text-xl font-medium">{p.title}</h3>
              <div className="mt-2 text-3xl font-semibold">{p.priceLabel}</div>
              {p.billingNote ? (
                <div className="mt-1 text-xs text-neutral-400">{p.billingNote}</div>
              ) : null}

              <ul className="mt-4 space-y-2 text-sm text-neutral-300">
                {p.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-neutral-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCTA(p.slug)}
                className={[
                  "mt-6 w-full rounded-2xl px-4 py-2.5 font-medium",
                  p.highlight
                    ? "bg-white text-neutral-900 hover:bg-neutral-200"
                    : "bg-neutral-800 text-neutral-100 hover:bg-neutral-700",
                ].join(" ")}
              >
                {isAuthenticated ? "Ir para o app" : "Começar teste grátis"}
              </button>
            </article>
          ))}
        </div>

        <footer className="mt-8 text-center text-xs text-neutral-500">
          Os limites e add-ons são ajustados no app. O objetivo do Essencial é ser simples e estável (baixo suporte).
        </footer>
      </div>
    </section>
  );
}
