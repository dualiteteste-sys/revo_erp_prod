import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  listCargos,
  listColaboradores,
  setColaboradorAtivo,
  Cargo,
  Colaborador,
  getColaboradorDetails,
  ColaboradorDetails,
  seedColaboradores,
} from '@/services/rh';
import { DatabaseBackup, LayoutGrid, List, PlusCircle, Users } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import ColaboradorFormPanel from '@/components/rh/ColaboradorFormPanel';
import { Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/contexts/ToastProvider';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/ui/PageHeader';
import SearchField from '@/components/ui/forms/SearchField';
import Select from '@/components/ui/forms/Select';
import { useConfirm } from '@/contexts/ConfirmProvider';
import ColaboradoresTable from '@/components/rh/ColaboradoresTable';
import { useHasPermission } from '@/hooks/useHasPermission';
import { isSeedEnabled } from '@/utils/seed';
import { useSearchParams } from 'react-router-dom';
import { useEditLock } from '@/components/ui/hooks/useEditLock';
import { useAuth } from '@/contexts/AuthProvider';

export default function ColaboradoresPage() {
  const enableSeed = isSeedEnabled();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('open');
  const editLock = useEditLock('rh:colaboradores');
  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const effectiveLoading = empresaChanged;
  const effectiveColaboradores = empresaChanged ? [] : colaboradores;
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedColaborador, setSelectedColaborador] = useState<ColaboradorDetails | null>(null);
  const [editingColaboradorId, setEditingColaboradorId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'ativos' | 'inativos'>('ativos');
  const [cargoFilter, setCargoFilter] = useState<string>('');
  const [cargos, setCargos] = useState<Cargo[]>([]);

  const permCreate = useHasPermission('rh', 'create');
  const permUpdate = useHasPermission('rh', 'update');
  const permManage = useHasPermission('rh', 'manage');
  const permsLoading = permCreate.isLoading || permUpdate.isLoading || permManage.isLoading;
  const canCreate = permCreate.data;
  const canUpdate = permUpdate.data;
  const canManage = permManage.data;

  const colaboradoresFiltered = useMemo(() => {
    if (statusFilter === 'inativos') return effectiveColaboradores.filter((c) => !c.ativo);
    if (statusFilter === 'ativos') return effectiveColaboradores.filter((c) => c.ativo);
    return effectiveColaboradores;
  }, [effectiveColaboradores, statusFilter]);

  const fetchColaboradores = async () => {
    if (!activeEmpresaId || empresaChanged) return;
    setLoading(true);
    try {
      const ativoOnly = statusFilter === 'ativos';
      const data = await listColaboradores(debouncedSearch, cargoFilter || undefined, ativoOnly);
      setColaboradores(data);
    } catch (error) {
      addToast((error as any)?.message || 'Erro ao carregar colaboradores.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!activeEmpresaId || empresaChanged) return;
    fetchColaboradores();
  }, [activeEmpresaId, empresaChanged, debouncedSearch, cargoFilter, statusFilter]);

  const clearOpenParam = useCallback(() => {
    if (!openId) return;
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [openId, searchParams, setSearchParams]);

  const closeForm = useCallback(() => {
    setIsFormOpen(false);
    clearOpenParam();
    editLock.release();
    setEditingColaboradorId(null);
  }, [clearOpenParam, editLock]);

  useEffect(() => {
    const loadCargos = async () => {
      if (!activeEmpresaId || empresaChanged) {
        setCargos([]);
        return;
      }
      try {
        const data = await listCargos(undefined, true);
        setCargos(data);
      } catch {
        setCargos([]);
      }
    };
    loadCargos();
  }, [activeEmpresaId, empresaChanged]);

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;

    // Multi-tenant safety: evitar reaproveitar estado do tenant anterior.
    editLock.release();
    setColaboradores([]);
    setCargos([]);
    setLoadingDetails(false);
    setSelectedColaborador(null);
    setEditingColaboradorId(null);
    setIsFormOpen(false);
    setIsSeeding(false);

    if (openId) {
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      setSearchParams(next, { replace: true });
    }

    if (prevEmpresaId && activeEmpresaId) {
      addToast('Empresa alterada. Recarregando colaboradores…', 'info');
    }

    setLoading(!!activeEmpresaId);
    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId, addToast, editLock, openId, searchParams, setSearchParams]);

  const handleEdit = useCallback(async (id: string) => {
    const claimed = await editLock.claim(id, {
      confirmConflict: async () =>
        confirm({
          title: 'Este colaborador já está aberto em outra aba',
          description: 'Para evitar edição concorrente, abra em apenas uma aba. Deseja abrir mesmo assim nesta aba?',
          confirmText: 'Abrir mesmo assim',
          cancelText: 'Cancelar',
          variant: 'danger',
        }),
    });
    if (!claimed) {
      clearOpenParam();
      return;
    }

    setLoadingDetails(true);
    setIsFormOpen(true);
    setSelectedColaborador(null);
    setEditingColaboradorId(id);
    try {
      const details = await getColaboradorDetails(id);
      setSelectedColaborador(details);
    } catch (error) {
      addToast((error as any)?.message || 'Erro ao carregar colaborador.', 'error');
      closeForm();
    } finally {
      setLoadingDetails(false);
    }
  }, [addToast, clearOpenParam, closeForm, confirm, editLock]);

  useEffect(() => {
    if (!openId) return;
    if (!activeEmpresaId || empresaChanged) return;
    if (isFormOpen) return;
    void handleEdit(openId);
  }, [activeEmpresaId, empresaChanged, handleEdit, isFormOpen, openId]);

  const handleNew = () => {
    if (!permsLoading && !canCreate) {
      addToast('Você não tem permissão para criar colaboradores.', 'warning');
      return;
    }
    setSelectedColaborador(null);
    setIsFormOpen(true);
  };

  const handleSaveSuccess = () => {
    closeForm();
    fetchColaboradores();
  };

  const handleToggleAtivo = async (colab: Colaborador) => {
    if (!permsLoading && !canUpdate) {
      addToast('Você não tem permissão para alterar o status de colaboradores.', 'warning');
      return;
    }
    const nextAtivo = !colab.ativo;
	    const ok = await confirm({
	      title: nextAtivo ? 'Reativar colaborador' : 'Inativar colaborador',
	      description: nextAtivo
	        ? `Deseja reativar ${colab.nome}?`
	        : `Deseja inativar ${colab.nome}? Ele não aparecerá como ativo em seleções e indicadores.`,
	      confirmText: nextAtivo ? 'Reativar' : 'Inativar',
	      cancelText: 'Cancelar',
	      variant: nextAtivo ? 'primary' : 'danger',
	    });
    if (!ok) return;

    try {
      await setColaboradorAtivo(colab.id, nextAtivo);
      addToast(nextAtivo ? 'Colaborador reativado com sucesso!' : 'Colaborador inativado com sucesso!', 'success');
      fetchColaboradores();
    } catch (e: any) {
      addToast(e?.message || 'Erro ao alterar status do colaborador.', 'error');
    }
  };

  const sortState = useState<{ column: keyof Colaborador; ascending: boolean }>({ column: 'nome', ascending: true });
  const [sortBy, setSortBy] = sortState;

  const colaboradoresSorted = useMemo(() => {
    const data = [...colaboradoresFiltered];
    const { column, ascending } = sortBy;
    data.sort((a, b) => {
      const av = (a[column] ?? '') as any;
      const bv = (b[column] ?? '') as any;
      if (typeof av === 'string' && typeof bv === 'string') return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      if (typeof av === 'boolean' && typeof bv === 'boolean') return ascending ? Number(av) - Number(bv) : Number(bv) - Number(av);
      return ascending ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return data;
  }, [colaboradoresFiltered, sortBy]);

  if (authLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!activeEmpresaId) return <div className="p-12 text-center text-gray-600">Selecione uma empresa para ver os colaboradores.</div>;
  if (effectiveLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin text-blue-600" /></div>;

  const onSort = (column: keyof Colaborador) => {
    setSortBy((prev) => ({ column, ascending: prev.column === column ? !prev.ascending : true }));
  };

  const handleSeed = async () => {
    if (!permsLoading && !canManage) {
      addToast('Você não tem permissão para popular dados de exemplo.', 'warning');
      return;
    }
    setIsSeeding(true);
    try {
      await seedColaboradores();
      addToast('5 Colaboradores criados com sucesso!', 'success');
      fetchColaboradores();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="p-1 space-y-6">
      <PageHeader
        title="Colaboradores"
        description="Gestão de pessoas, cargos, competências e treinamentos."
        icon={<Users className="w-5 h-5" />}
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
              title={!canCreate ? 'Sem permissão para criar colaboradores' : undefined}
              className="gap-2"
            >
              <PlusCircle size={18} />
              Novo Colaborador
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-5">
          <SearchField
            placeholder="Buscar por nome, e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="md:col-span-4">
          <Select
            label="Cargo (filtro)"
            name="cargo_filter"
            value={cargoFilter}
            onChange={(e) => setCargoFilter(e.target.value)}
          >
            <option value="">Todos</option>
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
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
              <ColaboradoresTable
                colaboradores={colaboradoresSorted}
                onEdit={(c) => handleEdit(c.id)}
                onToggleAtivo={handleToggleAtivo}
                sortBy={sortBy}
                onSort={onSort}
                canEdit={!permsLoading}
                canToggleAtivo={!permsLoading && canUpdate}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {colaboradoresSorted.map((colab) => (
                <GlassCard
                  key={colab.id}
                  className={`p-6 flex flex-col justify-between hover:shadow-xl transition-shadow cursor-pointer border-l-4 ${
                    colab.ativo ? 'border-l-green-500' : 'border-l-gray-300'
                  }`}
                  onClick={() => handleEdit(colab.id)}
                >
                  <div>
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
                          {colab.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-bold text-gray-800">{colab.nome}</h3>
                          <p className="text-xs text-gray-500">{colab.email || 'Sem e-mail'}</p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          colab.ativo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {colab.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="text-gray-400 text-xs">Cargo:</span>
                        <span>{colab.cargo_nome || 'Sem cargo definido'}</span>
                      </div>
                      {colab.data_admissao && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="text-gray-400 text-xs">Admissão:</span>
                          <span>{new Date(colab.data_admissao).toLocaleDateString('pt-BR')}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-sm text-gray-500">
                    <div className="flex items-center gap-1" title="Competências avaliadas">
                      <span className="font-semibold text-blue-600">{colab.total_competencias_avaliadas || 0}</span>
                      <span>avaliações</span>
                    </div>
                    <button
                      type="button"
                      className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleToggleAtivo(colab);
                      }}
                      disabled={permsLoading || !canUpdate}
                      title={!canUpdate ? 'Sem permissão para alterar status' : undefined}
                    >
                      {colab.ativo ? 'Inativar' : 'Reativar'}
                    </button>
                  </div>
                </GlassCard>
              ))}
              {colaboradoresSorted.length === 0 && (
                <div className="col-span-full">
                  <div className="text-center py-12 text-gray-500 bg-white border border-gray-100 rounded-2xl">
                    Nenhum colaborador encontrado.
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal isOpen={isFormOpen} onClose={closeForm} title={selectedColaborador ? 'Editar Colaborador' : 'Novo Colaborador'}>
        {loadingDetails ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
          </div>
        ) : (
          <ColaboradorFormPanel colaborador={selectedColaborador} onSaveSuccess={handleSaveSuccess} onClose={closeForm} />
        )}
      </Modal>
    </div>
  );
}
