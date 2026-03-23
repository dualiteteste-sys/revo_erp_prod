import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import {
  Edit2,
  Filter,
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  fiscalRegrasList,
  fiscalRegrasUpsert,
  fiscalRegrasDelete,
  type FiscalRegraRow,
} from '@/services/fiscalRegras';
import { listProdutoGrupos, type ProdutoGrupo } from '@/services/produtoGrupos';
import { useIbsCbsEnabled } from '@/hooks/useIbsCbsEnabled';
import { logger } from '@/lib/logger';

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
] as const;

const TIPO_OP_LABELS: Record<string, string> = {
  saida: 'Saída',
  entrada: 'Entrada',
};

const REGIME_LABELS: Record<string, string> = {
  simples: 'Simples Nacional',
  normal: 'Regime Normal',
};

type FormData = {
  id?: string;
  nome: string;
  descricao: string;
  condicao_produto_grupo_id: string;
  condicao_ncm_pattern: string;
  condicao_destinatario_uf: string;
  condicao_tipo_operacao: string;
  condicao_regime: string;
  cfop_dentro_uf: string;
  cfop_fora_uf: string;
  icms_cst: string;
  icms_csosn: string;
  icms_aliquota: string;
  icms_reducao_base: string;
  codigo_beneficio_fiscal: string;
  pis_cst: string;
  pis_aliquota: string;
  cofins_cst: string;
  cofins_aliquota: string;
  ipi_cst: string;
  ipi_aliquota: string;
  ibs_cst: string;
  ibs_aliquota: string;
  cbs_aliquota: string;
  c_class_trib: string;
  prioridade: string;
  ativo: boolean;
};

const EMPTY_FORM: FormData = {
  nome: '',
  descricao: '',
  condicao_produto_grupo_id: '',
  condicao_ncm_pattern: '',
  condicao_destinatario_uf: '',
  condicao_tipo_operacao: '',
  condicao_regime: '',
  cfop_dentro_uf: '',
  cfop_fora_uf: '',
  icms_cst: '',
  icms_csosn: '',
  icms_aliquota: '',
  icms_reducao_base: '',
  codigo_beneficio_fiscal: '',
  pis_cst: '',
  pis_aliquota: '',
  cofins_cst: '',
  cofins_aliquota: '',
  ipi_cst: '',
  ipi_aliquota: '',
  ibs_cst: '',
  ibs_aliquota: '',
  cbs_aliquota: '',
  c_class_trib: '',
  prioridade: '100',
  ativo: true,
};

function rowToForm(r: FiscalRegraRow): FormData {
  return {
    id: r.id,
    nome: r.nome,
    descricao: r.descricao ?? '',
    condicao_produto_grupo_id: r.condicao_produto_grupo_id ?? '',
    condicao_ncm_pattern: r.condicao_ncm_pattern ?? '',
    condicao_destinatario_uf: r.condicao_destinatario_uf ?? '',
    condicao_tipo_operacao: r.condicao_tipo_operacao ?? '',
    condicao_regime: r.condicao_regime ?? '',
    cfop_dentro_uf: r.cfop_dentro_uf ?? '',
    cfop_fora_uf: r.cfop_fora_uf ?? '',
    icms_cst: r.icms_cst ?? '',
    icms_csosn: r.icms_csosn ?? '',
    icms_aliquota: r.icms_aliquota != null ? String(r.icms_aliquota) : '',
    icms_reducao_base: r.icms_reducao_base != null ? String(r.icms_reducao_base) : '',
    codigo_beneficio_fiscal: r.codigo_beneficio_fiscal ?? '',
    pis_cst: r.pis_cst ?? '',
    pis_aliquota: r.pis_aliquota != null ? String(r.pis_aliquota) : '',
    cofins_cst: r.cofins_cst ?? '',
    cofins_aliquota: r.cofins_aliquota != null ? String(r.cofins_aliquota) : '',
    ipi_cst: r.ipi_cst ?? '',
    ipi_aliquota: r.ipi_aliquota != null ? String(r.ipi_aliquota) : '',
    ibs_cst: r.ibs_cst ?? '',
    ibs_aliquota: r.ibs_aliquota != null ? String(r.ibs_aliquota) : '',
    cbs_aliquota: r.cbs_aliquota != null ? String(r.cbs_aliquota) : '',
    c_class_trib: r.c_class_trib ?? '',
    prioridade: String(r.prioridade),
    ativo: r.ativo,
  };
}

