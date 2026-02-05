import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Bell, CheckCircle2, Copy, Download, LifeBuoy, Loader2, Lock, RefreshCw, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { callRpc } from '@/lib/api';
import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { getEcommerceConnectionDiagnostics, getEcommerceHealthSummary, type EcommerceConnectionDiagnostics, type EcommerceHealthSummary } from '@/services/ecommerceIntegrations';
import { getLastRequestId } from '@/lib/requestId';
import { sanitizeLogData } from '@/lib/sanitizeLog';
import { useHasPermission } from '@/hooks/useHasPermission';
import { getOpsHealthSummary, listOpsRecentFailures } from '@/services/opsHealth';
import { listSupportNotifications, markAllNotificationsRead, markNotificationsRead, type SupportNotification } from '@/services/supportNotifications';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import { useToast } from '@/contexts/ToastProvider';
import { createSupportTicket, isOpsStaffForCurrentUser, listMySupportTickets, type SupportTicketListItem } from '@/services/supportTickets';

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

function notificationBadge(n: SupportNotification) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium';
  if (n.severity === 'error') return <span className={`${base} bg-red-100 text-red-800`}>Erro</span>;
  if (n.severity === 'warn') return <span className={`${base} bg-amber-100 text-amber-900`}>Atenção</span>;
  return <span className={`${base} bg-sky-100 text-sky-900`}>Info</span>;
}

function categoryLabel(category: SupportNotification['category']) {
  if (category === 'financeiro') return 'Financeiro';
  if (category === 'fiscal') return 'Fiscal';
  if (category === 'integracao') return 'Integrações';
  if (category === 'incidente') return 'Incidente';
  return 'Sistema';
}

