import React, { useState } from 'react';
import { useContasCorrentes, useMovimentacoes, useExtratos } from '@/hooks/useTesouraria';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { PlusCircle, Search, Landmark, ArrowRightLeft, Calendar, UploadCloud, FileSpreadsheet } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import ContasCorrentesTable from '@/components/financeiro/tesouraria/ContasCorrentesTable';
import ContaCorrenteFormPanel from '@/components/financeiro/tesouraria/ContaCorrenteFormPanel';
import MovimentacoesTable from '@/components/financeiro/tesouraria/MovimentacoesTable';
import MovimentacaoFormPanel from '@/components/financeiro/tesouraria/MovimentacaoFormPanel';
import ExtratosTable from '@/components/financeiro/tesouraria/ExtratosTable';
import ImportarExtratoModal from '@/components/financeiro/tesouraria/ImportarExtratoModal';
import ConciliacaoDrawer from '@/components/financeiro/tesouraria/ConciliacaoDrawer';
import ConciliacaoRegrasPanel from '@/components/financeiro/tesouraria/ConciliacaoRegrasPanel';
import { ContaCorrente, Movimentacao, ExtratoItem, deleteContaCorrente, deleteMovimentacao, importarExtrato, conciliarExtrato, desconciliarExtrato, setContaCorrentePadrao, listMovimentacoes } from '@/services/treasury';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import DatePicker from '@/components/ui/DatePicker';
import Toggle from '@/components/ui/forms/Toggle';
import { Button } from '@/components/ui/button';
import { scoreExtratoToMovimentacao } from '@/lib/conciliacao/matching';
import Pagination from '@/components/ui/Pagination';
import ListPaginationBar from '@/components/ui/ListPaginationBar';

