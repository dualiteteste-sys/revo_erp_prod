import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/contexts/ToastProvider';
import PageHeader from '@/components/ui/PageHeader';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import Select from '@/components/ui/forms/Select';
import {
  BookOpen,
  Edit2,
  Loader2,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  fiscalNaturezasOperacaoList,
  fiscalNaturezasOperacaoUpsert,
  fiscalNaturezasOperacaoDelete,
  type NaturezaOperacaoRow,
} from '@/services/fiscalNaturezasOperacao';
import { logger } from '@/lib/logger';

const FINALIDADE_LABELS: Record<string, string> = {
  '1': 'Normal',
  '2': 'Complementar',
  '3': 'Ajuste',
  '4': 'Devolução',
};

const REGIME_LABELS: Record<string, string> = {
  simples: 'Simples Nacional',
  normal: 'Regime Normal',
  ambos: 'Ambos',
};

const TIPO_LABELS: Record<string, string> = {
  saida: 'Saída',
  entrada: 'Entrada',
};

type FormData = {
  id?: string;
  codigo: string;
  descricao: string;
  cfop_dentro_uf: string;
  cfop_fora_uf: string;
  cfop_secundario_dentro_uf: string;
  cfop_secundario_fora_uf: string;
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
  gera_financeiro: boolean;
  movimenta_estoque: boolean;
  finalidade_emissao: string;
  tipo_operacao: string;
  observacoes_padrao: string;
  regime_aplicavel: string;
  ativo: boolean;
};

const EMPTY_FORM: FormData = {
  codigo: '',
  descricao: '',
  cfop_dentro_uf: '',
  cfop_fora_uf: '',
  cfop_secundario_dentro_uf: '',
  cfop_secundario_fora_uf: '',
  icms_cst: '',
  icms_csosn: '',
  icms_aliquota: '0',
  icms_reducao_base: '0',
  codigo_beneficio_fiscal: '',
  pis_cst: '99',
  pis_aliquota: '0',
  cofins_cst: '99',
  cofins_aliquota: '0',
  ipi_cst: '',
  ipi_aliquota: '0',
  gera_financeiro: true,
  movimenta_estoque: true,
  finalidade_emissao: '1',
  tipo_operacao: 'saida',
  observacoes_padrao: '',
  regime_aplicavel: 'ambos',
  ativo: true,
};

function rowToForm(r: NaturezaOperacaoRow): FormData {
  return {
    id: r.id,
    codigo: r.codigo,
    descricao: r.descricao,
    cfop_dentro_uf: r.cfop_dentro_uf ?? '',
    cfop_fora_uf: r.cfop_fora_uf ?? '',
    cfop_secundario_dentro_uf: r.cfop_secundario_dentro_uf ?? '',
    cfop_secundario_fora_uf: r.cfop_secundario_fora_uf ?? '',
    icms_cst: r.icms_cst ?? '',
    icms_csosn: r.icms_csosn ?? '',
    icms_aliquota: String(r.icms_aliquota),
    icms_reducao_base: String(r.icms_reducao_base),
    codigo_beneficio_fiscal: r.codigo_beneficio_fiscal ?? '',
    pis_cst: r.pis_cst ?? '99',
    pis_aliquota: String(r.pis_aliquota),
    cofins_cst: r.cofins_cst ?? '99',
    cofins_aliquota: String(r.cofins_aliquota),
    ipi_cst: r.ipi_cst ?? '',
    ipi_aliquota: String(r.ipi_aliquota),
    gera_financeiro: r.gera_financeiro,
    movimenta_estoque: r.movimenta_estoque,
    finalidade_emissao: r.finalidade_emissao,
    tipo_operacao: r.tipo_operacao,
    observacoes_padrao: r.observacoes_padrao ?? '',
    regime_aplicavel: r.regime_aplicavel,
    ativo: r.ativo,
  };
}