export default function SuportePage() {
  const { session, activeEmpresa } = useAuth();
  const activeEmpresaId = activeEmpresa?.id ?? null;
  const userId = session?.user?.id || '';
  const userEmail = (session as any)?.user?.email || '';
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [onboarding, setOnboarding] = useState<ChecksRpc | null>(null);
  const [pdv, setPdv] = useState<ChecksRpc | null>(null);
  const [ecommerceHealth, setEcommerceHealth] = useState<EcommerceHealthSummary | null>(null);
  const [ecommerceDiagnostics, setEcommerceDiagnostics] = useState<Record<string, EcommerceConnectionDiagnostics> | null>(null);
  const [ecommerceError, setEcommerceError] = useState<string | null>(null);
  const permOpsManage = useHasPermission('ops', 'manage');
  const permSupportView = useHasPermission('suporte', 'view');
  const [packing, setPacking] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifOnlyUnread, setNotifOnlyUnread] = useState(true);
  const [notifications, setNotifications] = useState<SupportNotification[]>([]);
  const [myTickets, setMyTickets] = useState<SupportTicketListItem[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [staffAllowed, setStaffAllowed] = useState<boolean>(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketRequesterEmail, setTicketRequesterEmail] = useState<string>(userEmail || '');

  useEffect(() => {
    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    setOnboarding(null);
    setPdv(null);
    setEcommerceHealth(null);
    setEcommerceDiagnostics(null);
    setEcommerceError(null);

    if (!activeEmpresaId) {
      setLoading(false);
      return;
    }

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
  }, [activeEmpresaId]);

  const refreshMyTickets = useCallback(async () => {
    setTicketsLoading(true);
    try {
      const items = await listMySupportTickets({ limit: 5, offset: 0 });
      setMyTickets(Array.isArray(items) ? items : []);
    } catch {
      setMyTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshMyTickets();
  }, [refreshMyTickets]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ok = await isOpsStaffForCurrentUser();
        if (mounted) setStaffAllowed(!!ok);
      } catch {
        if (mounted) setStaffAllowed(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const canViewNotifications = !!permSupportView.data;

  const refreshNotifications = useCallback(async () => {
    if (!canViewNotifications) return;
    setNotifLoading(true);
    try {
      const list = await listSupportNotifications({ onlyUnread: notifOnlyUnread, limit: 50, offset: 0 });
      setNotifications(Array.isArray(list) ? list : []);
    } catch {
      setNotifications([]);
    } finally {
      setNotifLoading(false);
    }
  }, [canViewNotifications, notifOnlyUnread]);

  useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

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
        permOpsManage.data ? (
          <Button asChild variant="secondary" className="gap-2">
            <Link to="/app/desenvolvedor/saude">
              <Activity size={16} />
              Saúde (Ops)
            </Link>
          </Button>
        ) : null
      }
    />
  );

  const buildSupportPack = async () => {
    const base = {
      generated_at: new Date().toISOString(),
      app: {
        url: typeof window !== 'undefined' ? window.location.href : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
      context: {
        empresa_id: activeEmpresa?.id ?? null,
        user_id: userId || null,
        last_request_id: getLastRequestId(),
      },
      checks: {
        onboarding,
        pdv,
        ecommerce: {
          health: ecommerceHealth,
          diagnostics: ecommerceDiagnostics,
          error: ecommerceError,
        },
      },
      ops: {
        has_access: !!permOpsManage.data,
        summary: null as any,
        recent_failures: null as any,
      },
    };

    if (permOpsManage.data) {
      try {
        const [summary, recent] = await Promise.all([
          getOpsHealthSummary(),
          listOpsRecentFailures({ limit: 20 }),
        ]);
        base.ops.summary = summary as any;
        base.ops.recent_failures = recent as any;
      } catch {
        // ignore
      }
    }

    return sanitizeLogData(base);
  };

  const handleCopyPack = async () => {
    if (packing) return;
    setPacking(true);
    try {
      const pack = await buildSupportPack();
      const text = JSON.stringify(pack, null, 2);
      await navigator.clipboard.writeText(text);
    } finally {
      setPacking(false);
    }
  };

  const handleDownloadPack = async () => {
    if (packing) return;
    setPacking(true);
    try {
      const pack = await buildSupportPack();
      const text = JSON.stringify(pack, null, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `revo-diagnostico-${(activeEmpresa?.id || 'empresa').slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setPacking(false);
    }
  };

  const handleMarkRead = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      await markNotificationsRead(ids);
    } finally {
      await refreshNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
    } finally {
      await refreshNotifications();
    }
  };

  return (
    <PageShell header={header}>
      <PageCard className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">Pacote de diagnóstico (anexar no suporte)</div>
              <div className="text-xs text-gray-600 mt-1">
                Copie/baixe um JSON com contexto (empresa, checks, integrações e últimos IDs), já saneado (sem PII/segredos).
              </div>
              <div className="mt-2 text-[11px] text-gray-500">
                Empresa: <span className="font-mono">{(activeEmpresa?.id || '—').slice(0, 8)}</span> • Último request:{' '}
                <span className="font-mono">{(getLastRequestId() || '—').slice(0, 8)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="gap-2" onClick={handleCopyPack} disabled={packing}>
                {packing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy size={16} />}
                Copiar JSON
              </Button>
              <Button type="button" variant="secondary" className="gap-2" onClick={handleDownloadPack} disabled={packing}>
                {packing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download size={16} />}
                Baixar
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-gray-900">Tickets de suporte</div>
              <div className="text-xs text-gray-600 mt-1">
                Abra um ticket com contexto automático (empresa, rota, request_id) para acelerar a correção.
              </div>
            </div>
            <div className="flex gap-2">
              {staffAllowed ? (
                <Button asChild type="button" variant="secondary">
                  <Link to="/app/suporte/console">Console (equipe)</Link>
                </Button>
              ) : null}
              <Button type="button" className="gap-2" onClick={() => setTicketOpen(true)}>
                <LifeBuoy size={16} />
                Abrir ticket
              </Button>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {ticketsLoading ? (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : myTickets.length === 0 ? (
              <div className="text-sm text-gray-500">Nenhum ticket aberto por este usuário nesta empresa.</div>
            ) : (
              <div className="space-y-2">
                {myTickets.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{t.subject}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Status: <span className="font-mono">{t.status}</span> • Última atividade:{' '}
                        <span className="font-mono">{new Date(t.last_activity_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-gray-400">{t.id.slice(0, 8)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
            <DialogContent className="max-w-2xl rounded-2xl">
              <DialogHeader>
                <DialogTitle>Abrir ticket</DialogTitle>
                <DialogDescription>
                  Inclua o que você estava tentando fazer. O sistema anexará contexto automaticamente.
                </DialogDescription>
              </DialogHeader>

                <div className="grid gap-3">
                <Input
                  name="requester_email"
                  label="E-mail (opcional)"
                  value={ticketRequesterEmail}
                  onChange={(e) => setTicketRequesterEmail(e.target.value)}
                  placeholder="ex.: seu@email.com"
                />
                <Input
                  name="subject"
                  label="Assunto"
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="Ex.: Erro ao importar extrato OFX"
                />
                <TextArea
                  name="message"
                  label="Mensagem"
                  value={ticketMessage}
                  onChange={(e) => setTicketMessage(e.target.value)}
                  placeholder="Descreva o que aconteceu…"
                />
                <div className="text-[11px] text-muted-foreground">
                  Empresa: <span className="font-mono">{activeEmpresa?.id ?? '—'}</span> • Último request_id:{' '}
                  <span className="font-mono">{getLastRequestId() ?? '—'}</span>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="secondary" onClick={() => setTicketOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      const ticketId = await createSupportTicket({
                        subject: ticketSubject,
                        message: ticketMessage,
                        requesterEmail: ticketRequesterEmail?.trim() || null,
                        context: {
                          origin: window.location.origin,
                          pathname: window.location.pathname,
                          empresa_id: activeEmpresa?.id ?? null,
                          user_id: userId || null,
                          user_email: userEmail || null,
                          last_request_id: getLastRequestId() ?? null,
                        },
                      });
                      addToast(`Ticket criado: ${ticketId.slice(0, 8)}`, 'success', 'Suporte');
                      setTicketOpen(false);
                      setTicketRequesterEmail(userEmail || '');
                      setTicketSubject('');
                      setTicketMessage('');
                      await refreshMyTickets();
                    } catch (e: any) {
                      addToast(e?.message || 'Não foi possível criar o ticket.', 'error', 'Suporte');
                    }
                  }}
                >
                  Enviar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">Diagnóstico guiado (NF-e / PDV / Integrações)</h2>
          <p className="text-sm text-gray-600 mt-1">
            Use esta tela quando algo “não funciona” e você quer saber o próximo passo sem abrir o console.
          </p>
        </div>

        {!activeEmpresaId ? (
          <div className="text-sm text-gray-600">Selecione uma empresa para ver o diagnóstico.</div>
        ) : loading ? (
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
                    const expiresSoon = !!d?.token_expires_soon;
                    const expiresInDays =
                      typeof d?.token_expires_in_days === 'number' ? d.token_expires_in_days : null;
                    const desc = ok
                      ? expiresSoon
                        ? `Ok: conectado. Token expira em breve${expiresInDays !== null ? ` (${expiresInDays}d)` : ''}.`
                        : 'Ok: conectado e token válido.'
                      : d?.has_connection
                        ? (
                            d?.token_expired
                              ? 'Token expirado. Reautorize a conexão.'
                              : expiresSoon
                                ? `Token expira em breve${expiresInDays !== null ? ` (${expiresInDays}d)` : ''}. Reautorize para evitar falhas.`
                                : 'Conexão incompleta. Configure/autorize.'
                          )
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Bell size={18} className="text-gray-700" />
                Central de notificações
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Avisos proativos (DLQ, webhooks falhando, integrações com erro) para reduzir tickets e retrabalho.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                <div className="text-xs text-gray-600">Somente não lidas</div>
                <Switch checked={notifOnlyUnread} onCheckedChange={setNotifOnlyUnread} />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" className="gap-2" onClick={() => void refreshNotifications()} disabled={notifLoading || !canViewNotifications}>
                  {notifLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw size={16} />}
                  Atualizar
                </Button>
                <Button type="button" variant="secondary" className="gap-2" onClick={() => void handleMarkAllRead()} disabled={notifLoading || !canViewNotifications || notifications.length === 0 || unreadCount === 0}>
                  Marcar tudo como lido
                </Button>
              </div>
            </div>
          </div>

          {!canViewNotifications ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex items-start gap-2">
              <Lock size={18} className="mt-0.5" />
              <div>
                <div className="font-semibold">Sem permissão para ver notificações</div>
                <div className="text-xs mt-1">
                  Peça acesso ao papel/permissão <span className="font-mono">suporte:view</span>.
                </div>
              </div>
            </div>
          ) : notifLoading ? (
            <div className="mt-3 flex items-center gap-3 text-sm text-gray-600">
              <Loader2 className="animate-spin" size={18} />
              Carregando notificações…
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <div>
                  Não lidas: <span className="font-semibold text-gray-900">{unreadCount}</span>
                </div>
                {permOpsManage.data ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/app/desenvolvedor/saude">Abrir painel de saúde</Link>
                  </Button>
                ) : null}
              </div>

              {notifications.length === 0 ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
                  Nenhuma notificação encontrada.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`rounded-2xl border p-4 ${n.is_read ? 'border-gray-200 bg-white' : 'border-sky-200 bg-sky-50'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {notificationBadge(n)}
                            <span className="text-[11px] text-gray-600">{categoryLabel(n.category)}</span>
                            <span className="text-[11px] text-gray-500">
                              {n.created_at ? new Date(n.created_at).toLocaleString('pt-BR') : '—'}
                            </span>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-gray-900 break-words">{n.title}</div>
                        </div>
                        {!n.is_read ? (
                          <Button size="sm" variant="secondary" className="shrink-0" onClick={() => void handleMarkRead([n.id])}>
                            Marcar lido
                          </Button>
                        ) : null}
                      </div>
                      {n.body ? <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{n.body}</div> : null}
                      {n.source ? (
                        <div className="mt-2 text-[11px] text-gray-500">
                          Fonte: <span className="font-mono">{n.source}</span>
                          {n.entity_type ? (
                            <>
                              {' '}• Entidade: <span className="font-mono">{n.entity_type}</span>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

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
