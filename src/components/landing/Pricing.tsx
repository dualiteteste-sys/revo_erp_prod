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
  slug: "START" | "PRO" | "MAX" | "ULTRA";
  title: string;
  priceLabel: string; // estático p/ landing (pode vir de env no futuro)
  billingNote?: string;
  features: string[];
  highlight?: boolean;
};

const STATIC_PLANS: Plan[] = [
  {
    slug: "START",
    title: "Start",
    priceLabel: "R$ 59/mês",
    billingNote: "Teste grátis 30 dias",
    features: ["Multi-tenant básico", "Cadastros essenciais", "Relatórios simples"],
  },
  {
    slug: "PRO",
    title: "Pro",
    priceLabel: "R$ 129/mês",
    billingNote: "Teste grátis 30 dias",
    features: ["Tudo do Start", "Ordens de serviço", "Integrações principais"],
    highlight: true,
  },
  {
    slug: "MAX",
    title: "Max",
    priceLabel: "R$ 249/mês",
    billingNote: "Teste grátis 30 dias",
    features: ["Tudo do Pro", "Automação avançada", "Dashboards"],
  },
  {
    slug: "ULTRA",
    title: "Ultra",
    priceLabel: "Sob consulta",
    billingNote: "Implantação assistida",
    features: ["Tudo do Max", "Recursos enterprise", "SLA prioritário"],
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
    nav(`/auth/signup?plan=${slug.toLowerCase()}&cycle=monthly`, { replace: false });
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
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
          Valores meramente ilustrativos nesta landing. A cobrança efetiva é configurada no app.
        </footer>
      </div>
    </section>
  );
}
