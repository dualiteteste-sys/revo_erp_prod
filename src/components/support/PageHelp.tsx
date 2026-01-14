import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  HelpCircle,
  LifeBuoy,
  ShieldCheck,
  Network,
  Layers,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/hooks/useHasPermission';

type HelpLink = {
  label: string;
  href: string;
  kind?: 'internal' | 'external';
};

type PageHelpProps = {
  title: string;
  whatIs: string;
  steps: string[];
  connectsWith?: string[];
  dependsOn?: string[];
  fillPerfectly?: string[];
  commonMistakes?: string[];
  links?: HelpLink[];
  defaultOpen?: boolean;
};

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

export default function PageHelp(props: PageHelpProps) {
  const {
    title,
    whatIs,
    steps,
    connectsWith = [],
    dependsOn = [],
    fillPerfectly = [],
    commonMistakes = [],
    links = [],
    defaultOpen = false,
  } = props;
  const [open, setOpen] = useState(defaultOpen);

  const permOpsManage = useHasPermission('ops', 'manage');
  const canOps = !!permOpsManage.data;

  const computedLinks = useMemo<HelpLink[]>(() => {
    const base: HelpLink[] = [
      { label: 'Diagnóstico guiado (Suporte)', href: '/app/suporte', kind: 'internal' },
      ...(canOps ? [{ label: 'Saúde (Ops)', href: '/app/desenvolvedor/saude', kind: 'internal' } as HelpLink] : []),
      ...(canOps ? [{ label: 'Error Reports (Beta)', href: '/app/desenvolvedor/error-reports', kind: 'internal' } as HelpLink] : []),
    ];
    return [...links, ...base];
  }, [links, canOps]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left"
        aria-expanded={open}
      >
        <GlassCard className="p-4 hover:bg-white/70 transition-colors">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-0.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 p-2">
                <HelpCircle size={18} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">Guia rápido</div>
                <div className="text-xs text-gray-600 mt-1">
                  O que é • fluxo ideal • dependências • como preencher perfeito • links úteis.
                </div>
              </div>
            </div>
            <div className="text-gray-500 mt-1">
              {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </div>
          </div>

          {open ? (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="lg:col-span-2 xl:col-span-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
                  <div className="text-sm font-semibold text-blue-900">{title}</div>
                  <div className="mt-1 text-xs text-blue-900/70">
                    Esse é seu guia deste módulo. Seguindo o fluxo ideal e observando suas características, você evita os erros mais comuns.
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <ShieldCheck size={16} className="text-slate-700" />
                  O que é
                </div>
                <div className="text-sm text-gray-700 mt-2 leading-relaxed">{whatIs}</div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <LifeBuoy size={16} className="text-blue-700" />
                  Fluxo ideal
                </div>
                <ol className="mt-2 space-y-2 text-sm text-gray-700 list-decimal list-inside">
                  {steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>

              {(connectsWith.length > 0 || dependsOn.length > 0) && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <Network size={16} className="text-indigo-700" />
                    Conexões e dependências
                  </div>
                  {dependsOn.length > 0 ? (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                        <Layers size={14} className="text-slate-600" />
                        Depende de
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {dependsOn.map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs text-slate-700"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {connectsWith.length > 0 ? (
                    <div className={dependsOn.length > 0 ? 'mt-4' : 'mt-3'}>
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                        <Network size={14} className="text-indigo-700" />
                        Conecta com
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {connectsWith.map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50/60 px-2.5 py-1 text-xs text-indigo-900"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {fillPerfectly.length > 0 ? (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <CheckCircle2 size={16} className="text-emerald-700" />
                    Como preencher perfeito
                  </div>
                  <ul className="mt-2 space-y-2 text-sm text-gray-700">
                    {fillPerfectly.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500/70 flex-shrink-0" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {commonMistakes.length > 0 ? (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <AlertTriangle size={16} className="text-amber-700" />
                    Erros comuns
                  </div>
                  <ul className="mt-2 space-y-2 text-sm text-gray-700">
                    {commonMistakes.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-0.5 h-2 w-2 rounded-full bg-amber-500/70 flex-shrink-0" />
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                <div className="text-sm font-semibold text-gray-900">Links úteis</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {computedLinks.map((l) => {
                    const external = l.kind === 'external' || isExternalHref(l.href);
                    if (external) {
                      return (
                        <a
                          key={l.href + l.label}
                          href={l.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex"
                        >
                          <Button type="button" variant="secondary" size="sm" className="gap-2">
                            <ExternalLink size={14} />
                            {l.label}
                          </Button>
                        </a>
                      );
                    }
                    return (
                      <Button key={l.href + l.label} asChild type="button" variant="secondary" size="sm">
                        <Link to={l.href}>{l.label}</Link>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </GlassCard>
      </button>
    </div>
  );
}
