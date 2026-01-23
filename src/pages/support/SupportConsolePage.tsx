import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, ShieldAlert } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { useToast } from '@/contexts/ToastProvider';
import { isOpsStaffForCurrentUser, listSupportTicketsAsStaff, setSupportTicketStatusAsStaff, type SupportStaffTicketListItem, type SupportTicketStatus } from '@/services/supportTickets';

const statuses: Array<{ value: SupportTicketStatus; label: string }> = [
  { value: 'novo', label: 'Novo' },
  { value: 'triagem', label: 'Triagem' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'aguardando_cliente', label: 'Aguardando cliente' },
  { value: 'resolvido', label: 'Resolvido' },
  { value: 'arquivado', label: 'Arquivado' },
];

function statusLabel(status: SupportTicketStatus) {
  return statuses.find((s) => s.value === status)?.label ?? status;
}

export default function SupportConsolePage() {
  const { addToast } = useToast();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SupportStaffTicketListItem[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<SupportTicketStatus | 'all'>('all');

  const canView = allowed === true;

  const queryParams = useMemo(
    () => ({
      q: q.trim() ? q.trim() : null,
      status: status === 'all' ? null : status,
      limit: 100,
      offset: 0,
    }),
    [q, status],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ok = await isOpsStaffForCurrentUser();
        if (mounted) setAllowed(ok);
      } catch {
        if (mounted) setAllowed(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!canView) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await listSupportTicketsAsStaff(queryParams);
        if (!mounted) return;
        setRows(Array.isArray(data) ? data : []);
      } catch (e: any) {
        addToast(e?.message || 'Falha ao carregar tickets.', 'error', 'Suporte');
        if (mounted) setRows([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [canView, queryParams, toast]);

  async function handleSetStatus(ticketId: string, nextStatus: SupportTicketStatus) {
    try {
      await setSupportTicketStatusAsStaff({ ticketId, status: nextStatus });
      setRows((prev) => prev.map((r) => (r.id === ticketId ? { ...r, status: nextStatus } : r)));
      addToast('Status atualizado.', 'success', 'Suporte');
    } catch (e: any) {
      addToast(e?.message || 'Não foi possível atualizar o status.', 'error', 'Suporte');
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Suporte — Console (equipe)"
        subtitle="Triagem e acompanhamento de tickets por empresa (uso interno)."
        icon={<ShieldAlert className="h-5 w-5" />}
      />

      {!canView && (
        <PageCard className="rounded-2xl">
          <div className="text-sm text-muted-foreground">Acesso restrito à equipe.</div>
        </PageCard>
      )}

      {canView && (
        <PageCard className="rounded-2xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  name="q"
                  placeholder="Buscar por assunto ou e-mail…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="w-[190px]">
                <Select name="status" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                  <option value="all">Todos</option>
                  {statuses.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setStatus((s) => s)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar'}
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2 text-left font-medium">Assunto</th>
                  <th className="px-2 py-2 text-left font-medium">Empresa</th>
                  <th className="px-2 py-2 text-left font-medium">E-mail</th>
                  <th className="px-2 py-2 text-left font-medium">Última atividade</th>
                  <th className="px-2 py-2 text-right font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading && (
                  <tr>
                    <td className="px-2 py-4 text-muted-foreground" colSpan={6}>
                      Nenhum ticket encontrado.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="px-2 py-2">{statusLabel(r.status)}</td>
                    <td className="px-2 py-2">{r.subject}</td>
                    <td className="px-2 py-2 font-mono text-[12px] text-muted-foreground">{r.empresa_id}</td>
                    <td className="px-2 py-2">{r.requester_email ?? '—'}</td>
                    <td className="px-2 py-2 text-muted-foreground">{new Date(r.last_activity_at).toLocaleString()}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="ml-auto w-[220px]">
                        <Select
                          name={`status_${r.id}`}
                          value={r.status}
                          onChange={(e) => handleSetStatus(r.id, e.target.value as SupportTicketStatus)}
                        >
                          {statuses.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </td>
                  </tr>
                ))}
                {loading && (
                  <tr>
                    <td className="px-2 py-6 text-muted-foreground" colSpan={6}>
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </PageCard>
      )}
    </PageShell>
  );
}