const NaturezasOperacaoPage: React.FC = () => {
  const { activeEmpresaId, loading: authLoading } = useAuth();
  const { addToast } = useToast();

  const [rows, setRows] = useState<NaturezaOperacaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('');
  const [filterAtivo, setFilterAtivo] = useState<string>('true');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<FormData>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const canShow = !authLoading && !!activeEmpresaId;

  const fetchList = useCallback(async () => {
    if (!activeEmpresaId) return;
    setLoading(true);
    try {
      const data = await fiscalNaturezasOperacaoList({
        q: search.trim() || undefined,
        tipo: filterTipo || undefined,
        ativo: filterAtivo === '' ? undefined : filterAtivo === 'true',
      });
      setRows(data ?? []);
    } catch (e: any) {
      logger.warn('fiscalNaturezasOperacaoList error', { error: e?.message });
      addToast(e?.message || 'Erro ao carregar naturezas.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeEmpresaId, search, filterTipo, filterAtivo, addToast]);

  useEffect(() => {
    if (canShow) fetchList();
  }, [canShow, fetchList]);

  const openNew = () => {
    setForm({ ...EMPTY_FORM });
    setErrors([]);
    setIsModalOpen(true);
  };

  const openEdit = (row: NaturezaOperacaoRow) => {
    setForm(rowToForm(row));
    setErrors([]);
    setIsModalOpen(true);
  };

  const handleDelete = async (row: NaturezaOperacaoRow) => {
    if (!confirm(`Desativar "${row.descricao}"?`)) return;
    try {
      await fiscalNaturezasOperacaoDelete(row.id);
      addToast('Natureza desativada.', 'success');
      await fetchList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao desativar.', 'error');
    }
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!form.codigo.trim()) errs.push('Código é obrigatório.');
    if (!form.descricao.trim()) errs.push('Descrição é obrigatória.');
    const cfopD = (form.cfop_dentro_uf || '').replace(/\D/g, '');
    const cfopF = (form.cfop_fora_uf || '').replace(/\D/g, '');
    if (cfopD && cfopD.length !== 4) errs.push('CFOP dentro UF deve ter 4 dígitos.');
    if (cfopF && cfopF.length !== 4) errs.push('CFOP fora UF deve ter 4 dígitos.');
    const cfop2D = (form.cfop_secundario_dentro_uf || '').replace(/\D/g, '');
    const cfop2F = (form.cfop_secundario_fora_uf || '').replace(/\D/g, '');
    if (cfop2D && cfop2D.length !== 4) errs.push('2º CFOP dentro UF deve ter 4 dígitos.');
    if (cfop2F && cfop2F.length !== 4) errs.push('2º CFOP fora UF deve ter 4 dígitos.');
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
        codigo: form.codigo.trim(),
        descricao: form.descricao.trim(),
        cfop_dentro_uf: form.cfop_dentro_uf.trim() || null,
        cfop_fora_uf: form.cfop_fora_uf.trim() || null,
        cfop_secundario_dentro_uf: form.cfop_secundario_dentro_uf.trim() || null,
        cfop_secundario_fora_uf: form.cfop_secundario_fora_uf.trim() || null,
        icms_cst: form.icms_cst.trim() || null,
        icms_csosn: form.icms_csosn.trim() || null,
        icms_aliquota: Number(form.icms_aliquota) || 0,
        icms_reducao_base: Number(form.icms_reducao_base) || 0,
        codigo_beneficio_fiscal: form.codigo_beneficio_fiscal.trim() || null,
        pis_cst: form.pis_cst.trim() || '99',
        pis_aliquota: Number(form.pis_aliquota) || 0,
        cofins_cst: form.cofins_cst.trim() || '99',
        cofins_aliquota: Number(form.cofins_aliquota) || 0,
        ipi_cst: form.ipi_cst.trim() || null,
        ipi_aliquota: Number(form.ipi_aliquota) || 0,
        gera_financeiro: form.gera_financeiro,
        movimenta_estoque: form.movimenta_estoque,
        finalidade_emissao: form.finalidade_emissao,
        tipo_operacao: form.tipo_operacao,
        observacoes_padrao: form.observacoes_padrao.trim() || null,
        regime_aplicavel: form.regime_aplicavel,
        ativo: form.ativo,
      };
      await fiscalNaturezasOperacaoUpsert(payload);
      addToast(form.id ? 'Natureza atualizada.' : 'Natureza criada.', 'success');
      setIsModalOpen(false);
      await fetchList();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredRows = useMemo(() => rows, [rows]);

  if (!canShow) {
    return (
      <div className="p-6">
        <GlassCard className="p-6">
          <p className="text-sm text-slate-700">Selecione uma empresa ativa para visualizar as naturezas de operação.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="p-1">
      <PageHeader
        title="Naturezas de Operação"
        description="Templates fiscais que determinam CFOP, CST, alíquotas e comportamento da NF-e."
        icon={<BookOpen size={20} />}
        actions={
          <Button onClick={openNew}>
            <Plus size={18} />
            <span className="ml-2">Nova natureza</span>
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
                placeholder="Código, descrição ou CFOP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="min-w-[140px]">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
            <Select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className="text-sm">
              <option value="">Todos</option>
              <option value="saida">Saída</option>
              <option value="entrada">Entrada</option>
            </Select>
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
              <th className="px-4 py-3 font-semibold text-slate-600">Código</th>
              <th className="px-4 py-3 font-semibold text-slate-600">Descrição</th>
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">CFOP</th>
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">2º CFOP</th>
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">Finalidade</th>
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">Tipo</th>
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">Regime</th>
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">Status</th>
              <th className="px-4 py-3 font-semibold text-slate-600 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && !filteredRows.length ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  <Loader2 className="mx-auto animate-spin" size={24} />
                  <p className="mt-2 text-sm">Carregando...</p>
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  Nenhuma natureza encontrada.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 hover:bg-slate-50/50 cursor-pointer transition-colors"
                  onClick={() => openEdit(row)}
                >
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{row.codigo}</td>
                  <td className="px-4 py-3 text-slate-800">{row.descricao}</td>
                  <td className="px-4 py-3 text-center font-mono text-xs">
                    {row.cfop_dentro_uf || '—'} / {row.cfop_fora_uf || '—'}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs">
                    {row.cfop_secundario_dentro_uf
                      ? `${row.cfop_secundario_dentro_uf} / ${row.cfop_secundario_fora_uf || '—'}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-xs">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {FINALIDADE_LABELS[row.finalidade_emissao] || row.finalidade_emissao}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs">{TIPO_LABELS[row.tipo_operacao] || row.tipo_operacao}</td>
                  <td className="px-4 py-3 text-center text-xs">{REGIME_LABELS[row.regime_aplicavel] || row.regime_aplicavel}</td>
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
              ))
            )}
          </tbody>
        </table>
      </GlassCard>

      {/* Modal de edição */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={form.id ? 'Editar Natureza de Operação' : 'Nova Natureza de Operação'}
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
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Código</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  value={form.codigo}
                  onChange={(e) => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                  placeholder="Ex: VENDA"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Descrição (natOp no XML)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  value={form.descricao}
                  onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Venda de mercadoria"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Operação</label>
                <Select value={form.tipo_operacao} onChange={(e) => setForm(f => ({ ...f, tipo_operacao: e.target.value }))} className="text-sm">
                  <option value="saida">Saída</option>
                  <option value="entrada">Entrada</option>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Finalidade de Emissão</label>
                <Select value={form.finalidade_emissao} onChange={(e) => setForm(f => ({ ...f, finalidade_emissao: e.target.value }))} className="text-sm">
                  <option value="1">1 — Normal</option>
                  <option value="2">2 — Complementar</option>
                  <option value="3">3 — Ajuste</option>
                  <option value="4">4 — Devolução</option>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Regime Aplicável</label>
                <Select value={form.regime_aplicavel} onChange={(e) => setForm(f => ({ ...f, regime_aplicavel: e.target.value }))} className="text-sm">
                  <option value="ambos">Ambos</option>
                  <option value="simples">Simples Nacional</option>
                  <option value="normal">Regime Normal</option>
                </Select>
              </div>
            </div>
          </fieldset>

          {/* CFOPs */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">CFOPs</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">CFOP Dentro UF (5xxx)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.cfop_dentro_uf}
                  onChange={(e) => setForm(f => ({ ...f, cfop_dentro_uf: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="Ex: 5102"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">CFOP Fora UF (6xxx)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.cfop_fora_uf}
                  onChange={(e) => setForm(f => ({ ...f, cfop_fora_uf: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="Ex: 6102"
                  maxLength={4}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">2º CFOP Dentro UF <span className="font-normal text-slate-400">(opcional)</span></label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.cfop_secundario_dentro_uf}
                  onChange={(e) => setForm(f => ({ ...f, cfop_secundario_dentro_uf: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="Ex: 5902"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">2º CFOP Fora UF <span className="font-normal text-slate-400">(opcional)</span></label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.cfop_secundario_fora_uf}
                  onChange={(e) => setForm(f => ({ ...f, cfop_secundario_fora_uf: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="Ex: 6902"
                  maxLength={4}
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">O 2º CFOP é usado quando a mesma nota tem itens com CFOPs diferentes (ex: Retorno 5124 + Remessa 5902).</p>
          </fieldset>

          {/* ICMS */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">ICMS</legend>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">CST (Regime Normal)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.icms_cst}
                  onChange={(e) => setForm(f => ({ ...f, icms_cst: e.target.value.replace(/\D/g, '').slice(0, 3) }))}
                  placeholder="Ex: 00"
                  maxLength={3}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">CSOSN (Simples)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.icms_csosn}
                  onChange={(e) => setForm(f => ({ ...f, icms_csosn: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="Ex: 102"
                  maxLength={4}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Alíquota (%)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.icms_aliquota}
                  onChange={(e) => setForm(f => ({ ...f, icms_aliquota: e.target.value }))}
                  placeholder="18"
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
                  placeholder="0"
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
              <p className="text-xs text-slate-400 mt-1">Obrigatório para CSTs 20, 30, 40, 41, 50, 51, 70. Consulte a tabela do seu estado.</p>
            </div>
          </fieldset>

          {/* PIS / COFINS */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">PIS / COFINS</legend>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">PIS CST</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.pis_cst}
                  onChange={(e) => setForm(f => ({ ...f, pis_cst: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                  placeholder="99"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">PIS Alíquota (%)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.pis_aliquota}
                  onChange={(e) => setForm(f => ({ ...f, pis_aliquota: e.target.value }))}
                  placeholder="0"
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
                  placeholder="99"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">COFINS Alíquota (%)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.cofins_aliquota}
                  onChange={(e) => setForm(f => ({ ...f, cofins_aliquota: e.target.value }))}
                  placeholder="0"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
          </fieldset>

          {/* IPI */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">IPI</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">IPI CST</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.ipi_cst}
                  onChange={(e) => setForm(f => ({ ...f, ipi_cst: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                  placeholder="Ex: 50"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">IPI Alíquota (%)</label>
                <input
                  className="w-full p-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
                  value={form.ipi_aliquota}
                  onChange={(e) => setForm(f => ({ ...f, ipi_aliquota: e.target.value }))}
                  placeholder="0"
                  type="number"
                  step="0.01"
                  min="0"
                />
              </div>
            </div>
          </fieldset>

          {/* Flags */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">Comportamento</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.gera_financeiro}
                  onChange={(e) => setForm(f => ({ ...f, gera_financeiro: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Gera financeiro</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.movimenta_estoque}
                  onChange={(e) => setForm(f => ({ ...f, movimenta_estoque: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Movimenta estoque</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm(f => ({ ...f, ativo: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Ativa</span>
              </label>
            </div>
          </fieldset>

          {/* Observações */}
          <fieldset className="rounded-xl border border-slate-200 p-4">
            <legend className="px-2 text-sm font-semibold text-slate-600">Observações Padrão</legend>
            <textarea
              className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-h-[80px]"
              value={form.observacoes_padrao}
              onChange={(e) => setForm(f => ({ ...f, observacoes_padrao: e.target.value }))}
              placeholder="Texto que será incluído como informações complementares na NF-e..."
            />
          </fieldset>

          {/* Ações */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              {form.id ? 'Salvar alterações' : 'Criar natureza'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default NaturezasOperacaoPage;
