import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import PageShell from '@/components/ui/PageShell';
import PageCard from '@/components/ui/PageCard';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastProvider';
import {
  executeOpsAccountDeletion,
  getOpsAccountDeletionPreview,
  listOpsAccountDeletionAudit,
  type OpsAccountDeletionAuditRow,
  type OpsAccountDeletionPreview,
} from '@/services/opsAccountDeletion';
import { supabase } from '@/lib/supabaseClient';

function formatDateTimeBR(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('pt-BR');
}

export default function OpsAccountDeletionPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<OpsAccountDeletionPreview | null>(null);
  const [auditRows, setAuditRows] = useState<OpsAccountDeletionAuditRow[]>([]);
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredConfirmation = useMemo(() => preview?.required_confirmation || '', [preview?.required_confirmation]);
  const confirmationMatches = confirmation.trim() === requiredConfirmation;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [previewData, auditData] = await Promise.all([
        getOpsAccountDeletionPreview(),
        listOpsAccountDeletionAudit(12),
      ]);
      setPreview(previewData);
      setAuditRows(auditData ?? []);
    } catch (e: any) {
      setPreview(null);
      setAuditRows([]);
      setError(e?.message || 'Falha ao carregar o diagnóstico de exclusão de conta.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDelete = async () => {
    if (!preview) return;
    if (!confirmationMatches) {
      addToast('Digite a frase de confirmação exatamente como exibida.', 'warning');
      return;
    }

    setExecuting(true);
    setError(null);
    try {
      await executeOpsAccountDeletion({ confirmation: confirmation.trim(), reason });
      addToast('Conta removida com sucesso. Sessão será encerrada.', 'success');
      setConfirmation('');
      await load();
      await supabase.auth.signOut();
      setTimeout(() => {
        window.location.replace('/login');
      }, 900);
    } catch (e: any) {
      setError(e?.message || 'Falha ao executar exclusão completa da conta.');
      addToast(e?.message || 'Falha ao executar exclusão completa da conta.', 'error');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <PageShell
      header={
        <PageHeader
          title="Exclusão Completa de Conta (Hard Delete)"
          description="Remove definitivamente a empresa ativa, dados do tenant, objetos no storage e usuários auth órfãos."
          icon={<Trash2 size={20} />}
          actions={
            <Button variant="outline" onClick={load} className="gap-2" disabled={loading || executing}>
              <RefreshCw size={16} />
              Atualizar
            </Button>
          }
        />
      }
    >
      <PageCard className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">Ação destrutiva e irreversível.</p>
              <p>
                Esta operação remove a conta inteira da empresa ativa. Use somente para cleanup de ambientes de teste ou cenários
                autorizados.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-600">Carregando pré-validação…</p>
        ) : error ? (
          <p className="text-sm text-red-700">{error}</p>
        ) : preview ? (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-slate-500">Empresa</p>
                <p className="font-semibold text-slate-900">{preview.empresa_nome}</p>
                <p className="font-mono text-xs text-slate-600">{preview.empresa_id}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-slate-500">Membros vinculados</p>
                <p className="text-2xl font-semibold text-slate-900">{preview.memberships_count}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-slate-500">Auth users a remover</p>
                <p className="text-2xl font-semibold text-slate-900">{preview.auth_users_delete_count}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-slate-500">Registros tenant-scoped</p>
                <p className="text-2xl font-semibold text-slate-900">{preview.scoped_rows_total}</p>
                <p className="text-xs text-slate-500">{preview.scoped_tables_count} tabelas mapeadas</p>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-slate-800">Usuários impactados</div>
              <div className="max-h-56 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-slate-600">
                      <th className="px-4 py-2">E-mail</th>
                      <th className="px-4 py-2">Memberships</th>
                      <th className="px-4 py-2">Auth user</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.users.length === 0 ? (
                      <tr>
                        <td className="px-4 py-3 text-slate-500" colSpan={3}>
                          Nenhum usuário vinculado encontrado.
                        </td>
                      </tr>
                    ) : (
                      preview.users.map((user) => (
                        <tr key={user.user_id} className="border-t border-gray-100">
                          <td className="px-4 py-2 text-slate-800">{user.email || '—'}</td>
                          <td className="px-4 py-2 text-slate-600">{user.memberships_total}</td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                user.will_delete_auth ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {user.will_delete_auth ? 'Será removido' : 'Mantido (outras empresas)'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ops-delete-reason">
                  Motivo (opcional)
                </label>
                <input
                  id="ops-delete-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ex.: limpeza de tenant de homologação"
                  className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm"
                  disabled={executing}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ops-delete-confirmation">
                  Confirmação obrigatória
                </label>
                <p className="mb-2 text-xs text-slate-600">
                  Digite exatamente: <span className="font-mono font-semibold">{requiredConfirmation}</span>
                </p>
                <input
                  id="ops-delete-confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  placeholder={requiredConfirmation}
                  className="h-10 w-full rounded-lg border border-gray-300 px-3 font-mono text-sm"
                  disabled={executing}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={executing || !confirmationMatches || !requiredConfirmation}
                  className="gap-2"
                >
                  <Trash2 size={16} />
                  {executing ? 'Excluindo conta…' : 'Excluir conta definitivamente'}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Nenhum dado disponível para o diagnóstico.</p>
        )}
      </PageCard>

      <PageCard className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Histórico recente (auditoria)</h3>
          <span className="text-xs text-slate-500">{auditRows.length} registros</span>
        </div>
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-slate-600 text-left">
              <tr>
                <th className="px-3 py-2">Quando</th>
                <th className="px-3 py-2">Empresa</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Motivo</th>
                <th className="px-3 py-2">Erro</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-500" colSpan={5}>
                    Sem execuções registradas.
                  </td>
                </tr>
              ) : (
                auditRows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-slate-700">{formatDateTimeBR(row.created_at)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.target_empresa_id}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.status === 'success'
                            ? 'bg-emerald-100 text-emerald-700'
                            : row.status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{row.reason || '—'}</td>
                    <td className="px-3 py-2 text-red-700">{row.error_message || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </PageCard>
    </PageShell>
  );
}
