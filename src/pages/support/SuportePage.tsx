import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, LifeBuoy, Loader2, Lock, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { callRpc } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { getEcommerceConnectionDiagnostics, getEcommerceHealthSummary, type EcommerceConnectionDiagnostics, type EcommerceHealthSummary } from '@/services/ecommerceIntegrations';

type CheckStatus = 'ok' | 'warn' | 'missing';
type GuidedCheck = {
  key: string;
  title: string;
  description?: string;
  status: CheckStatus;
  actionLabel?: string;
  actionHref?: string;
};

type ChecksRpc = {
  checks: GuidedCheck[];
  progress?: { ok: number; total: number };
};

function statusIcon(status: CheckStatus) {
  if (status === 'ok') return <CheckCircle2 className="text-emerald-600" size={18} />;
  if (status === 'warn') return <AlertTriangle className="text-amber-600" size={18} />;
  return <XCircle className="text-red-600" size={18} />;
}

function statusLabel(status: CheckStatus) {
  if (status === 'ok') return 'OK';
  if (status === 'warn') return 'Atenção';
  return 'Faltando';
}

export default function SuportePage() {
  const { session, activeEmpresa } = useAuth();
  const userId = session?.user?.id || '';
  const userEmail = (session?.user as any)?.email || '';
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<ChecksRpc | null>(null);
  const [pdv, setPdv] = useState<ChecksRpc | null>(null);
  const [ecommerceHealth, setEcommerceHealth] = useState<EcommerceHealthSummary | null>(null);
  const [ecommerceDiagnostics, setEcommerceDiagnostics] = useState<Record<string, EcommerceConnectionDiagnostics> | null>(null);
  const [ecommerceError, setEcommerceError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [onb, pdvRes] = await Promise.all([
          callRpc<any>('onboarding_checks_for_current_empresa', {}),
          callRpc<any>('pdv_checks_for_current_empresa', {}),
        ]);

        if (!mounted) return;
        setOnboarding((onb && typeof onb === 'object') ? (onb as ChecksRpc) : null);
        setPdv((pdvRes && typeof pdvRes === 'object') ? (pdvRes as ChecksRpc) : null);
      } catch {
        if (!mounted) return;
        setOnboarding(null);
        setPdv(null);
      }

      try {
        const [health, meli, shopee] = await Promise.all([
          getEcommerceHealthSummary(),
          getEcommerceConnectionDiagnostics('meli'),
          getEcommerceConnectionDiagnostics('shopee'),
        ]);
        if (!mounted) return;
        setEcommerceHealth(health);
        setEcommerceDiagnostics({ meli, shopee });
        setEcommerceError(null);
      } catch (e: any) {
        if (!mounted) return;
        setEcommerceHealth(null);
        setEcommerceDiagnostics(null);
        setEcommerceError(e?.message || 'Sem permissão ou falha ao carregar integrações.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onboardingProgress = useMemo(() => {
    const ok = onboarding?.progress?.ok ?? 0;
    const total = onboarding?.progress?.total ?? (onboarding?.checks?.length ?? 0);
    return { ok, total };
  }, [onboarding]);

  const pdvProgress = useMemo(() => {
    const ok = pdv?.progress?.ok ?? 0;
    const total = pdv?.progress?.total ?? (pdv?.checks?.length ?? 0);
    return { ok, total };
  }, [pdv]);

  const ecommerceProgress = useMemo(() => {
    if (ecommerceError) return { ok: 0, total: 0 };
    const total = 2;
    const ok =
      (ecommerceDiagnostics?.meli?.status === 'connected' && ecommerceDiagnostics?.meli?.has_token && !ecommerceDiagnostics?.meli?.token_expired ? 1 : 0) +
      (ecommerceDiagnostics?.shopee?.status === 'connected' && ecommerceDiagnostics?.shopee?.has_token && !ecommerceDiagnostics?.shopee?.token_expired ? 1 : 0);
    return { ok, total };
  }, [ecommerceDiagnostics, ecommerceError]);

  const header = (
    <PageHeader
      title="Suporte"
      description="Diagnóstico guiado (sem console) + informações úteis para atendimento."
      icon={<LifeBuoy size={20} />}
      actions={
        <Button asChild variant="secondary" className="gap-2">
          <Link to="/app/desenvolvedor/saude">
            <Activity size={16} />
            Saúde (Ops)
          </Link>
        </Button>
      }
    />
  );

  return (
    <PageShell header={header}>
      <PageCard className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Diagnóstico guiado (NF-e / PDV / Integrações)</h2>
          <p className="text-sm text-gray-600 mt-1">
            Use esta tela quando algo “não funciona” e você quer saber o próximo passo sem abrir o console.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <Loader2 className="animate-spin" size={18} />
            Carregando diagnóstico…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-900">Configuração mínima (Onboarding)</div>
                <div className="text-xs text-gray-500">{onboardingProgress.ok}/{onboardingProgress.total}</div>
              </div>
              <div className="mt-3 space-y-2">
                {(onboarding?.checks ?? []).map((c) => (
                  <div key={c.key} className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 p-2">
                    <div className="mt-0.5">{statusIcon(c.status)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-900 truncate">{c.title}</div>
                        <span className="text-[11px] text-gray-500 flex-shrink-0">{statusLabel(c.status)}</span>
                      </div>
                      {c.description ? <div className="text-xs text-gray-600 mt-0.5">{c.description}</div> : null}
                      {c.actionHref ? (
                        <div className="mt-2">
                          <Button asChild size="sm" variant="secondary">
                            <Link to={c.actionHref}>{c.actionLabel || 'Abrir'}</Link>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                {!onboarding?.checks?.length ? (
                  <div className="text-sm text-gray-500">Sem dados de onboarding para esta empresa.</div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-900">PDV (check rápido)</div>
                <div className="text-xs text-gray-500">{pdvProgress.ok}/{pdvProgress.total}</div>
              </div>
              <div className="mt-3 space-y-2">
                {(pdv?.checks ?? []).map((c) => (
                  <div key={c.key} className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 p-2">
                    <div className="mt-0.5">{statusIcon(c.status)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium text-gray-900 truncate">{c.title}</div>
                        <span className="text-[11px] text-gray-500 flex-shrink-0">{statusLabel(c.status)}</span>
                      </div>
                      {c.description ? <div className="text-xs text-gray-600 mt-0.5">{c.description}</div> : null}
                      {c.actionHref ? (
                        <div className="mt-2">
                          <Button asChild size="sm" variant="secondary">
                            <Link to={c.actionHref}>{c.actionLabel || 'Abrir'}</Link>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                {!pdv?.checks?.length ? (
                  <div className="text-sm text-gray-500">Sem dados do PDV para esta empresa.</div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="font-semibold text-gray-900">Integrações (Marketplaces)</div>
                <div className="text-xs text-gray-500">{ecommerceProgress.ok}/{ecommerceProgress.total}</div>
              </div>

              {ecommerceError ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
                  <Lock size={18} className="mt-0.5" />
                  <div>
                    <div className="font-semibold">Sem acesso ao diagnóstico de integrações</div>
                    <div className="text-xs mt-1">{ecommerceError}</div>
                    <div className="mt-2">
                      <Button asChild size="sm" variant="secondary">
                        <Link to="/app/configuracoes/ecommerce/marketplaces">Abrir Marketplaces</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="text-xs text-gray-500">Fila pendente</div>
                    <div className="text-xl font-bold text-gray-900">{ecommerceHealth?.pending ?? 0}</div>
                    <div className="text-xs text-gray-500 mt-1">Falhas (24h): {ecommerceHealth?.failed_24h ?? 0}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      Último sync: {ecommerceHealth?.last_sync_at ? new Date(ecommerceHealth.last_sync_at).toLocaleString('pt-BR') : '—'}
                    </div>
                  </div>

                  {(['meli', 'shopee'] as const).map((p) => {
                    const d = ecommerceDiagnostics?.[p];
                    const ok = d?.status === 'connected' && d?.has_token && !d?.token_expired;
                    const st: CheckStatus = ok ? 'ok' : d?.has_connection ? 'warn' : 'missing';
                    const title = p === 'meli' ? 'Mercado Livre' : 'Shopee';
                    const desc = ok
                      ? 'Ok: conectado e token válido.'
                      : d?.has_connection
                        ? (d?.token_expired ? 'Token expirado. Reautorize a conexão.' : 'Conexão incompleta. Configure/autorize.')
                        : 'Sem conexão. Inicie a integração.';
                    return (
                      <div key={p} className="flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 p-2">
                        <div className="mt-0.5">{statusIcon(st)}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium text-gray-900 truncate">{title}</div>
                            <span className="text-[11px] text-gray-500 flex-shrink-0">{statusLabel(st)}</span>
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">{desc}</div>
                          <div className="mt-2">
                            <Button asChild size="sm" variant="secondary">
                              <Link to="/app/configuracoes/ecommerce/marketplaces">Abrir Marketplaces</Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Antes de abrir um chamado</h2>
          <ul className="list-disc ml-5 mt-2 text-sm text-gray-700 space-y-1">
            <li>Recarregue a página (Ctrl/Cmd + R) e tente novamente.</li>
            <li>Se for erro de permissão (403), confirme se o usuário tem papel/permissão na empresa.</li>
            <li>Se for erro intermitente (429/timeout), tente novamente e anote o horário.</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Empresa ativa</div>
            <div className="text-sm font-semibold text-gray-900 mt-1">{activeEmpresa?.nome_fantasia || activeEmpresa?.nome_razao_social || '-'}</div>
            <div className="text-xs text-gray-500 mt-2">empresa_id</div>
            <div className="text-sm font-mono text-gray-900 break-all">{activeEmpresa?.id || '-'}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Usuário</div>
            <div className="text-sm font-semibold text-gray-900 mt-1">{userEmail || '-'}</div>
            <div className="text-xs text-gray-500 mt-2">user_id</div>
            <div className="text-sm font-mono text-gray-900 break-all">{userId || '-'}</div>
          </div>
        </div>
      </PageCard>
    </PageShell>
  );
}
