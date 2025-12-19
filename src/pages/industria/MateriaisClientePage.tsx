import React, { useState, useEffect } from 'react';
import { listMateriaisCliente, MaterialClienteListItem, seedMateriaisCliente, deleteMaterialCliente } from '@/services/industriaMateriais';
import { PlusCircle, Search, DatabaseBackup, Package, FileUp } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/forms/Select';
import MateriaisTable from '@/components/industria/materiais/MateriaisTable';
import MaterialFormPanel from '@/components/industria/materiais/MaterialFormPanel';
import { useToast } from '@/contexts/ToastProvider';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Pagination from '@/components/ui/Pagination';
import ImportarXmlSuprimentosModal from '@/components/industria/materiais/ImportarXmlSuprimentosModal';
import { listRecebimentos, setRecebimentoClassificacao, Recebimento } from '@/services/recebimento';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import { useNavigate } from 'react-router-dom';

export default function MateriaisClientePage() {
  const [materiais, setMateriais] = useState<MaterialClienteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('true');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();
  
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const navigate = useNavigate();
  const [isClassificarOpen, setIsClassificarOpen] = useState(false);
  const [recebimentosPendentes, setRecebimentosPendentes] = useState<Recebimento[]>([]);
  const [loadingRecebimentos, setLoadingRecebimentos] = useState(false);
  const [recebimentoSelecionadoId, setRecebimentoSelecionadoId] = useState<string>('');
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string | null>(null);
  const [classificando, setClassificando] = useState(false);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<MaterialClienteListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchMateriais = async () => {
    setLoading(true);
    try {
      const active = activeFilter === 'all' ? undefined : activeFilter === 'true';
      const { data, count } = await listMateriaisCliente(debouncedSearch, undefined, active, page, pageSize);
      setMateriais(data);
      setTotalCount(count);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMateriais();
  }, [debouncedSearch, activeFilter, page]);

  const handleNew = () => {
    setSelectedId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (item: MaterialClienteListItem) => {
    setSelectedId(item.id);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setSelectedId(null);
  };

  const handleSuccess = () => {
    fetchMateriais();
    if (!selectedId) handleClose();
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedMateriaisCliente();
      addToast('5 Materiais criados com sucesso!', 'success');
      fetchMateriais();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const openClassificar = async () => {
    setIsClassificarOpen(true);
    setLoadingRecebimentos(true);
    try {
      const all = await listRecebimentos();
      const pendentes = all.filter(r => r.status !== 'concluido' && r.status !== 'cancelado');
      setRecebimentosPendentes(pendentes);
      if (pendentes.length === 1) setRecebimentoSelecionadoId(pendentes[0].id);
    } catch (e: any) {
      console.error(e);
      addToast(e.message || 'Erro ao carregar recebimentos.', 'error');
    } finally {
      setLoadingRecebimentos(false);
    }
  };

  const handleConfirmClassificar = async () => {
    if (!recebimentoSelecionadoId) {
      addToast('Selecione um recebimento.', 'warning');
      return;
    }
    if (!clienteSelecionadoId) {
      addToast('Selecione o cliente/dono do material.', 'warning');
      return;
    }
    setClassificando(true);
    try {
      await setRecebimentoClassificacao(recebimentoSelecionadoId, 'material_cliente', clienteSelecionadoId);
      addToast('Recebimento classificado como Material do Cliente.', 'success');
      setIsClassificarOpen(false);
      navigate(`/app/suprimentos/recebimento/${recebimentoSelecionadoId}`);
    } catch (e: any) {
      console.error(e);
      addToast(e.message || 'Erro ao classificar recebimento.', 'error');
    } finally {
      setClassificando(false);
    }
  };

  const handleDeleteClick = (item: MaterialClienteListItem) => {
    setItemToDelete(item);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await deleteMaterialCliente(itemToDelete.id);
      addToast('Material removido com sucesso.', 'success');
      fetchMateriais();
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <Package className="text-blue-600" /> Materiais de Clientes
          </h1>
          <p className="text-gray-600 text-sm mt-1">Cadastro de itens de terceiros para beneficiamento.</p>
        </div>
        <div className="flex items-center gap-2">
            <button
              onClick={() => setIsImportOpen(true)}
              disabled={loading}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              title="Importar itens de terceiros a partir de um XML de NF-e"
            >
              <FileUp size={20} />
              Importar XML (NF-e)
            </button>
            <button
              onClick={openClassificar}
              disabled={loading}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              title="Marcar um recebimento como Material do Cliente (terceiros) antes de concluir"
            >
              <FileUp size={20} />
              Classificar Recebimento
            </button>
            <button
              onClick={handleSeed}
              disabled={isSeeding || loading}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {isSeeding ? <Loader2 className="animate-spin" size={20} /> : <DatabaseBackup size={20} />}
              Popular Dados
            </button>
            <button
              onClick={handleNew}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusCircle size={20} />
              Novo Material
            </button>
        </div>
      </div>

      <div className="mb-6 flex gap-4 flex-shrink-0">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por cliente, produto ou código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <Select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          className="min-w-[200px]"
        >
          <option value="all">Todos</option>
          <option value="true">Ativos</option>
          <option value="false">Inativos</option>
        </Select>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden flex-grow overflow-y-auto flex flex-col">
        {loading ? (
          <div className="flex justify-center h-64 items-center">
            <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
          </div>
        ) : (
          <>
            <div className="flex-grow">
                <MateriaisTable materiais={materiais} onEdit={handleEdit} onDelete={handleDeleteClick} />
            </div>
            {totalCount > pageSize && (
                <div className="border-t p-2">
                    <Pagination 
                        currentPage={page} 
                        totalCount={totalCount} 
                        pageSize={pageSize} 
                        onPageChange={setPage} 
                    />
                </div>
            )}
          </>
        )}
      </div>

      <Modal isOpen={isFormOpen} onClose={handleClose} title={selectedId ? 'Editar Material' : 'Novo Material'} size="lg">
        <MaterialFormPanel materialId={selectedId} onSaveSuccess={handleSuccess} onClose={handleClose} />
      </Modal>

      <ImportarXmlSuprimentosModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onFinished={() => {
          fetchMateriais();
        }}
      />

      <Modal isOpen={isClassificarOpen} onClose={() => setIsClassificarOpen(false)} title="Classificar recebimento como Material do Cliente" size="md">
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            Escolha um recebimento (XML) e informe o cliente/dono do material. Depois disso, você pode finalizar a conferência e o sistema criará/atualizará os Materiais de Clientes automaticamente.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Recebimento</label>
            <Select
              value={recebimentoSelecionadoId}
              onChange={(e) => setRecebimentoSelecionadoId(e.target.value)}
              className="w-full"
              disabled={loadingRecebimentos}
            >
              <option value="">{loadingRecebimentos ? 'Carregando...' : 'Selecione...'}</option>
              {recebimentosPendentes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.fiscal_nfe_imports?.numero ? `NF ${r.fiscal_nfe_imports.numero}/${r.fiscal_nfe_imports.serie}` : 'NF'} - {r.fiscal_nfe_imports?.emitente_nome || 'Emitente'} ({r.status})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente (dono do material)</label>
            <ClientAutocomplete value={clienteSelecionadoId} onChange={(id) => setClienteSelecionadoId(id)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsClassificarOpen(false)}
              className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmClassificar}
              disabled={classificando}
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {classificando ? <Loader2 className="animate-spin" size={18} /> : null}
              Confirmar
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Excluir Material"
        description={`Tem certeza que deseja excluir o material "${itemToDelete?.nome_cliente || itemToDelete?.codigo_cliente}"?`}
        confirmText="Sim, Excluir"
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  );
}
