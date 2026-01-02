import React, { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Factory, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

type Segment = 'comercio' | 'servicos' | 'industria';

const segments: Array<{ key: Segment; title: string; description: string; icon: React.ElementType }> = [
  { key: 'comercio', title: 'Comércio', description: 'Vendas, estoque e expedição com fluidez.', icon: BarChart3 },
  { key: 'servicos', title: 'Serviços', description: 'OS, contratos e cobrança recorrente.', icon: Wrench },
  { key: 'industria', title: 'Indústria', description: 'BOM, OP/OB, execução e qualidade.', icon: Factory },
];

const highlights = [
  {
    title: 'Assistente de configurações (sem travar)',
    description: 'Você entra no sistema e só é guiado quando tentar executar algo que precisa de configuração mínima.',
    icon: Sparkles,
  },
  {
    title: 'Permissões por função',
    description: 'Controle por perfis e regras claras. Mais segurança, menos retrabalho.',
    icon: ShieldCheck,
  },
  {
    title: 'Operação confiável',
    description: 'Ações críticas com proteção contra duplicidade e rastreio por auditoria.',
    icon: CheckCircle2,
  },
];

export default function Features() {
  const [segment, setSegment] = useState<Segment>('comercio');

  const segmentCopy = useMemo(() => {
    if (segment === 'comercio') {
      return {
        title: 'Venda com velocidade com financeiro forte',
        bullets: ['Pedidos e PDV com fluxo simples', 'Expedição e relatórios completos', 'Integração com Marketplaces'],
      };
    }
    if (segment === 'servicos') {
      return {
        title: 'Serviços com gestão de ponta a ponta.',
        bullets: ['Ordem de serviço com etapas e anexos', 'Contratos e cobranças recorrentes', 'Relatórios para acompanhar desempenho'],
      };
    }
    return {
      title: 'Indústria com controle real.',
      bullets: [
        'Ficha Técnica + Roteiros + Ordem de Produção e Beneficiamento',
        'Execução e tela do operador (Tablet e Celular)',
        'Controle de Qualidade e rastreabilidade',
      ],
    };
  }, [segment]);

  return (
    <section id="features" className="py-16 md:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <header className="text-center max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
            Tudo que você precisa, com a sensação de “tá no controle”.
          </h2>
          <p className="mt-4 text-base md:text-lg text-slate-600">
            Um ERP moderno é menos “tela” e mais “fluxo”. Menos ruído, mais previsibilidade.
          </p>
        </header>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          {highlights.map((h) => (
            <GlassCard key={h.title} className="rounded-3xl p-6">
              <div className="h-11 w-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
                <h.icon size={20} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">{h.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{h.description}</p>
            </GlassCard>
          ))}
        </div>

        <GlassCard className="mt-12 rounded-[28px] p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-xl md:text-2xl font-semibold text-slate-900">Feito para o seu tipo de operação</h3>
              <p className="mt-1 text-sm md:text-base text-slate-600">
                Escolha um foco — os planos crescem por módulos e add-ons.
              </p>
            </div>
            <div className="inline-flex rounded-full bg-white p-1 border border-slate-200 shadow-sm">
              {segments.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSegment(s.key)}
                  className={[
                    'px-4 py-2 rounded-full text-sm font-semibold transition-colors',
                    segment === s.key ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100',
                  ].join(' ')}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="rounded-3xl bg-white/80 border border-white/30 p-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center">
                  {React.createElement(segments.find((s) => s.key === segment)?.icon ?? BarChart3, { size: 18 })}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{segments.find((s) => s.key === segment)?.title}</div>
                  <div className="text-sm text-slate-600">{segments.find((s) => s.key === segment)?.description}</div>
                </div>
              </div>

              <h4 className="mt-5 text-lg font-semibold text-slate-900">{segmentCopy.title}</h4>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {segmentCopy.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-slate-900" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl bg-white/80 border border-white/30 p-6">
              <div className="text-sm font-semibold text-slate-900">O que muda na prática</div>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Você não precisa decidir tudo no primeiro dia. Comece com o essencial e, conforme a operação pedir (CRM, automações,
                expedição avançada, chão de fábrica), você habilita o que fizer sentido.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                  <div className="text-xs text-slate-500">Primeiro valor</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">Operar sem fricção</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                  <div className="text-xs text-slate-500">Evolução</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">Upgrade por necessidade</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                  <div className="text-xs text-slate-500">Controle</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">Auditoria + consistência</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                  <div className="text-xs text-slate-500">Time</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">Permissões por função</div>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </section>
  );
}
