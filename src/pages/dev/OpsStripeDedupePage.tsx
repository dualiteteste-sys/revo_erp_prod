import React, { useMemo, useState } from 'react';
import PageShell from '@/components/ui/PageShell';
import PageHeader from '@/components/ui/PageHeader';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/contexts/ToastProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { opsStripeDedupeDelete, opsStripeDedupeInspect, opsStripeDedupeLink, type OpsStripeCustomerSummary } from '@/services/opsStripeDedupe';
import { ShieldAlert } from 'lucide-react';

function formatDateTimeBRFromUnix(sec: number) {
  const d = new Date(sec * 1000);
  return Number.isNaN(d.getTime()) ? String(sec) : d.toLocaleString('pt-BR');
}

function badge(status: string) {
  const base = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium';
  switch (status) {
    case 'active':
      return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
    case 'trialing':
      return `${base} bg-blue-50 text-blue-700 border-blue-200`;
    case 'past_due':
    case 'unpaid':
      return `${base} bg-amber-50 text-amber-700 border-amber-200`;
    case 'canceled':
      return `${base} bg-slate-50 text-slate-700 border-slate-200`;
    default:
      return `${base} bg-slate-50 text-slate-700 border-slate-200`;
  }
}

export default function OpsStripeDedupePage() {
  const { addToast } = useToast();
  const { activeEmpresa } = useAuth();
  const empresaId = activeEmpresa?.id ?? null;

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<OpsStripeCustomerSummary[]>([]);
  const [recommendedId, setRecommendedId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [busyLink, setBusyLink] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  const chosen = useMemo(() => rows.find((r) => r.id === selectedCustomerId) ?? null, [rows, selectedCustomerId]);

  const inspect = async () => {
    if (!empresaId) {
      addToast('Selecione uma empresa ativa para continuar.', 'warning');
      return;
    }
    setLoading(true);
    try {
      const res = await opsStripeDedupeInspect({
        empresa_id: empresaId,
        email: email.trim() || null,
        cnpj: cnpj.trim() || null,
      });
      setRows(res.customers ?? []);
      setRecommendedId(res.recommended_customer_id ?? null);
      addToast('Consulta concluída.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao consultar customers no Stripe.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openLink = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setLinkOpen(true);
  };

  const openDelete = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setDeleteOpen(true);
  };

  const link = async () => {
    if (!empresaId || !selectedCustomerId) return;
    setBusyLink(true);
    try {
      const res = await opsStripeDedupeLink({
        empresa_id: empresaId,
        customer_id: selectedCustomerId,
        email: email.trim() || null,
        cnpj: cnpj.trim() || null,
        dry_run: false,
      });
      if (res?.linked) {
        addToast(res?.synced ? 'Customer vinculado e assinatura sincronizada.' : (res?.message || 'Customer vinculado.'), 'success');
      } else {
        addToast('Não foi possível vincular customer.', 'error');
      }
      setLinkOpen(false);
      await inspect();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao vincular customer.', 'error');
    } finally {
      setBusyLink(false);
    }
  };

  const del = async () => {
    if (!empresaId || !selectedCustomerId) return;
    setBusyDelete(true);
    try {
      const res = await opsStripeDedupeDelete({
        empresa_id: empresaId,
        customer_id: selectedCustomerId,
        email: email.trim() || null,
        cnpj: cnpj.trim() || null,
        dry_run: false,
      });
      if (res?.deleted) {
        addToast('Customer arquivado no Stripe.', 'success');
      } else {
        addToast(res?.message || 'Não foi possível arquivar o customer.', 'error');
      }
      setDeleteOpen(false);
      await inspect();
    } catch (e: any) {
      addToast(e?.message || 'Falha ao arquivar customer.', 'error');
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Stripe: dedupe / vincular Customer"
        description="Ferramenta interna para diagnosticar duplicidade no Stripe (email/CNPJ) e vincular o Customer correto ao tenant."
        icon={<ShieldAlert size={20} />}
      />

      <PageCard className="p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="text-xs text-slate-600">Empresa ativa</div>
            <div className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm flex items-center">
              <span className="truncate">{activeEmpresa?.nome_fantasia || activeEmpresa?.nome_razao_social || activeEmpresa?.id || '—'}</span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-600">Email (opcional)</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              placeholder="ex.: leandrofmarques@me.com"
            />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-slate-600">CNPJ (opcional)</div>
            <input
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              placeholder="ex.: 12.345.678/0001-90"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void inspect()} disabled={loading} className="w-full">
              {loading ? 'Consultando…' : 'Buscar no Stripe'}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left p-3">Customer</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Empresa/CNPJ (metadata)</th>
                <th className="text-left p-3">Assinatura</th>
                <th className="text-left p-3">Criado</th>
                <th className="text-right p-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const metaEmpresa = r.metadata?.empresa_id ?? null;
                const metaCnpj = r.metadata?.cnpj ?? null;
                const isRecommended = recommendedId && r.id === recommendedId;
                const canDelete = !isRecommended && !r.subscription;
                return (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="p-3">
                      <div className="font-mono text-xs text-slate-700">{r.id}</div>
                      <div className="text-slate-900 font-medium">{r.name || '—'}</div>
                      {isRecommended ? (
                        <div className="mt-1 inline-flex items-center rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-xs">
                          Recomendado
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3">{r.email || '—'}</td>
                    <td className="p-3">
                      <div className="text-xs text-slate-600">{metaEmpresa ? `empresa_id: ${metaEmpresa}` : 'empresa_id: —'}</div>
                      <div className="text-xs text-slate-600">{metaCnpj ? `cnpj: ${metaCnpj}` : 'cnpj: —'}</div>
                    </td>
                    <td className="p-3">
                      {r.subscription ? (
                        <div className="space-y-1">
                          <div className={badge(r.subscription.status)}>{r.subscription.status}</div>
                          <div className="text-xs text-slate-600 font-mono">{r.subscription.price_id || '—'}</div>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="p-3">{formatDateTimeBRFromUnix(r.created)}</td>
                    <td className="p-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" className="rounded-xl" onClick={() => openLink(r.id)}>
                          Vincular ao tenant
                        </Button>
                        <Button
                          variant="outline"
                          className="rounded-xl"
                          disabled={!canDelete}
                          onClick={() => openDelete(r.id)}
                          title={canDelete ? 'Arquivar customer duplicado no Stripe' : 'Só é permitido arquivar customers sem assinatura e não recomendados.'}
                        >
                          Arquivar
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td className="p-6 text-center text-slate-500" colSpan={6}>
                    Nenhum customer encontrado ainda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </PageCard>

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Vincular Customer ao tenant</DialogTitle>
            <DialogDescription>
              Define `empresas.stripe_customer_id` e executa sync da assinatura (best-effort). Não apaga customers; dedupe destrutivo deve ser feito com backup antes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm text-slate-700">
            <div>
              <span className="font-semibold">Customer:</span> <span className="font-mono">{chosen?.id ?? '—'}</span>
            </div>
            <div>
              <span className="font-semibold">Nome:</span> {chosen?.name ?? '—'}
            </div>
            <div>
              <span className="font-semibold">Email:</span> {chosen?.email ?? '—'}
            </div>
            <div>
              <span className="font-semibold">Assinatura:</span>{' '}
              {chosen?.subscription ? (
                <span className={badge(chosen.subscription.status)}>{chosen.subscription.status}</span>
              ) : (
                '—'
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setLinkOpen(false)} disabled={busyLink}>
              Cancelar
            </Button>
            <Button onClick={() => void link()} disabled={busyLink || !selectedCustomerId}>
              {busyLink ? 'Vinculando…' : 'Confirmar vínculo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-2xl rounded-2xl">
          <DialogHeader>
            <DialogTitle>Arquivar customer duplicado (Stripe)</DialogTitle>
            <DialogDescription>
              Esta ação remove o customer do Stripe (delete). Use apenas em duplicados sem assinatura. Recomendado: ter um backup do tenant antes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm text-slate-700">
            <div>
              <span className="font-semibold">Customer:</span> <span className="font-mono">{chosen?.id ?? '—'}</span>
            </div>
            <div>
              <span className="font-semibold">Nome:</span> {chosen?.name ?? '—'}
            </div>
            <div>
              <span className="font-semibold">Email:</span> {chosen?.email ?? '—'}
            </div>
            <div>
              <span className="font-semibold">Assinatura:</span>{' '}
              {chosen?.subscription ? (
                <span className={badge(chosen.subscription.status)}>{chosen.subscription.status}</span>
              ) : (
                <span className="text-slate-600">— (nenhuma)</span>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={busyDelete}>
              Cancelar
            </Button>
            <Button onClick={() => void del()} disabled={busyDelete || !selectedCustomerId || !!chosen?.subscription}>
              {busyDelete ? 'Arquivando…' : 'Arquivar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
