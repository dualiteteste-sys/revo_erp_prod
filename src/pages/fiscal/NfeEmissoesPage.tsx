import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import { useSupabase } from '@/providers/SupabaseProvider';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import { useEmpresaFeatures } from '@/hooks/useEmpresaFeatures';
import { Loader2, Plus, Receipt, Search, Settings, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';

type AmbienteNfe = 'homologacao' | 'producao';

type NfeEmissao = {
  id: string;
  status: string;
  numero: number | null;
  serie: number | null;
  chave_acesso: string | null;
  destinatario_pessoa_id: string | null;
  destinatario_nome: string | null;
  valor_total: number | null;
  ambiente: AmbienteNfe;
  payload: any;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  enfileirada: 'Enfileirada',
  processando: 'Processando',
  autorizada: 'Autorizada',
  rejeitada: 'Rejeitada',
  cancelada: 'Cancelada',
  erro: 'Erro',
};

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

export default function NfeEmissoesPage() {
  const supabase = useSupabase() as any;
  const { activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const features = useEmpresaFeatures();

  const empresaId = activeEmpresa?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<NfeEmissao[]>([]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<NfeEmissao | null>(null);
  const [formAmbiente, setFormAmbiente] = useState<AmbienteNfe>('homologacao');
  const [formValor, setFormValor] = useState<string>('');
  const [formDestinatarioId, setFormDestinatarioId] = useState<string | null>(null);
  const [formDestinatarioName, setFormDestinatarioName] = useState<string | undefined>(undefined);
  const [formPayload, setFormPayload] = useState<string>('{}');

  const canShow = useMemo(() => !!empresaId, [empresaId]);

  const fetchList = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('fiscal_nfe_emissoes')
        .select(
          'id,status,numero,serie,chave_acesso,destinatario_pessoa_id,ambiente,valor_total,payload,last_error,created_at,updated_at,destinatario:pessoas(nome)'
        )
        .eq('empresa_id', empresaId)
        .order('updated_at', { ascending: false })
        .limit(200);

      if (statusFilter) query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;

      const list: NfeEmissao[] = (data || []).map((r: any) => ({
        id: r.id,
        status: r.status,
        numero: r.numero ?? null,
        serie: r.serie ?? null,
        chave_acesso: r.chave_acesso ?? null,
        destinatario_pessoa_id: r.destinatario_pessoa_id ?? null,
        destinatario_nome: r?.destinatario?.nome ?? null,
        valor_total: r.valor_total ?? null,
        ambiente: (r.ambiente ?? 'homologacao') as AmbienteNfe,
        payload: r.payload ?? {},
        last_error: r.last_error ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));

      const filtered = search.trim()
        ? list.filter((row) => {
            const hay = [
              row.chave_acesso || '',
              row.destinatario_nome || '',
              String(row.numero ?? ''),
              String(row.serie ?? ''),
              row.status || '',
            ]
              .join(' ')
              .toLowerCase();
            return hay.includes(search.trim().toLowerCase());
          })
        : list;

      setRows(filtered);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao listar NF-e.', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [addToast, empresaId, search, statusFilter, supabase]);

  useEffect(() => {
    if (!empresaId) return;
    void fetchList();
  }, [empresaId, fetchList]);

  const totals = useMemo(() => {
    const total = rows.length;
    const rascunhos = rows.filter((r) => r.status === 'rascunho').length;
    const autorizadas = rows.filter((r) => r.status === 'autorizada').length;
    const pendentes = rows.filter((r) => ['enfileirada', 'processando'].includes(r.status)).length;
    return { total, rascunhos, autorizadas, pendentes };
  }, [rows]);

  const openNew = async () => {
    setEditing(null);
    setFormAmbiente('homologacao');
    setFormValor('');
    setFormDestinatarioId(null);
    setFormDestinatarioName(undefined);
    setFormPayload('{}');
    setIsModalOpen(true);
  };

  const openEdit = (row: NfeEmissao) => {
    setEditing(row);
    setFormAmbiente(row.ambiente || 'homologacao');
    setFormValor(row.valor_total != null ? String(row.valor_total) : '');
    setFormDestinatarioId(row.destinatario_pessoa_id ?? null);
    setFormDestinatarioName(row.destinatario_nome ?? undefined);
    setFormPayload(JSON.stringify(row.payload ?? {}, null, 2));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!empresaId) return;
    let payloadJson: any = {};
    try {
      payloadJson = formPayload.trim() ? JSON.parse(formPayload) : {};
    } catch (e: any) {
      addToast('JSON inválido no payload. Corrija antes de salvar.', 'error');
      return;
    }

    const valor = formValor.trim() ? Number(String(formValor).replace(',', '.')) : null;
    if (formValor.trim() && (Number.isNaN(valor) || valor! < 0)) {
      addToast('Valor total inválido.', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editing?.id) {
        const { error } = await supabase
          .from('fiscal_nfe_emissoes')
          .update({
            destinatario_pessoa_id: formDestinatarioId ?? null,
            ambiente: formAmbiente,
            valor_total: valor,
            payload: payloadJson,
          })
          .eq('id', editing.id)
          .eq('empresa_id', empresaId);
        if (error) throw error;
        addToast('Rascunho atualizado.', 'success');
      } else {
        const { error } = await supabase.from('fiscal_nfe_emissoes').insert({
          empresa_id: empresaId,
          provider_slug: 'NFE_IO',
          ambiente: formAmbiente,
          status: 'rascunho',
          destinatario_pessoa_id: formDestinatarioId ?? null,
          valor_total: valor,
          payload: payloadJson,
        });
        if (error) throw error;
        addToast('Rascunho criado.', 'success');
      }

      closeModal();
      await fetchList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar rascunho.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSend = () => {
    if (!features.nfe_emissao_enabled) {
      addToast('Emissão está desativada. Ative em Fiscal → Configurações de NF-e.', 'warning');
      return;
    }
    addToast('Integração com provedor será habilitada quando ativarmos a emissão (NFE.io).', 'info');
  };

  if (!canShow) {
    return (
      <div className="p-6">
        <GlassCard className="p-6">
          <p className="text-sm text-slate-700">Selecione uma empresa ativa para visualizar as NF-e.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="p-1">
      <div className="mb-6">
        <PageHeader
          title="NF-e (Rascunhos e Histórico)"
          description="Crie rascunhos e prepare payloads. O envio/autorizar pode permanecer desativado até o go-live."
          icon={<Receipt size={20} />}
          actions={
            <>
              <Link to="/app/fiscal/nfe/configuracoes">
                <Button variant="secondary">
                  <Settings size={18} />
                  <span className="ml-2">Configurações</span>
                </Button>
              </Link>
              <Button onClick={openNew}>
                <Plus size={18} />
                <span className="ml-2">Novo rascunho</span>
              </Button>
            </>
          }
        />
      </div>

      {!features.nfe_emissao_enabled && (
        <div className="mb-4">
          <GlassCard className="p-4 border border-amber-200 bg-amber-50/60">
            <p className="text-sm text-amber-900">
              Emissão está <span className="font-semibold">desativada</span>. Você pode preparar rascunhos, mas não poderá enviar para autorização.
            </p>
          </GlassCard>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
          <p className="text-xs text-slate-700 font-semibold">Total (últimos 200)</p>
          <p className="text-2xl font-bold text-slate-800">{totals.total}</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
          <p className="text-xs text-indigo-700 font-semibold">Rascunhos</p>
          <p className="text-2xl font-bold text-indigo-800">{totals.rascunhos}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <p className="text-xs text-emerald-700 font-semibold">Autorizadas</p>
          <p className="text-2xl font-bold text-emerald-800">{totals.autorizadas}</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-xs text-amber-700 font-semibold">Pendentes</p>
          <p className="text-2xl font-bold text-amber-800">{totals.pendentes}</p>
        </div>
      </div>

      <div className="mb-4 flex gap-4 items-center">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por número, série, chave ou status..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-w-[220px]">
          <option value="">Todos os status</option>
          <option value="rascunho">Rascunho</option>
          <option value="enfileirada">Enfileirada</option>
          <option value="processando">Processando</option>
          <option value="autorizada">Autorizada</option>
          <option value="rejeitada">Rejeitada</option>
          <option value="cancelada">Cancelada</option>
          <option value="erro">Erro</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="h-56 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : rows.length === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center text-center text-gray-500 p-4">
            <Receipt size={48} className="mb-3" />
            <p className="font-semibold text-lg">Nenhuma NF-e encontrada.</p>
            <p className="text-sm">Crie um rascunho para começar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Número/Série</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ambiente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Atualizado</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ação</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <span className="font-semibold">{STATUS_LABEL[row.status] || row.status}</span>
                      {row.last_error ? <div className="text-xs text-red-600 mt-1">{row.last_error}</div> : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {row.numero != null ? row.numero : '—'} / {row.serie != null ? row.serie : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {row.ambiente === 'producao' ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">Produção</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Homologação</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatCurrency(row.valor_total)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(row.updated_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-3">
                        <button className="text-blue-600 hover:text-blue-900" onClick={() => openEdit(row)} title="Abrir rascunho">
                          Abrir
                        </button>
                        <button
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg font-semibold transition-colors ${
                            features.nfe_emissao_enabled
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-slate-200 text-slate-600 cursor-not-allowed'
                          }`}
                          disabled={!features.nfe_emissao_enabled}
                          onClick={handleSend}
                          title={features.nfe_emissao_enabled ? 'Enviar para autorização (quando habilitarmos)' : 'Ative a emissão para enviar'}
                        >
                          <Send size={16} />
                          Enviar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={closeModal} title={editing ? 'Editar rascunho NF-e' : 'Novo rascunho NF-e'} size="80pct">
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Ambiente</label>
              <Select value={formAmbiente} onChange={(e) => setFormAmbiente(e.target.value as AmbienteNfe)} className="min-w-[220px]">
                <option value="homologacao">Homologação</option>
                <option value="producao">Produção</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Valor total</label>
              <input
                value={formValor}
                onChange={(e) => setFormValor(e.target.value)}
                placeholder="Ex.: 1500,00"
                className="w-full p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Destinatário (cliente)</label>
              <ClientAutocomplete
                value={formDestinatarioId}
                initialName={formDestinatarioName}
                onChange={(id, name) => {
                  setFormDestinatarioId(id);
                  setFormDestinatarioName(name);
                }}
                placeholder="Nome/CPF/CNPJ..."
              />
              <p className="text-xs text-slate-500 mt-2">Neste MVP, o rascunho aceita destinatário opcional. A composição completa do XML será implementada na próxima etapa do motor fiscal.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Payload (JSON)</label>
            <textarea
              value={formPayload}
              onChange={(e) => setFormPayload(e.target.value)}
              className="w-full min-h-[280px] font-mono text-xs p-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-slate-500 mt-2">
              Dica: você pode deixar <span className="font-semibold">{'{}'}</span> e evoluir depois. Emissão real ficará disponível quando ativarmos a integração.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="secondary" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={18} /> : null}
              <span className="ml-2">Salvar</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
