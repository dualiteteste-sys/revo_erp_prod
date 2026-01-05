import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, HelpCircle, LifeBuoy, ShieldCheck } from 'lucide-react';
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
  links?: HelpLink[];
  defaultOpen?: boolean;
};

function isExternalHref(href: string) {
  return /^https?:\/\//i.test(href);
}

export default function PageHelp(props: PageHelpProps) {
  const { title, whatIs, steps, links = [], defaultOpen = false } = props;
  const [open, setOpen] = useState(defaultOpen);

  const permOpsManage = useHasPermission('ops', 'manage');
  const canOps = !!permOpsManage.data;

  const computedLinks = useMemo<HelpLink[]>(() => {
    const base: HelpLink[] = [
      { label: 'Diagnóstico guiado (Suporte)', href: '/app/suporte', kind: 'internal' },
      ...(canOps ? [{ label: 'Saúde (Ops)', href: '/app/desenvolvedor/saude', kind: 'internal' } as HelpLink] : []),
    ];
    return [...links, ...base];
  }, [links, canOps]);

  return (
    <div className="mt-4">
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
                <div className="text-sm font-semibold text-gray-900 truncate">{title}</div>
                <div className="text-xs text-gray-600 mt-1">
                  Guia rápido: o que é, 3 passos e links de diagnóstico.
                </div>
              </div>
            </div>
            <div className="text-gray-500 mt-1">
              {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </div>
          </div>

          {open ? (
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                  Como fazer (3 passos)
                </div>
                <ol className="mt-2 space-y-2 text-sm text-gray-700 list-decimal list-inside">
                  {steps.slice(0, 3).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>

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

