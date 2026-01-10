import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, PlusCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/contexts/ToastProvider';
import { getPartners, type PartnerListItem } from '@/services/partners';
import { deleteContrato, listContratos, upsertContrato, type ServicoContrato, type ServicoContratoStatus } from '@/services/servicosMvp';
import { supabase } from '@/lib/supabaseClient';

type FormState = {
  id: string | null;
  cliente_id: string;
  numero: string;
  descricao: string;
  valor_mensal: string;
  status: ServicoContratoStatus;
  data_inicio: string;
  data_fim: string;
  observacoes: string;
};

type BillingRuleTipo = 'mensal' | 'avulso';
type BillingRuleRow = {
  id: string;
  contrato_id: string;
  tipo: BillingRuleTipo;
  ativo: boolean;
  valor_mensal: number;
  dia_vencimento: number;
  primeira_competencia: string; // date
  centro_de_custo_id: string | null;
};

type BillingScheduleRow = {
  id: string;
  contrato_id: string;
  kind: BillingRuleTipo;
  competencia: string | null;
  data_vencimento: string;
  valor: number;
  status: 'previsto' | 'gerado' | 'cancelado';
  conta_a_receber_id: string | null;
  cobranca_id: string | null;
};

const emptyForm: FormState = {
  id: null,
  cliente_id: '',
  numero: '',
  descricao: '',
  valor_mensal: '0',
  status: 'ativo',
  data_inicio: '',
  data_fim: '',
  observacoes: '',
};

