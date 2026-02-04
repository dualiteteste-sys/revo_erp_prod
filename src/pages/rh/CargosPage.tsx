import React, { useMemo, useState, useEffect } from 'react';
import { listCargos, setCargoAtivo, Cargo, getCargoDetails, CargoDetails, seedCargos } from '@/services/rh';
import { Briefcase, DatabaseBackup, LayoutGrid, List, PlusCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import CargoFormPanel from '@/components/rh/CargoFormPanel';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/contexts/ToastProvider';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/forms/SearchField';
import { useConfirm } from '@/contexts/ConfirmProvider';
import CargosTable from '@/components/rh/CargosTable';
import { useHasPermission } from '@/hooks/useHasPermission';
import { isSeedEnabled } from '@/utils/seed';

export default function CargosPage() {
  const enableSeed = isSeedEnabled();
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCargo, setSelectedCargo] = useState<CargoDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativos' | 'inativos'>('ativos');

  const permCreate = useHasPermission('rh', 'create');
  const permUpdate = useHasPermission('rh', 'update');
  const permManage = useHasPermission('rh', 'manage');
  const permsLoading = permCreate.isLoading || permUpdate.isLoading || permManage.isLoading;
  const canCreate = permCreate.data;
  const canUpdate = permUpdate.data;
  const canManage = permManage.data;

  const cargosFiltered = useMemo(() => {
    if (statusFilter === 'inativos') return cargos.filter((c) => !c.ativo);
    if (statusFilter === 'ativos') return cargos.filter((c) => c.ativo);
    return cargos;
  }, [cargos, statusFilter]);

  const fetchCargos = async () => {
    setLoading(true);
    try {
      const ativoOnly = statusFilter === 'ativos';
      const data = await listCargos(debouncedSearch, ativoOnly);
      setCargos(data);
    } catch (error) {
      addToast((error as any)?.message || 'Erro ao carregar cargos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCargos();
  }, [debouncedSearch, statusFilter]);

  const handleEdit = async (id: string) => {
    setLoadingDetails(true);
    setIsFormOpen(true);
    setSelectedCargo(null);
    try {
      const details = await getCargoDetails(id);
      setSelectedCargo(details);
    } catch (error) {
      addToast((error as any)?.message || 'Erro ao carregar cargo.', 'error');
      setIsFormOpen(false);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleNew = () => {
    if (!permsLoading && !canCreate) {
      addToast('Você não tem permissão para criar cargos.', 'warning');
      return;
    }
    setSelectedCargo(null);
    setIsFormOpen(true);
  };

  const handleSaveSuccess = () => {
    setIsFormOpen(false);
    fetchCargos();
  };

  const handleToggleAtivo = async (cargo: Cargo) => {
    if (!permsLoading && !canUpdate) {
      addToast('Você não tem permissão para alterar o status de cargos.', 'warning');
      return;
    }
    const nextAtivo = !cargo.ativo;
	    const ok = await confirm({
	      title: nextAtivo ? 'Reativar cargo' : 'Inativar cargo',
	      description: nextAtivo
	        ? `Deseja reativar o cargo "${cargo.nome}"?`
	        : `Deseja inativar o cargo "${cargo.nome}"? Ele ficará indisponível para novos colaboradores.`,
	      confirmText: nextAtivo ? 'Reativar' : 'Inativar',
	      cancelText: 'Cancelar',
	      variant: nextAtivo ? 'primary' : 'danger',
	    });
    if (!ok) return;

    try {
      await setCargoAtivo(cargo.id, nextAtivo);
      addToast(nextAtivo ? 'Cargo reativado com sucesso!' : 'Cargo inativado com sucesso!', 'success');
      fetchCargos();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao alterar status do cargo.', 'error');
    }
  };

  const sortState = useState<{ column: keyof Cargo; ascending: boolean }>({ column: 'nome', ascending: true });
  const [sortBy, setSortBy] = sortState;
  const onSort = (column: keyof Cargo) => {
    setSortBy((prev) => ({ column, ascending: prev.column === column ? !prev.ascending : true }));
  };

  const cargosSorted = useMemo(() => {
    const data = [...cargosFiltered];
    const { column, ascending } = sortBy;
    data.sort((a, b) => {
      const av = (a[column] ?? '') as any;
      const bv = (b[column] ?? '') as any;
      if (typeof av === 'string' && typeof bv === 'string') return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      if (typeof av === 'boolean' && typeof bv === 'boolean') return ascending ? Number(av) - Number(bv) : Number(bv) - Number(av);
      return ascending ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return data;
  }, [cargosFiltered, sortBy]);

  const handleSeed = async () => {
    if (!permsLoading && !canManage) {
      addToast('Você não tem permissão para popular dados de exemplo.', 'warning');
      return;
    }
    setIsSeeding(true);
    try {
      await seedCargos();
      addToast('5 Cargos criados com sucesso!', 'success');
      fetchCargos();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="p-1 space-y-6">
      <PageHeader
        title="Cargos e Funções"
        description="Gestão de responsabilidades e autoridades (ISO 9001)."
        icon={<Briefcase className="w-5 h-5" />}
        actions={
          <>
            {enableSeed ? (
              <Button
                onClick={handleSeed}
                disabled={isSeeding || loading || permsLoading || !canManage}
                title={!canManage ? 'Sem permissão para popular dados' : undefined}
                variant="outline"
                className="gap-2"
              >
                {isSeeding ? <Loader2 className="animate-spin" size={16} /> : <DatabaseBackup size={16} />}
                Popular Dados
              </Button>
            ) : null}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={viewMode === 'table' ? 'default' : 'outline'}
                className="gap-2"
                onClick={() => setViewMode('table')}
              >
                <List size={16} />
                Tabela
              </Button>
              <Button
                type="button"
                variant={viewMode === 'cards' ? 'default' : 'outline'}
                className="gap-2"
                onClick={() => setViewMode('cards')}
              >
                <LayoutGrid size={16} />
                Cards
              </Button>
            </div>
            <Button
              onClick={handleNew}
              disabled={permsLoading || !canCreate}
              title={!canCreate ? 'Sem permissão para criar cargos' : undefined}
              className="gap-2"
            >
              <PlusCircle size={18} />
              Novo Cargo
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-9">
          <SearchField
            placeholder="Buscar cargos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="md:col-span-3 flex gap-2">
          <Button
            type="button"
            variant={statusFilter === 'ativos' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('ativos')}
            className="flex-1"
          >
            Ativos
          </Button>
          <Button
            type="button"
            variant={statusFilter === 'inativos' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('inativos')}
            className="flex-1"
          >
            Inativos
          </Button>
          <Button
            type="button"
            variant={statusFilter === 'todos' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('todos')}
            className="flex-1"
          >
            Todos
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center h-64 items-center">
          <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
        </div>
      ) : (
        <>
          {viewMode === 'table' ? (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <CargosTable
                cargos={cargosSorted}
                onEdit={(c) => handleEdit(c.id)}
                onToggleAtivo={handleToggleAtivo}
                sortBy={sortBy}
                onSort={onSort}
                canEdit={permsLoading ? false : true}
                canToggleAtivo={permsLoading ? false : canUpdate}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {cargosSorted.map((cargo) => (
                <GlassCard
                  key={cargo.id}
                  className={`p-6 flex flex-col justify-between hover:shadow-xl transition-shadow cursor-pointer border-l-4 ${
                    cargo.ativo ? 'border-l-blue-500' : 'border-l-gray-300'
                  }`}
                  onClick={() => handleEdit(cargo.id)}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-gray-800">{cargo.nome}</h3>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          cargo.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {cargo.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">{cargo.setor || 'Sem setor definido'}</p>
                    <p className="text-sm text-gray-600 line-clamp-3 mb-4">{cargo.descricao || 'Sem descrição.'}</p>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                      <span title="Colaboradores neste cargo">
                        <span className="font-semibold text-blue-600">{cargo.total_colaboradores || 0}</span> colabs
                      </span>
                      <span className="text-gray-300">•</span>
                      <span title="Competências requeridas">
                        <span className="font-semibold text-blue-600">{cargo.total_competencias || 0}</span> req.
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleToggleAtivo(cargo);
                      }}
                      disabled={permsLoading || !canUpdate}
                      title={!canUpdate ? 'Sem permissão para alterar status' : undefined}
                    >
                      {cargo.ativo ? 'Inativar' : 'Reativar'}
                    </button>
                  </div>
                </GlassCard>
              ))}
              {cargosSorted.length === 0 && (
                <div className="col-span-full">
                  <div className="text-center py-12 text-gray-500 bg-white border border-gray-100 rounded-2xl">
                    Nenhum cargo encontrado.
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={selectedCargo ? 'Editar Cargo' : 'Novo Cargo'}>
        {loadingDetails ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
          </div>
        ) : (
          <CargoFormPanel cargo={selectedCargo} onSaveSuccess={handleSaveSuccess} onClose={() => setIsFormOpen(false)} />
        )}
      </Modal>
    </div>
  );
}
