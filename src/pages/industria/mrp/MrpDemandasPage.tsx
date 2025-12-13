import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart2, Loader2, RefreshCcw, Settings, Shield, PlusCircle } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import {
  MrpDemanda,
  MrpAcaoTipo,
  MrpParametro,
  MrpParametroPayload,
  listMrpDemandas,
  listMrpParametros,
  reprocessarMrpOrdem,
  registrarAcaoMrpDemanda,
  upsertMrpParametro,
  MrpDemandaAcao,
  listMrpDemandaAcoes
} from '@/services/industriaProducao';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { OsItemSearchResult } from '@/services/os';
import DecimalInput from '@/components/ui/forms/DecimalInput';
import { Button } from '@/components/ui/button';
import TextArea from '@/components/ui/forms/TextArea';
import { useSearchParams } from 'react-router-dom';

type ParamModalState = {
  open: boolean;
  editing?: MrpParametro | null;
};

type AcaoModalState = {
  open: boolean;
  demanda?: MrpDemanda | null;
};

type HistoricoModalState = {
  open: boolean;
  demanda?: MrpDemanda | null;
};

export default function MrpDemandasPage() {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [parametros, setParametros] = useState<MrpParametro[]>([]);
  const [demandas, setDemandas] = useState<MrpDemanda[]>([]);
  const [loadingParametros, setLoadingParametros] = useState(true);
  const [loadingDemandas, setLoadingDemandas] = useState(true);
  const [searchParametro, setSearchParametro] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pendente' | 'sugerida' | 'respondida' | 'todas'>('todas');
  const [paramModal, setParamModal] = useState<ParamModalState>({ open: false });
  const [selectedProduto, setSelectedProduto] = useState<OsItemSearchResult | null>(null);
  const [paramForm, setParamForm] = useState({
    lead_time_dias: 0,
    lote_minimo: 0,
    multiplo_compra: 1,
    estoque_seguranca: 0,
    politica_picking: 'FIFO' as 'FIFO' | 'FEFO'
  });
  const [savingParam, setSavingParam] = useState(false);
  const [acaoModal, setAcaoModal] = useState<AcaoModalState>({ open: false });
  const [acaoForm, setAcaoForm] = useState({
    tipo: 'transferencia' as MrpAcaoTipo,
    quantidade: 0,
    data_prometida: '',
    observacoes: ''
  });
  const [savingAcao, setSavingAcao] = useState(false);
  const [historicoModal, setHistoricoModal] = useState<HistoricoModalState>({ open: false });
  const [historicoAcoes, setHistoricoAcoes] = useState<MrpDemandaAcao[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [pendingFocusProduto, setPendingFocusProduto] = useState<{ id: string; nome?: string } | null>(() => {
    const produtoId = searchParams.get('produtoId');
    const produtoNome = searchParams.get('produtoNome') || undefined;
    return produtoId ? { id: produtoId, nome: produtoNome } : null;
  });

  const loadParametros = async () => {
    setLoadingParametros(true);
    try {
      const data = await listMrpParametros(searchParametro || undefined);
      setParametros(data);
    } catch (error: any) {
      addToast(error.message || 'Erro ao carregar parâmetros de MRP.', 'error');
    } finally {
      setLoadingParametros(false);
    }
  };

  const loadDemandas = async () => {
    setLoadingDemandas(true);
    try {
      const statusParam = statusFilter === 'todas' ? undefined : statusFilter;
      const data = await listMrpDemandas(statusParam);
      setDemandas(data);
    } catch (error: any) {
      addToast(error.message || 'Erro ao carregar demandas.', 'error');
    } finally {
      setLoadingDemandas(false);
    }
  };

  useEffect(() => {
    loadParametros();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDemandas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (!pendingFocusProduto || loadingParametros) return;
    const existente = parametros.find(param => param.produto_id === pendingFocusProduto.id);
    if (existente) {
      openEditarParametro(existente);
      setSearchParametro(existente.produto_nome);
    } else {
      setParamModal({ open: true, editing: null });
      setSelectedProduto({
        id: pendingFocusProduto.id,
        descricao: pendingFocusProduto.nome || 'Produto selecionado',
        codigo: '',
        preco_venda: 0,
        type: 'product'
      });
      setParamForm({
        lead_time_dias: 0,
        lote_minimo: 0,
        multiplo_compra: 1,
        estoque_seguranca: 0,
        politica_picking: 'FIFO'
      });
    }
    setPendingFocusProduto(null);
    const next = new URLSearchParams(searchParams);
    next.delete('produtoId');
    next.delete('produtoNome');
    setSearchParams(next, { replace: true });
  }, [pendingFocusProduto, parametros, loadingParametros, searchParams, setSearchParams]);

  const prioridadeClass = (prioridade: string) => {
    switch (prioridade) {
      case 'atrasado':
        return 'bg-red-50 text-red-700 border border-red-100';
      case 'critico':
        return 'bg-amber-50 text-amber-700 border border-amber-100';
      default:
        return 'bg-slate-50 text-slate-600 border border-slate-100';
    }
  };

  const openNovoParametro = () => {
    setParamModal({ open: true, editing: null });
    setParamForm({
      lead_time_dias: 0,
      lote_minimo: 0,
      multiplo_compra: 1,
      estoque_seguranca: 0,
      politica_picking: 'FIFO'
    });
    setSelectedProduto(null);
  };

  const openEditarParametro = (param: MrpParametro) => {
    setParamModal({ open: true, editing: param });
    setSelectedProduto({
      id: param.produto_id,
      descricao: param.produto_nome,
      codigo: '',
      preco_venda: 0,
      type: 'product'
    });
    setParamForm({
      lead_time_dias: param.lead_time_dias,
      lote_minimo: param.lote_minimo,
      multiplo_compra: param.multiplo_compra,
      estoque_seguranca: param.estoque_seguranca,
      politica_picking: param.politica_picking
    });
  };

  const handleSalvarParametro = async () => {
    if (!selectedProduto) {
      addToast('Selecione o produto que receberá os parâmetros.', 'error');
      return;
    }

    const payload: MrpParametroPayload = {
      produto_id: selectedProduto.id,
      lead_time_dias: paramForm.lead_time_dias,
      lote_minimo: paramForm.lote_minimo,
      multiplo_compra: paramForm.multiplo_compra,
      estoque_seguranca: paramForm.estoque_seguranca,
      politica_picking: paramForm.politica_picking
    };

    setSavingParam(true);
    try {
      await upsertMrpParametro(payload);
      addToast('Parâmetros salvos com sucesso!', 'success');
      setParamModal({ open: false });
      loadParametros();
    } catch (error: any) {
      addToast(error.message || 'Erro ao salvar parâmetros.', 'error');
    } finally {
      setSavingParam(false);
    }
  };

  const parametrosFiltrados = useMemo(() => {
    if (!searchParametro) return parametros;
    const searchLower = searchParametro.toLowerCase();
    return parametros.filter(p =>
      p.produto_nome.toLowerCase().includes(searchLower)
    );
  }, [parametros, searchParametro]);

  const handleReprocessar = async (ordemId?: string | null) => {
    if (!ordemId) {
      addToast('Esta demanda não está vinculada a uma OP.', 'warning');
      return;
    }
    try {
      await reprocessarMrpOrdem(ordemId);
      addToast('Demanda reprocessada com sucesso.', 'success');
      loadDemandas();
    } catch (error: any) {
      addToast(error.message || 'Erro ao reprocessar OP.', 'error');
    }
  };

  const openAcao = (demanda: MrpDemanda) => {
    setAcaoModal({ open: true, demanda });
    setAcaoForm({
      tipo: demanda.origem === 'reserva' ? 'transferencia' : 'requisicao_compra',
      quantidade: demanda.necessidade_liquida,
      data_prometida: demanda.data_necessidade
        ? new Date(demanda.data_necessidade).toISOString().slice(0, 10)
        : '',
      observacoes: ''
    });
  };

  const handleSalvarAcao = async () => {
    if (!acaoModal.demanda) return;
    if (acaoForm.quantidade <= 0) {
      addToast('Informe a quantidade a ser tratada.', 'error');
      return;
    }
    setSavingAcao(true);
    try {
      await registrarAcaoMrpDemanda({
        demanda_id: acaoModal.demanda.id,
        tipo: acaoForm.tipo,
        quantidade: acaoForm.quantidade,
        data_prometida: acaoForm.data_prometida || undefined,
        observacoes: acaoForm.observacoes || undefined
      });
      addToast('Ação registrada com sucesso!', 'success');
      setAcaoModal({ open: false, demanda: null });
      loadDemandas();
    } catch (error: any) {
      addToast(error.message || 'Erro ao registrar ação.', 'error');
    } finally {
      setSavingAcao(false);
    }
  };

  const acaoLabel = (tipo?: string | null) => {
    switch (tipo) {
      case 'transferencia':
        return 'Transferência interna';
      case 'requisicao_compra':
        return 'Requisição de compra';
      case 'ordem_compra':
        return 'Ordem de compra';
      case 'ajuste':
        return 'Ajuste manual';
      default:
        return 'Manual';
    }
  };

  const openHistorico = async (demanda: MrpDemanda) => {
    setHistoricoModal({ open: true, demanda });
    setLoadingHistorico(true);
    try {
      const data = await listMrpDemandaAcoes(demanda.id);
      setHistoricoAcoes(data);
    } catch (error: any) {
      addToast(error.message || 'Erro ao carregar histórico.', 'error');
    } finally {
      setLoadingHistorico(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart2 className="text-blue-600" /> Faltas & MRP
          </h1>
          <p className="text-sm text-gray-500">
            Ajuste parâmetros por item e monitore componentes com necessidade líquida para disparar compras/transferências.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadDemandas}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCcw size={16} /> Atualizar Faltas
          </button>
          <button
            onClick={openNovoParametro}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 flex items-center gap-2"
          >
            <PlusCircle size={16} /> Novo Parâmetro
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-lg shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 text-gray-700 font-semibold">
            <Settings size={18} /> Parâmetros por Item
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="text"
              className="border border-gray-200 rounded-md px-3 py-1.5 text-sm"
              placeholder="Buscar produto..."
              value={searchParametro}
              onChange={(e) => setSearchParametro(e.target.value)}
            />
            <button
              onClick={loadParametros}
              className="text-sm text-gray-500 px-3 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Atualizar
            </button>
          </div>
        </div>
        {loadingParametros ? (
          <div className="flex items-center justify-center py-8 text-blue-600 gap-2">
            <Loader2 className="animate-spin" /> Carregando...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Produto</th>
                  <th className="px-4 py-2 text-left font-semibold">Lead Time (dias)</th>
                  <th className="px-4 py-2 text-left font-semibold">Lote Mín.</th>
                  <th className="px-4 py-2 text-left font-semibold">Múltiplo</th>
                  <th className="px-4 py-2 text-left font-semibold">Estoque Seg.</th>
                  <th className="px-4 py-2 text-left font-semibold">Picking</th>
                  <th className="px-4 py-2 text-center font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {parametrosFiltrados.map((param) => (
                  <tr key={param.id} className="border-t">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-800">{param.produto_nome}</div>
                      <div className="text-xs text-gray-500">{param.produto_id}</div>
                    </td>
                    <td className="px-4 py-2">{param.lead_time_dias}</td>
                    <td className="px-4 py-2">{param.lote_minimo}</td>
                    <td className="px-4 py-2">{param.multiplo_compra}</td>
                    <td className="px-4 py-2">{param.estoque_seguranca}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${param.politica_picking === 'FEFO' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {param.politica_picking}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button className="text-blue-600 text-xs hover:underline" onClick={() => openEditarParametro(param)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
                {parametrosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-500 py-6">Nenhum parâmetro cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b px-4 py-3 gap-2">
          <div className="flex items-center gap-2 text-gray-700 font-semibold">
            <AlertTriangle className="text-amber-500" size={18} /> Demandas / Faltas
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="min-w-[160px]"
            >
              <option value="todas">Todas</option>
              <option value="pendente">Pendentes</option>
              <option value="sugerida">Sugeridas</option>
              <option value="respondida">Respondidas</option>
            </Select>
            <button
              onClick={loadDemandas}
              className="px-3 py-1.5 text-sm text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50"
            >
              Atualizar
            </button>
          </div>
        </div>
        {loadingDemandas ? (
          <div className="flex items-center justify-center py-10 text-blue-600 gap-2">
            <Loader2 className="animate-spin" /> Carregando demandas...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Produto</th>
                  <th className="px-4 py-2 text-left font-semibold">OP / Componente</th>
                  <th className="px-4 py-2 text-left font-semibold">Planejado x Reservado</th>
                  <th className="px-4 py-2 text-left font-semibold">Necessidade Líquida</th>
                  <th className="px-4 py-2 text-left font-semibold">Data Necessidade</th>
                  <th className="px-4 py-2 text-center font-semibold">Status</th>
                  <th className="px-4 py-2 text-left font-semibold">Última ação</th>
                  <th className="px-4 py-2 text-center font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {demandas.map((demanda) => (
                  <tr key={demanda.id} className="border-t">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-800">{demanda.produto_nome}</div>
                      <div className="text-xs text-gray-500">{demanda.produto_id}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {demanda.ordem_numero ? `OP ${demanda.ordem_numero}` : '—'}
                      <div className="text-xs text-gray-500">{demanda.componente_id}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {demanda.quantidade_reservada}/{demanda.quantidade_planejada}
                      <div className="text-xs text-gray-500">Estoque disponível: {demanda.quantidade_disponivel}</div>
                    </td>
                    <td className="px-4 py-2 font-semibold text-gray-900">
                      {demanda.necessidade_liquida}
                      <div className="text-xs text-gray-500">Segurança: {demanda.estoque_seguranca}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {demanda.data_necessidade ? new Date(demanda.data_necessidade).toLocaleDateString() : '—'}
                      <div className="text-xs text-gray-500">Lead time: {demanda.lead_time_dias} dias</div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${prioridadeClass(demanda.prioridade)}`}>
                        <Shield size={12} />
                        {demanda.status}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {demanda.ultima_acao_tipo ? (
                        <div>
                          <div className="font-medium">{acaoLabel(demanda.ultima_acao_tipo)}</div>
                          <div className="text-xs text-gray-500">
                            {demanda.ultima_acao_quantidade ? `${demanda.ultima_acao_quantidade} un · ` : ''}
                            {demanda.ultima_acao_data ? new Date(demanda.ultima_acao_data).toLocaleString() : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Nenhuma ação registrada</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center text-xs space-y-1">
                      <button className="text-blue-600 hover:underline block w-full" onClick={() => handleReprocessar(demanda.ordem_id)}>
                        Reprocessar OP
                      </button>
                      <button className="text-green-600 hover:underline block w-full" onClick={() => openAcao(demanda)}>
                        Registrar ação
                      </button>
                      <button className="text-gray-600 hover:underline block w-full" onClick={() => openHistorico(demanda)}>
                        Histórico
                      </button>
                      <div className="text-[11px] text-gray-500">{demanda.origem}</div>
                    </td>
                  </tr>
                ))}
                {demandas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-gray-500 py-6">Nenhuma demanda encontrada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={paramModal.open}
        onClose={() => setParamModal({ open: false })}
        title={paramModal.editing ? 'Editar Parâmetros' : 'Novo Parâmetro MRP'}
        size="4xl"
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Produto</label>
            {paramModal.editing ? (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-700">
                {paramModal.editing.produto_nome}
              </div>
            ) : (
              <ItemAutocomplete
                onSelect={(item) => setSelectedProduto(item)}
                type="product"
                placeholder="Buscar produto..."
                clearOnSelect={false}
              />
            )}
            {!paramModal.editing && selectedProduto && (
              <p className="text-xs text-gray-500 mt-1">Selecionado: {selectedProduto.descricao}</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Lead time (dias)"
              type="number"
              value={paramForm.lead_time_dias}
              onChange={(e) => setParamForm(prev => ({ ...prev, lead_time_dias: Number(e.target.value) }))}
            />
            <DecimalInput
              label="Lote mínimo"
              value={paramForm.lote_minimo}
              onChange={(value) => setParamForm(prev => ({ ...prev, lote_minimo: value }))}
            />
            <DecimalInput
              label="Múltiplo de Compra"
              value={paramForm.multiplo_compra}
              onChange={(value) => setParamForm(prev => ({ ...prev, multiplo_compra: value }))}
            />
            <DecimalInput
              label="Estoque de Segurança"
              value={paramForm.estoque_seguranca}
              onChange={(value) => setParamForm(prev => ({ ...prev, estoque_seguranca: value }))}
            />
          </div>
          <Select
            label="Política de Picking"
            value={paramForm.politica_picking}
            onChange={(e) => setParamForm(prev => ({ ...prev, politica_picking: e.target.value as 'FIFO' | 'FEFO' }))}
          >
            <option value="FIFO">FIFO (Primeiro que entra sai primeiro)</option>
            <option value="FEFO">FEFO (Vencimento)</option>
          </Select>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" onClick={() => setParamModal({ open: false })}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarParametro} disabled={savingParam}>
              {savingParam ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={acaoModal.open}
        onClose={() => setAcaoModal({ open: false })}
        title="Registrar ação para demanda"
        size="3xl"
      >
        <div className="p-6 space-y-4">
          {acaoModal.demanda && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
              <div className="font-semibold">{acaoModal.demanda.produto_nome}</div>
              <div>Necessidade líquida: {acaoModal.demanda.necessidade_liquida}</div>
              {acaoModal.demanda.data_necessidade && (
                <div>Data de necessidade: {new Date(acaoModal.demanda.data_necessidade).toLocaleDateString()}</div>
              )}
            </div>
          )}
          <Select
            label="Tipo de ação"
            value={acaoForm.tipo}
            onChange={(e) => setAcaoForm(prev => ({ ...prev, tipo: e.target.value as MrpAcaoTipo }))}
          >
            <option value="transferencia">Transferência interna</option>
            <option value="requisicao_compra">Requisição de compra</option>
            <option value="ordem_compra">Ordem de compra</option>
            <option value="ajuste">Ajuste manual</option>
            <option value="manual">Outro / manual</option>
          </Select>
          <DecimalInput
            label="Quantidade"
            value={acaoForm.quantidade}
            onChange={(value) => setAcaoForm(prev => ({ ...prev, quantidade: value }))}
          />
          <Input
            label="Data prometida"
            type="date"
            value={acaoForm.data_prometida}
            onChange={(e) => setAcaoForm(prev => ({ ...prev, data_prometida: e.target.value }))}
          />
          <TextArea
            label="Observações"
            value={acaoForm.observacoes}
            onChange={(e) => setAcaoForm(prev => ({ ...prev, observacoes: e.target.value }))}
            rows={3}
          />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" onClick={() => setAcaoModal({ open: false })}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarAcao} disabled={savingAcao}>
              {savingAcao ? 'Registrando...' : 'Registrar ação'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={historicoModal.open}
        onClose={() => setHistoricoModal({ open: false })}
        title="Histórico de ações"
        size="3xl"
      >
        <div className="p-6 space-y-4">
          {historicoModal.demanda && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
              <div className="font-semibold">{historicoModal.demanda.produto_nome}</div>
              <div>Demanda: {historicoModal.demanda.necessidade_liquida} un</div>
            </div>
          )}
          {loadingHistorico ? (
            <div className="flex items-center justify-center py-6 text-blue-600 gap-2">
              <Loader2 className="animate-spin" /> Carregando histórico...
            </div>
          ) : historicoAcoes.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma ação registrada para esta demanda.</p>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
              {historicoAcoes.map((acao) => (
                <div key={acao.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between text-sm font-semibold text-gray-800">
                    <span>{acaoLabel(acao.tipo)}</span>
                    <span>{new Date(acao.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    Quantidade: {acao.quantidade} {acao.unidade || 'un'}
                  </div>
                  {acao.data_prometida && (
                    <div className="text-xs text-gray-500">Prometido para {new Date(acao.data_prometida).toLocaleDateString()}</div>
                  )}
                  {acao.observacoes && (
                    <div className="text-xs text-gray-500 mt-1">Obs: {acao.observacoes}</div>
                  )}
                  <div className="text-xs text-gray-400 mt-1">
                    Registrado por {acao.usuario_email || 'sistema'}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end border-t pt-4">
            <Button variant="ghost" onClick={() => setHistoricoModal({ open: false })}>
              Fechar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