const RegrasFiscaisPage: React.FC = () => {
  const { activeEmpresaId, loading: authLoading } = useAuth();
  const { addToast } = useToast();
  const ibsCbsEnabled = useIbsCbsEnabled();

  const [rows, setRows] = useState<FiscalRegraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterAtivo, setFilterAtivo] = useState<string>('true');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const [grupos, setGrupos] = useState<ProdutoGrupo[]>([]);

  const canShow = !authLoading && !!activeEmpresaId;

  // Load product groups for condition selector
  useEffect(() => {
    if (!activeEmpresaId) return;
    listProdutoGrupos().then(setGrupos).catch(() => {});
  }, [activeEmpresaId]);

  const fetchList = useCallback(async () => {
    if (!activeEmpresaId) return;
    setLoading(true);
    try {
      const data = await fiscalRegrasList({
        q: search.trim() || undefined,
        ativo: filterAtivo === '' ? undefined : filterAtivo === 'true',
      });
      setRows(data ?? []);
    } catch (e: any) {
      logger.warn('fiscalRegrasList error', { error: e?.message });
      addToast(e?.message || 'Erro ao carregar regras fiscais.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, search, filterAtivo, addToast]);

  useEffect(() => {
    if (canShow) fetchList();
  }, [canShow, fetchList]);

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setErrors([]);
    setIsModalOpen(true);
  };

  const openEdit = (row: FiscalRegraRow) => {
    setForm(rowToForm(row));
    setErrors([]);
    setIsModalOpen(true);
  };

  const handleDelete = async (row: FiscalRegraRow) => {
    if (!confirm(`Desativar regra "${row.nome}"?`)) return;
    try {
      await fiscalRegrasDelete(row.id);
      addToast('Regra desativada.', 'success');
      await fetchList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao desativar.', 'error');
    }
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!form.nome.trim()) errs.push('Nome é obrigatório.');
    const cfopD = (form.cfop_dentro_uf || '').replace(/\D/g, '');
    const cfopF = (form.cfop_fora_uf || '').replace(/\D/g, '');
    if (cfopD && cfopD.length !== 4) errs.push('CFOP dentro UF deve ter 4 dígitos.');
    if (cfopF && cfopF.length !== 4) errs.push('CFOP fora UF deve ter 4 dígitos.');
    const prio = Number(form.prioridade);
    if (isNaN(prio) || prio < 1 || prio > 9999) errs.push('Prioridade deve ser entre 1 e 9999.');
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...(form.id ? { id: form.id } : {}),
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        condicao_produto_grupo_id: form.condicao_produto_grupo_id || null,
        condicao_ncm_pattern: form.condicao_ncm_pattern.trim() || null,
        condicao_destinatario_uf: form.condicao_destinatario_uf || null,
        condicao_tipo_operacao: form.condicao_tipo_operacao || null,
        condicao_regime: form.condicao_regime || null,
        cfop_dentro_uf: form.cfop_dentro_uf.trim() || null,
        cfop_fora_uf: form.cfop_fora_uf.trim() || null,
        icms_cst: form.icms_cst.trim() || null,
        icms_csosn: form.icms_csosn.trim() || null,
        icms_aliquota: form.icms_aliquota ? Number(form.icms_aliquota) : null,
        icms_reducao_base: form.icms_reducao_base ? Number(form.icms_reducao_base) : null,
        codigo_beneficio_fiscal: form.codigo_beneficio_fiscal.trim() || null,
        pis_cst: form.pis_cst.trim() || null,
        pis_aliquota: form.pis_aliquota ? Number(form.pis_aliquota) : null,
        cofins_cst: form.cofins_cst.trim() || null,
        cofins_aliquota: form.cofins_aliquota ? Number(form.cofins_aliquota) : null,
        ipi_cst: form.ipi_cst.trim() || null,
        ipi_aliquota: form.ipi_aliquota ? Number(form.ipi_aliquota) : null,
        ibs_cst: form.ibs_cst.trim() || null,
        ibs_aliquota: form.ibs_aliquota ? Number(form.ibs_aliquota) : null,
        cbs_aliquota: form.cbs_aliquota ? Number(form.cbs_aliquota) : null,
        c_class_trib: form.c_class_trib.trim() || null,
        prioridade: Number(form.prioridade) || 100,
        ativo: form.ativo,
      };
      await fiscalRegrasUpsert(payload);
      addToast(form.id ? 'Regra atualizada.' : 'Regra criada.', 'success');
      setIsModalOpen(false);
      await fetchList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const grupoNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of grupos) map.set(g.id, g.nome);
    return map;
  }, [grupos]);

  if (!canShow) {
    return (
      <div className="p-6">
        <GlassCard className="p-6">
          <p className="text-sm text-slate-700">Selecione uma empresa ativa para visualizar as regras fiscais.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="p-1">
      <PageHeader
        title="Regras Fiscais"
        description="Regras condicionais que sobrescrevem CFOP, CST e alíquotas por grupo de produto, NCM, UF ou regime."
        icon={<Filter size={20} />}
        actions={
          <Button onClick={openNew}>
            <Plus size={18} />
            <span className="ml-2">Nova regra</span>
          </Button>
        }
      />

      {/* Filtros */}
      <GlassCard className="mb-4 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Buscar</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Nome, descrição ou NCM..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
            <Select value={filterAtivo} onChange={(e) => setFilterAtivo(e.target.value)} className="text-sm">
              <option value="true">Ativas</option>
              <option value="false">Inativas</option>
              <option value="">Todas</option>
            </Select>
          </div>
          <Button variant="secondary" onClick={fetchList} disabled={loading}>
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            <span className="ml-1 text-sm">Buscar</span>
          </Button>
        </div>
      </GlassCard>

      {/* Tabela */}
      <GlassCard className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-3 font-semibold text-slate-600 text-center w-16">Prior.</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Nome</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Condições</th>
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">CFOP</th>
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">CST/CSOSN</th>
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">Status</th>
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  <Loader2 className="mx-auto animate-spin" size={24} />
                  <p className="mt-2 text-sm">Carregando...</p>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma regra fiscal encontrada.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const conditions: string[] = [];
                if (row.condicao_produto_grupo_id) {
                  conditions.push(`Grupo: ${grupoNameById.get(row.condicao_produto_grupo_id) || 'ID...'}`);
                }
                if (row.condicao_ncm_pattern) conditions.push(`NCM: ${row.condicao_ncm_pattern}`);
                if (row.condicao_destinatario_uf) conditions.push(`UF: ${row.condicao_destinatario_uf}`);
                if (row.condicao_tipo_operacao) conditions.push(TIPO_OP_LABELS[row.condicao_tipo_operacao] || row.condicao_tipo_operacao);
                if (row.condicao_regime) conditions.push(REGIME_LABELS[row.condicao_regime] || row.condicao_regime);

                return (
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors"
                    onClick={() => openEdit(row)}
                  >
                    <td className="px-4 py-3 text-center font-mono text-xs font-semibold text-slate-700">
                      {row.prioridade}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{row.nome}</div>
                      {row.descricao && (
                        <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[300px]">{row.descricao}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {conditions.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {conditions.map((c, i) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs">
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Sem condições (aplica a todos)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs">
                      {row.cfop_dentro_uf || row.cfop_fora_uf
                        ? `${row.cfop_dentro_uf || '—'} / ${row.cfop_fora_uf || '—'}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-xs">
                      {row.icms_cst || row.icms_csosn
                        ? `${row.icms_cst || '—'} / ${row.icms_csosn || '—'}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${row.ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                        {row.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition"
                          title="Editar"
                          onClick={(e) => { e.stopPropagation(); openEdit(row); }}
                        >
                          <Edit2 size={15} />
                        </button>
                        {row.ativo && (
                          <button
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition"
                            title="Desativar"
                            onClick={(e) => { e.stopPropagation(); handleDelete(row); }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </GlassCard>

      {/* Modal de edição */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={form.id ? 'Editar Regra Fiscal' : 'Nova Regra Fiscal'}
        size="4xl"
      >
        <div className="space-y-6 p-1">
          {errors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {/* Identificação */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">Identificação</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nome</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  value={form.nome}
                  onChange={(e) => setForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: ICMS ST Informática SP"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Prioridade</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.prioridade}
                  onChange={(e) => setForm(f => ({ ...f, prioridade: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="100"
                  type="number"
                  min="1"
                  max="9999"
                />
                <p className="text-xs text-slate-400 mt-1">Menor = maior prioridade</p>
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição</label>
              <textarea
                className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-h-[60px]"
                value={form.descricao}
                onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Descreva quando esta regra se aplica..."
              />
            </div>
          </fieldset>

          {/* Condições */}
          <fieldset className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
            <legend className="px-2 text-sm font-semibold text-amber-700">Condições (quando aplicar)</legend>
            <p className="text-xs text-amber-600 mb-3">Campos vazios significam "qualquer valor" — a regra será aplicada a todos os itens que correspondam às condições preenchidas.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Grupo de Produto</label>
                <Select
                  value={form.condicao_produto_grupo_id}
                  onChange={(e) => setForm(f => ({ ...f, condicao_produto_grupo_id: e.target.value }))}
                  className="text-sm"
                >
                  <option value="">Qualquer grupo</option>
                  {grupos.map(g => (
                    <option key={g.id} value={g.id}>{g.nome}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">NCM (padrão)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.condicao_ncm_pattern}
                  onChange={(e) => setForm(f => ({ ...f, condicao_ncm_pattern: e.target.value.replace(/[^0-9%]/g, '') }))}
                  placeholder="Ex: 8471% (usa LIKE)"
                />
                <p className="text-xs text-slate-400 mt-1">Use % como coringa. Ex: 8471% = todos NCMs que começam com 8471.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">UF Destinatário</label>
                <Select
                  value={form.condicao_destinatario_uf}
                  onChange={(e) => setForm(f => ({ ...f, condicao_destinatario_uf: e.target.value }))}
                  className="text-sm"
                >
                  <option value="">Qualquer UF</option>
                  {UF_LIST.map(uf => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Operação</label>
                <Select
                  value={form.condicao_tipo_operacao}
                  onChange={(e) => setForm(f => ({ ...f, condicao_tipo_operacao: e.target.value }))}
                  className="text-sm"
                >
                  <option value="">Qualquer</option>
                  <option value="saida">Saída</option>
                  <option value="entrada">Entrada</option>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Regime Tributário</label>
                <Select
                  value={form.condicao_regime}
                  onChange={(e) => setForm(f => ({ ...f, condicao_regime: e.target.value }))}
                  className="text-sm"
                >
                  <option value="">Qualquer</option>
                  <option value="simples">Simples Nacional</option>
                  <option value="normal">Regime Normal</option>
                </Select>
              </div>
            </div>
          </fieldset>

          {/* Overrides — CFOPs */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">Sobrescrever CFOPs</legend>
            <p className="text-xs text-slate-400 mb-3">Deixe vazio para não sobrescrever (manter o valor da Natureza de Operação).</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">CFOP Dentro UF (5xxx)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.cfop_dentro_uf}
                  onChange={(e) => setForm(f => ({ ...f, cfop_dentro_uf: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="Ex: 5405"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">CFOP Fora UF (6xxx)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.cfop_fora_uf}
                  onChange={(e) => setForm(f => ({ ...f, cfop_fora_uf: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="Ex: 6405"
                  maxLength={4}
                />
              </div>
            </div>
          </fieldset>

          {/* Overrides — ICMS */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">Sobrescrever ICMS</legend>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">CST (Regime Normal)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.icms_cst}
                  onChange={(e) => setForm(f => ({ ...f, icms_cst: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                  placeholder="Ex: 60"
                  maxLength={3}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">CSOSN (Simples)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.icms_csosn}
                  onChange={(e) => setForm(f => ({ ...f, icms_csosn: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="Ex: 500"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Alíquota (%)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.icms_aliquota}
                  onChange={(e) => setForm(f => ({ ...f, icms_aliquota: e.target.value }))}
                  placeholder="—"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Redução Base (%)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.icms_reducao_base}
                  onChange={(e) => setForm(f => ({ ...f, icms_reducao_base: e.target.value }))}
                  placeholder="—"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Cód. Benefício Fiscal (cBenef)</label>
              <input
                className="w-full md:w-1/2 p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                value={form.codigo_beneficio_fiscal}
                onChange={(e) => setForm(f => ({ ...f, codigo_beneficio_fiscal: e.target.value.toUpperCase().slice(0, 10) }))}
                placeholder="Ex: SP000202"
                maxLength={10}
              />
            </div>
          </fieldset>

          {/* Overrides — PIS / COFINS */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">Sobrescrever PIS / COFINS</legend>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">PIS CST</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.pis_cst}
                  onChange={(e) => setForm(f => ({ ...f, pis_cst: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                  placeholder="—"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">PIS Alíquota (%)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.pis_aliquota}
                  onChange={(e) => setForm(f => ({ ...f, pis_aliquota: e.target.value }))}
                  placeholder="—"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">COFINS CST</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.cofins_cst}
                  onChange={(e) => setForm(f => ({ ...f, cofins_cst: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                  placeholder="—"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">COFINS Alíquota (%)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.cofins_aliquota}
                  onChange={(e) => setForm(f => ({ ...f, cofins_aliquota: e.target.value }))}
                  placeholder="—"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
          </fieldset>

          {/* Overrides — IPI */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">Sobrescrever IPI</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">IPI CST</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.ipi_cst}
                  onChange={(e) => setForm(f => ({ ...f, ipi_cst: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                  placeholder="—"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">IPI Alíquota (%)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.ipi_aliquota}
                  onChange={(e) => setForm(f => ({ ...f, ipi_aliquota: e.target.value }))}
                  placeholder="—"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
          </fieldset>

          {/* Overrides — IBS/CBS (2026) — condicional */}
          {ibsCbsEnabled && (
            <fieldset className="rounded-xl border border-violet-200 bg-violet-50/30 p-4">
              <legend className="px-2 text-sm font-semibold text-violet-700">Sobrescrever IBS / CBS (Reforma 2026)</legend>
              <p className="text-xs text-violet-500 mb-3">Sobrescreve alíquotas IBS/CBS quando esta regra for aplicada. Deixe vazio para manter o valor da Natureza de Operação.</p>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">CST IBS</label>
                  <input
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500"
                    value={form.ibs_cst}
                    onChange={(e) => setForm(f => ({ ...f, ibs_cst: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                    placeholder="—"
                    maxLength={3}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Alíquota IBS (%)</label>
                  <input
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500"
                    value={form.ibs_aliquota}
                    onChange={(e) => setForm(f => ({ ...f, ibs_aliquota: e.target.value }))}
                    placeholder="—"
                    type="number"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Alíquota CBS (%)</label>
                  <input
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500"
                    value={form.cbs_aliquota}
                    onChange={(e) => setForm(f => ({ ...f, cbs_aliquota: e.target.value }))}
                    placeholder="—"
                    type="number"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">cClassTrib</label>
                  <input
                    className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-violet-500"
                    value={form.c_class_trib}
                    onChange={(e) => setForm(f => ({ ...f, c_class_trib: e.target.value.slice(0, 20) }))}
                    placeholder="—"
                    maxLength={20}
                  />
                </div>
              </div>
            </fieldset>
          )}

          {/* Status */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">Controle</legend>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm(f => ({ ...f, ativo: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">Regra ativa</span>
            </label>
          </fieldset>

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              {form.id ? 'Salvar alterações' : 'Criar regra'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RegrasFiscaisPage;