export default function ContratosPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rows, setRows] = useState<ServicoContrato[]>([]);
  const [clients, setClients] = useState<PartnerListItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingActionLoading, setBillingActionLoading] = useState(false);
  const [billingRule, setBillingRule] = useState<BillingRuleRow | null>(null);
  const [schedule, setSchedule] = useState<BillingScheduleRow[]>([]);

  const clientById = useMemo(() => {
    const m = new Map<string, PartnerListItem>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  async function load() {
    setLoading(true);
    try {
      const [contratos, partners] = await Promise.all([
        listContratos(),
        getPartners({
          page: 1,
          pageSize: 200,
          searchTerm: '',
          filterType: null,
          sortBy: { column: 'nome', ascending: true },
        }),
      ]);
      const eligible = partners.data.filter((p) => p.tipo === 'cliente' || p.tipo === 'ambos');
      setRows(contratos);
      setClients(eligible);
    } catch (e: any) {
      addToast(e.message || 'Falha ao carregar contratos.', 'error');
      setRows([]);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    setForm(emptyForm);
    setBillingRule(null);
    setSchedule([]);
    setIsOpen(true);
  };

  const openEdit = (row: ServicoContrato) => {
    setForm({
      id: row.id,
      cliente_id: row.cliente_id || '',
      numero: row.numero || '',
      descricao: row.descricao || '',
      valor_mensal: String(row.valor_mensal ?? 0),
      status: row.status,
      data_inicio: row.data_inicio || '',
      data_fim: row.data_fim || '',
      observacoes: row.observacoes || '',
    });
    setBillingRule(null);
    setSchedule([]);
    setIsOpen(true);
    void loadBilling(row);
  };

  const close = () => {
    setIsOpen(false);
    setForm(emptyForm);
    setBillingRule(null);
    setSchedule([]);
  };

  const canUseBilling = useMemo(() => {
    if (!form.id) return false;
    if (form.status !== 'ativo') return false;
    if (!form.cliente_id) return false;
    return true;
  }, [form.id, form.status, form.cliente_id]);

  const loadBilling = async (row: Pick<ServicoContrato, 'id' | 'valor_mensal' | 'data_inicio'>) => {
    setBillingLoading(true);
    try {
      const { data: rule, error: ruleError } = await (supabase as any)
        .from('servicos_contratos_billing_rules')
        .select('*')
        .eq('contrato_id', row.id)
        .maybeSingle();
      if (ruleError) throw ruleError;

      if (rule) {
        setBillingRule(rule as BillingRuleRow);
      } else {
        const start = row.data_inicio ? String(row.data_inicio) : '';
        const first = start ? `${start.slice(0, 7)}-01` : `${new Date().toISOString().slice(0, 7)}-01`;
        setBillingRule({
          id: '',
          contrato_id: row.id,
          tipo: 'mensal',
          ativo: true,
          valor_mensal: Number(row.valor_mensal ?? 0),
          dia_vencimento: 5,
          primeira_competencia: first,
          centro_de_custo_id: null,
        });
      }

      const { data: sch, error: schError } = await (supabase as any)
        .from('servicos_contratos_billing_schedule')
        .select('*')
        .eq('contrato_id', row.id)
        .order('data_vencimento', { ascending: true })
        .limit(24);
      if (schError) throw schError;

      setSchedule((sch ?? []) as BillingScheduleRow[]);
    } catch (e: any) {
      addToast(e?.message || 'Falha ao carregar faturamento do contrato.', 'error');
      setBillingRule(null);
      setSchedule([]);
    } finally {
      setBillingLoading(false);
    }
  };

  const saveBillingRule = async () => {
    if (!form.id || !billingRule) return;
    if (billingRule.tipo !== 'mensal') {
      addToast('Neste MVP2, apenas regra mensal está habilitada.', 'warn');
      return;
    }

    const valor = Number(billingRule.valor_mensal ?? 0);
    if (Number.isNaN(valor) || valor < 0) {
      addToast('Valor mensal inválido.', 'error');
      return;
    }
    const dia = Number(billingRule.dia_vencimento ?? 5);
    if (!Number.isFinite(dia) || dia < 1 || dia > 28) {
      addToast('Dia de vencimento inválido (1..28).', 'error');
      return;
    }
    const comp = String(billingRule.primeira_competencia ?? '').trim();
    if (!comp) {
      addToast('Informe a primeira competência.', 'error');
      return;
    }

    setBillingActionLoading(true);
    try {
      const payload = {
        contrato_id: form.id,
        tipo: 'mensal',
        ativo: billingRule.ativo !== false,
        valor_mensal: valor,
        dia_vencimento: dia,
        primeira_competencia: comp,
        centro_de_custo_id: billingRule.centro_de_custo_id || null,
      };
      const { data, error } = await (supabase as any)
        .from('servicos_contratos_billing_rules')
        .upsert(payload, { onConflict: 'empresa_id,contrato_id' })
        .select()
        .single();
      if (error) throw error;
      setBillingRule(data as BillingRuleRow);
      addToast('Regra de faturamento salva.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Falha ao salvar regra de faturamento.', 'error');
    } finally {
      setBillingActionLoading(false);
    }
  };

  const generateSchedule = async () => {
    if (!form.id) return;
    setBillingActionLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('servicos_contratos_billing_generate_schedule', {
        p_contrato_id: form.id,
        p_months_ahead: 12,
      });
      if (error) throw error;
      addToast(`Agenda atualizada. Inseridos: ${data?.inserted ?? 0}`, 'success');
      await loadBilling({ id: form.id, valor_mensal: Number(form.valor_mensal ?? 0), data_inicio: form.data_inicio || null });
    } catch (e: any) {
      addToast(e?.message || 'Falha ao gerar agenda.', 'error');
    } finally {
      setBillingActionLoading(false);
    }
  };

  const generateReceivables = async () => {
    if (!form.id) return;
    setBillingActionLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('servicos_contratos_billing_generate_receivables', {
        p_contrato_id: form.id,
        p_until: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
      addToast(`Títulos gerados: ${data?.created ?? 0}`, 'success');
      await loadBilling({ id: form.id, valor_mensal: Number(form.valor_mensal ?? 0), data_inicio: form.data_inicio || null });
    } catch (e: any) {
      addToast(e?.message || 'Falha ao gerar contas a receber.', 'error');
    } finally {
      setBillingActionLoading(false);
    }
  };

  const save = async () => {
    if (!form.descricao.trim()) {
      addToast('Informe a descrição do contrato.', 'error');
      return;
    }
    const valor = Number(form.valor_mensal || 0);
    if (Number.isNaN(valor) || valor < 0) {
      addToast('Valor mensal inválido.', 'error');
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertContrato({
        id: form.id || undefined,
        cliente_id: form.cliente_id || null,
        numero: form.numero.trim() || null,
        descricao: form.descricao.trim(),
        valor_mensal: valor,
        status: form.status,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        observacoes: form.observacoes.trim() || null,
      } as any);
      addToast('Contrato salvo.', 'success');
      await load();
      if (form.id) {
        close();
      } else {
        setForm((prev) => ({ ...prev, id: saved.id }));
        await loadBilling(saved);
      }
    } catch (e: any) {
      addToast(e.message || 'Falha ao salvar contrato.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteContrato(id);
      addToast('Contrato removido.', 'success');
      await load();
    } catch (e: any) {
      addToast(e.message || 'Falha ao remover contrato.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="text-blue-600" /> Contratos (Serviços)
          </h1>
          <p className="text-gray-600 text-sm mt-1">MVP: cadastro de contratos recorrentes.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <PlusCircle size={20} />
          Novo Contrato
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex justify-center h-64 items-center text-gray-500">Nenhum contrato cadastrado.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Valor mensal</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((r) => {
                  const c = r.cliente_id ? clientById.get(r.cliente_id) : null;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">{c?.nome || '-'}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">{r.descricao}</td>
                      <td className="px-4 py-3">{Number(r.valor_mensal || 0).toFixed(2)}</td>
                      <td className="px-4 py-3">{r.status}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => openEdit(r)} className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200">
                            Editar
                          </button>
                          <button
                            onClick={() => remove(r.id)}
                            disabled={deletingId === r.id}
                            className="px-3 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            {deletingId === r.id ? 'Removendo…' : 'Remover'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isOpen} onClose={close} title="Contrato (MVP)" size="4xl" bodyClassName="p-6 md:p-8">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Cliente</label>
              <select
                value={form.cliente_id}
                onChange={(e) => setForm((s) => ({ ...s, cliente_id: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="">(opcional)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-700">Número</label>
              <input
                value={form.numero}
                onChange={(e) => setForm((s) => ({ ...s, numero: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-700">Descrição</label>
            <input
              value={form.descricao}
              onChange={(e) => setForm((s) => ({ ...s, descricao: e.target.value }))}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Valor mensal</label>
              <input
                inputMode="decimal"
                value={form.valor_mensal}
                onChange={(e) => setForm((s) => ({ ...s, valor_mensal: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm text-gray-700">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((s) => ({ ...s, status: e.target.value as ServicoContratoStatus }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              >
                <option value="ativo">Ativo</option>
                <option value="suspenso">Suspenso</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Faturamento (MVP2)</div>
                <div className="text-xs text-gray-600">
                  Configure a regra e gere a agenda. Depois, gere os títulos (Contas a Receber) automaticamente a partir do schedule.
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  form.id ? loadBilling({ id: form.id, valor_mensal: Number(form.valor_mensal ?? 0), data_inicio: form.data_inicio || null }) : null
                }
                disabled={!form.id || billingLoading || billingActionLoading}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Atualizar
              </button>
            </div>

            {!form.id ? (
              <div className="mt-3 text-sm text-gray-700">Salve o contrato para configurar faturamento e ver o preview.</div>
            ) : billingLoading ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando faturamento…
              </div>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-gray-600">Tipo</label>
                    <select
                      value={billingRule?.tipo || 'mensal'}
                      onChange={(e) => setBillingRule((r) => (r ? { ...r, tipo: e.target.value as BillingRuleTipo } : r))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled
                    >
                      <option value="mensal">Mensal</option>
                      <option value="avulso">Avulso</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Valor mensal</label>
                    <input
                      inputMode="decimal"
                      value={String(billingRule?.valor_mensal ?? '')}
                      onChange={(e) => setBillingRule((r) => (r ? { ...r, valor_mensal: Number(e.target.value || 0) } : r))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={billingActionLoading}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Dia de vencimento</label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={String(billingRule?.dia_vencimento ?? 5)}
                      onChange={(e) => setBillingRule((r) => (r ? { ...r, dia_vencimento: Number(e.target.value || 5) } : r))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={billingActionLoading}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Primeira competência</label>
                    <input
                      type="date"
                      value={billingRule?.primeira_competencia || ''}
                      onChange={(e) => setBillingRule((r) => (r ? { ...r, primeira_competencia: e.target.value } : r))}
                      className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-sm"
                      disabled={billingActionLoading}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveBillingRule}
                    disabled={!billingRule || billingActionLoading}
                    className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Salvar regra
                  </button>
                  <button
                    type="button"
                    onClick={generateSchedule}
                    disabled={!billingRule || billingActionLoading || !form.id}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Gerar agenda (12 meses)
                  </button>
                  <button
                    type="button"
                    onClick={generateReceivables}
                    disabled={!canUseBilling || billingActionLoading}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    title={!canUseBilling ? 'Requer contrato ativo com cliente selecionado.' : undefined}
                  >
                    Gerar títulos (até hoje)
                  </button>
                  <div className="text-xs text-gray-600 flex items-center">
                    {!form.cliente_id ? 'Dica: selecione um cliente para gerar títulos.' : null}
                    {form.status !== 'ativo' ? ' Dica: contrato precisa estar ativo.' : null}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold text-gray-700 mb-2">Preview da agenda (próximos 24)</div>
                  {schedule.length === 0 ? (
                    <div className="text-sm text-gray-600">Sem linhas no schedule ainda. Clique em “Gerar agenda”.</div>
                  ) : (
                    <div className="overflow-auto rounded-lg border border-gray-200 bg-white">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr className="text-left text-gray-600">
                            <th className="px-3 py-2">Competência</th>
                            <th className="px-3 py-2">Vencimento</th>
                            <th className="px-3 py-2">Valor</th>
                            <th className="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {schedule.map((s) => (
                            <tr key={s.id}>
                              <td className="px-3 py-2">{s.competencia ? s.competencia.slice(0, 7) : '-'}</td>
                              <td className="px-3 py-2">{s.data_vencimento}</td>
                              <td className="px-3 py-2">{Number(s.valor || 0).toFixed(2)}</td>
                              <td className="px-3 py-2">{s.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-700">Início</label>
              <input
                type="date"
                value={form.data_inicio}
                onChange={(e) => setForm((s) => ({ ...s, data_inicio: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="text-sm text-gray-700">Fim</label>
              <input
                type="date"
                value={form.data_fim}
                onChange={(e) => setForm((s) => ({ ...s, data_fim: e.target.value }))}
                className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-700">Observações</label>
            <textarea
              value={form.observacoes}
              onChange={(e) => setForm((s) => ({ ...s, observacoes: e.target.value }))}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={close} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