export default function TesourariaPage() {
  const [activeTab, setActiveTab] = useState<'contas' | 'movimentos' | 'conciliacao' | 'regras'>('contas');
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [busyExtratoId, setBusyExtratoId] = useState<string | null>(null);
  const [bulkConciliando, setBulkConciliando] = useState(false);
  const [bulkThreshold, setBulkThreshold] = useState(85);

  // --- Contas State ---
  const {
    contas,
    loading: loadingContas,
    refresh: refreshContas,
    searchTerm: searchContas,
    setSearchTerm: setSearchContas
  } = useContasCorrentes();

  const [isContaFormOpen, setIsContaFormOpen] = useState(false);
  const [selectedConta, setSelectedConta] = useState<ContaCorrente | null>(null);
  const [contaToDelete, setContaToDelete] = useState<ContaCorrente | null>(null);

  // --- Shared State (Movimentos & Extratos) ---
  const [selectedContaId, setSelectedContaId] = useState<string | null>(null);

  // --- Movimentos State ---
  const {
    movimentacoes,
    loading: loadingMov,
    refresh: refreshMov,
    startDate: movStartDate, setStartDate: setMovStartDate,
    endDate: movEndDate, setEndDate: setMovEndDate,
  } = useMovimentacoes(selectedContaId);

  const [isMovFormOpen, setIsMovFormOpen] = useState(false);
  const [selectedMov, setSelectedMov] = useState<Movimentacao | null>(null);
  const [movToDelete, setMovToDelete] = useState<Movimentacao | null>(null);

  // --- Extratos State ---
  const {
    extratos,
    loading: loadingExtrato,
    refresh: refreshExtrato,
    startDate: extratoStartDate,
    endDate: extratoEndDate,
    setStartDate: setExtratoStartDate,
    setEndDate: setExtratoEndDate,
    filterConciliado, setFilterConciliado,
    count: extratoCount,
    page: extratoPage,
    pageSize: extratoPageSize,
    setPage: setExtratoPage,
    setPageSize: setExtratoPageSize,
  } = useExtratos(selectedContaId);

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [conciliacaoItem, setConciliacaoItem] = useState<ExtratoItem | null>(null);

  // --- Handlers Contas ---
  const handleNewConta = () => {
    setSelectedConta(null);
    setIsContaFormOpen(true);
  };

  const handleEditConta = (c: ContaCorrente) => {
    setSelectedConta(c);
    setIsContaFormOpen(true);
  };

  const handleDeleteConta = async () => {
    if (!contaToDelete) return;
    try {
      await deleteContaCorrente(contaToDelete.id);
      addToast('Conta removida.', 'success');
      refreshContas();
      setContaToDelete(null);
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleSetPadrao = async (conta: ContaCorrente, para: 'pagamentos' | 'recebimentos') => {
    const label = para === 'pagamentos' ? 'Pagamentos' : 'Recebimentos';
    const ok = await confirm({
      title: `Definir padrão para ${label}`,
      description: `Deseja definir "${conta.nome}" como conta padrão para ${label.toLowerCase()}?`,
      confirmText: 'Definir como padrão',
      cancelText: 'Cancelar',
      variant: 'default',
    });
    if (!ok) return;

    try {
      await setContaCorrentePadrao({ id: conta.id, para });
      addToast(`Conta padrão de ${label.toLowerCase()} atualizada.`, 'success');
      refreshContas();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao definir padrão.', 'error');
    }
  };

  // --- Handlers Movimentos ---
  const handleNewMov = () => {
    if (!selectedContaId) {
        addToast('Selecione uma conta corrente primeiro.', 'warning');
        return;
    }
    setSelectedMov(null);
    setIsMovFormOpen(true);
  };

  const handleEditMov = (m: Movimentacao) => {
    setSelectedMov(m);
    setIsMovFormOpen(true);
  };

  const handleDeleteMov = async () => {
    if (!movToDelete) return;
    try {
      await deleteMovimentacao(movToDelete.id);
      addToast('Movimentação removida.', 'success');
      refreshMov();
      setMovToDelete(null);
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  // --- Handlers Extratos ---
  const handleImport = async (itens: any[]) => {
    if (!selectedContaId) return;
    await importarExtrato(selectedContaId, itens);
    // UX: após import, garantir que o usuário veja o período importado (e primeira página).
    try {
      const dates = (itens || [])
        .map((i: any) => String(i?.data_lancamento || ''))
        .filter((s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s))
        .map((s: string) => new Date(`${s}T00:00:00`))
        .filter((d: Date) => !Number.isNaN(d.getTime()));
      if (dates.length > 0) {
        const min = new Date(Math.min(...dates.map((d) => d.getTime())));
        const max = new Date(Math.max(...dates.map((d) => d.getTime())));
        setExtratoStartDate(min);
        setExtratoEndDate(max);
      }
    } catch {
      // best-effort
    }
    setExtratoPage(1);
    refreshExtrato();
  };

  const handleConciliate = async (movimentacaoId: string) => {
    if (!conciliacaoItem) return;
    if (busyExtratoId) return;
    setBusyExtratoId(conciliacaoItem.id);
    try {
        await conciliarExtrato(conciliacaoItem.id, movimentacaoId);
        addToast('Conciliação realizada!', 'success');
        setConciliacaoItem(null);
        refreshExtrato();
        refreshMov(); // Update movements list too
    } catch (e: any) {
        addToast(e.message, 'error');
    } finally {
        setBusyExtratoId(null);
    }
  };

  const handleUnconciliate = async (item: ExtratoItem) => {
    const ok = await confirm({
      title: 'Desfazer conciliação',
      description: 'Desfazer a conciliação deste lançamento?',
      confirmText: 'Desfazer',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    if (busyExtratoId) return;
    setBusyExtratoId(item.id);
    try {
        await desconciliarExtrato(item.id);
        addToast('Conciliação desfeita.', 'success');
        refreshExtrato();
        refreshMov();
    } catch (e: any) {
        addToast(e.message, 'error');
    } finally {
        setBusyExtratoId(null);
    }
  };

  const handleAutoConciliarPagina = async () => {
    if (!selectedContaId) {
      addToast('Selecione uma conta corrente primeiro.', 'warning');
      return;
    }
    if (busyExtratoId || bulkConciliando) return;

    const pendentes = (extratos || []).filter((e) => !e.conciliado);
    if (pendentes.length === 0) {
      addToast('Nenhum lançamento pendente nesta página.', 'info');
      return;
    }

    setBulkConciliando(true);
    let conciliados = 0;
    let pulados = 0;
    let falhas = 0;

    try {
      for (const extratoItem of pendentes) {
        try {
          const date = new Date(extratoItem.data_lancamento);
          const startDate = new Date(date);
          startDate.setDate(date.getDate() - 5);
          const endDate = new Date(date);
          endDate.setDate(date.getDate() + 5);

          const { data } = await listMovimentacoes({
            contaCorrenteId: selectedContaId,
            startDate,
            endDate,
            tipoMov: extratoItem.tipo_lancamento === 'credito' ? 'entrada' : 'saida',
            page: 1,
            pageSize: 50,
          });

          const unconciliated = (data || []).filter((m) => !m.conciliado);
          if (unconciliated.length === 0) {
            pulados++;
            continue;
          }

          let best: { id: string; score: number } | null = null;
          for (const mov of unconciliated) {
            const { score } = scoreExtratoToMovimentacao({
              extratoDescricao: extratoItem.descricao || '',
              extratoDocumento: extratoItem.documento_ref,
              extratoValor: extratoItem.valor,
              extratoDataISO: extratoItem.data_lancamento,
              movDescricao: mov.descricao,
              movDocumento: mov.documento_ref,
              movValor: mov.valor,
              movDataISO: mov.data_movimento,
            });
            if (!best || score > best.score) best = { id: mov.id, score };
          }

          if (!best || best.score < bulkThreshold) {
            pulados++;
            continue;
          }

          await conciliarExtrato(extratoItem.id, best.id);
          conciliados++;
        } catch (e: any) {
          falhas++;
          addToast(e?.message || 'Erro ao conciliar um lançamento.', 'error');
        }
      }
    } finally {
      setBulkConciliando(false);
      refreshExtrato();
      refreshMov();
      refreshContas();
      addToast(`Auto-conciliação: ${conciliados} conciliado(s), ${pulados} pulado(s), ${falhas} falha(s).`, falhas > 0 ? 'warning' : 'success');
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Landmark className="text-blue-600" /> Tesouraria
          </h1>
          <p className="text-gray-600 text-sm mt-1">Gestão de contas, fluxo de caixa e conciliação.</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
                onClick={() => setActiveTab('contas')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'contas' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
                Contas Correntes
            </button>
            <button
                onClick={() => setActiveTab('movimentos')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'movimentos' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
                Movimentações
            </button>
            <button
                onClick={() => setActiveTab('conciliacao')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'conciliacao' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
                Conciliação
            </button>
            <button
                onClick={() => setActiveTab('regras')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'regras' ? 'bg-white shadow text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
            >
                Regras
            </button>
        </div>
      </div>

      {activeTab === 'contas' && (
        <>
            <div className="mb-6 flex justify-between items-center">
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar contas..."
                        value={searchContas}
                        onChange={(e) => setSearchContas(e.target.value)}
                        className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <Button onClick={handleNewConta} className="gap-2">
                  <PlusCircle size={18} /> Nova Conta
                </Button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                {loadingContas ? (
                    <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /></div>
                ) : (
                    <ContasCorrentesTable 
                        contas={contas} 
                        onEdit={handleEditConta} 
                        onDelete={setContaToDelete} 
                        onSetPadrao={handleSetPadrao}
                    />
                )}
            </div>
        </>
      )}

      {activeTab === 'movimentos' && (
        <div className="flex flex-1 flex-col min-h-0">
            <div className="mb-6 grid grid-cols-1 gap-4 items-end md:grid-cols-12">
                <div className="md:col-span-4 min-w-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Conta Corrente</label>
                    <select 
                        value={selectedContaId || ''} 
                        onChange={e => setSelectedContaId(e.target.value)}
                        className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">Selecione uma conta...</option>
                        {contas.map(c => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                    </select>
                </div>
                
                <div className="md:col-span-5 min-w-0 flex flex-wrap gap-3">
                    <DatePicker label="De" value={movStartDate} onChange={setMovStartDate} className="min-w-[11rem] flex-1" />
                    <DatePicker label="Até" value={movEndDate} onChange={setMovEndDate} className="min-w-[11rem] flex-1" />
                </div>

                <div className="md:col-span-3 flex justify-start md:justify-end">
                  <Button
                    onClick={handleNewMov}
                    disabled={!selectedContaId}
                    className="gap-2 w-full md:w-auto"
                  >
                    <ArrowRightLeft size={18} /> Registrar Movimento
                  </Button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden flex-1 min-h-0">
                {!selectedContaId ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <Landmark size={48} className="mb-4 opacity-20" />
                        <p>Selecione uma conta corrente para visualizar o extrato.</p>
                    </div>
                ) : loadingMov ? (
                    <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /></div>
                ) : (
                  <div className="h-full overflow-auto">
                    <MovimentacoesTable 
                        movimentacoes={movimentacoes} 
                        onEdit={handleEditMov} 
                        onDelete={setMovToDelete} 
                    />
                  </div>
                )}
            </div>
        </div>
      )}

      {activeTab === 'conciliacao' && (
        <div className="flex flex-1 flex-col min-h-0">
            <div className="mb-6 grid grid-cols-1 gap-4 items-end md:grid-cols-12">
                <div className="md:col-span-3 min-w-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Conta Corrente</label>
                    <select 
                        value={selectedContaId || ''} 
                        onChange={e => setSelectedContaId(e.target.value)}
                        className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">Selecione uma conta...</option>
                        {contas.map(c => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                        ))}
                    </select>
                </div>

                <div className="md:col-span-2 flex items-end">
                  <div className="w-full bg-white p-2 rounded-lg border">
                      <Toggle 
                          label="Apenas Pendentes" 
                          name="pendentes" 
                          checked={filterConciliado === false} 
                          onChange={(checked) => setFilterConciliado(checked ? false : null)} 
                      />
                  </div>
                </div>

                <div className="md:col-span-4 min-w-0 flex flex-wrap gap-3">
                  <DatePicker
                    label="De"
                    value={extratoStartDate}
                    onChange={(d) => {
                      setExtratoStartDate(d);
                      setExtratoPage(1);
                    }}
                    className="min-w-[11rem] flex-1"
                  />
                  <DatePicker
                    label="Até"
                    value={extratoEndDate}
                    onChange={(d) => {
                      setExtratoEndDate(d);
                      setExtratoPage(1);
                    }}
                    className="min-w-[11rem] flex-1"
                  />
                </div>

                <div className="md:col-span-3 min-w-0">
                  <div className="w-full flex flex-wrap items-end gap-2 bg-white p-2 rounded-lg border">
                    <label className="text-xs text-gray-600">
                      Threshold
                      <select
                        value={bulkThreshold}
                        onChange={(e) => setBulkThreshold(Number(e.target.value))}
                        className="mt-1 w-[120px] rounded-md border border-gray-200 bg-white px-2 py-2 text-sm"
                        disabled={!selectedContaId || bulkConciliando}
                      >
                        {[70, 75, 80, 85, 90, 95].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handleAutoConciliarPagina()}
                      disabled={!selectedContaId || bulkConciliando || !!busyExtratoId}
                      className="gap-2 flex-1"
                      title="Tenta conciliar automaticamente todos os lançamentos pendentes da página atual."
                    >
                      {bulkConciliando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft size={18} />}
                      Auto conciliar (página)
                    </Button>
                  </div>
                </div>

                <div className="md:col-span-12 flex justify-start md:justify-end">
                  <Button
                    onClick={() => setIsImportModalOpen(true)}
                    disabled={!selectedContaId}
                    className="gap-2 w-full md:w-auto"
                  >
                    <UploadCloud size={18} /> Importar Extrato
                  </Button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden flex-1 min-h-0">
                {!selectedContaId ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                        <FileSpreadsheet size={48} className="mb-4 opacity-20" />
                        <p>Selecione uma conta corrente para realizar a conciliação.</p>
                    </div>
                ) : loadingExtrato ? (
                    <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin text-blue-600 w-10 h-10" /></div>
                ) : (
                  <div className="h-full overflow-auto">
                    <ExtratosTable 
                        extratos={extratos} 
                        onConciliate={(item) => (busyExtratoId ? undefined : setConciliacaoItem(item))} 
                        onUnconciliate={handleUnconciliate}
                        busyExtratoId={busyExtratoId}
                    />
                  </div>
                )}
            </div>

            {selectedContaId && extratoCount > 0 ? (
              <ListPaginationBar sticky={false} className="mt-4" innerClassName="px-3 sm:px-4">
                <Pagination
                  currentPage={extratoPage}
                  totalCount={extratoCount}
                  pageSize={extratoPageSize}
                  onPageChange={setExtratoPage}
                  onPageSizeChange={(next) => {
                    setExtratoPage(1);
                    setExtratoPageSize(next);
                  }}
                />
              </ListPaginationBar>
            ) : null}
        </div>
      )}

      {activeTab === 'regras' && (
        <ConciliacaoRegrasPanel
          contas={contas}
          selectedContaId={selectedContaId}
          setSelectedContaId={setSelectedContaId}
        />
      )}

      {/* Modals */}
      <Modal isOpen={isContaFormOpen} onClose={() => setIsContaFormOpen(false)} title={selectedConta ? 'Editar Conta' : 'Nova Conta'}>
        <ContaCorrenteFormPanel 
            conta={selectedConta} 
            onSaveSuccess={() => { setIsContaFormOpen(false); refreshContas(); }} 
            onClose={() => setIsContaFormOpen(false)} 
        />
      </Modal>

      <Modal isOpen={isMovFormOpen} onClose={() => setIsMovFormOpen(false)} title={selectedMov ? 'Editar Movimentação' : 'Nova Movimentação'}>
        <MovimentacaoFormPanel 
            movimentacao={selectedMov} 
            contaCorrenteId={selectedContaId!}
            onSaveSuccess={() => { setIsMovFormOpen(false); refreshMov(); refreshContas(); }} 
            onClose={() => setIsMovFormOpen(false)} 
        />
      </Modal>

      <ImportarExtratoModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onImport={handleImport}
        contaCorrenteId={selectedContaId!}
        onImported={() => { refreshExtrato(); refreshMov(); refreshContas(); }}
      />

      <ConciliacaoDrawer 
        isOpen={!!conciliacaoItem} 
        onClose={() => setConciliacaoItem(null)} 
        extratoItem={conciliacaoItem}
        contaCorrenteId={selectedContaId!}
        onConciliate={handleConciliate}
      />

      <ConfirmationModal
        isOpen={!!contaToDelete}
        onClose={() => setContaToDelete(null)}
        onConfirm={handleDeleteConta}
        title="Excluir Conta"
        description={`Tem certeza que deseja excluir a conta "${contaToDelete?.nome}"?`}
        isLoading={false}
        variant="danger"
      />

      <ConfirmationModal
        isOpen={!!movToDelete}
        onClose={() => setMovToDelete(null)}
        onConfirm={handleDeleteMov}
        title="Excluir Movimentação"
        description="Tem certeza que deseja excluir esta movimentação? O saldo será recalculado."
        isLoading={false}
        variant="danger"
      />
    </div>
  );
}
