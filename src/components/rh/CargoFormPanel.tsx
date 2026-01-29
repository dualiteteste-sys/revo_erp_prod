import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Plus, Trash2, AlertTriangle } from 'lucide-react';
import {
  CargoDetails,
  CargoPayload,
  Competencia,
  CargoTreinamentoRequirement,
  Treinamento,
  listCompetencias,
  listTreinamentos,
  saveCargo,
  listCargoTreinamentos,
  upsertCargoTreinamento,
  deleteCargoTreinamento,
} from '@/services/rh';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import Select from '@/components/ui/forms/Select';
import Toggle from '@/components/ui/forms/Toggle';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { listAuditLogsForTables, type AuditLogRow } from '@/services/auditLogs';
import { useHasPermission } from '@/hooks/useHasPermission';
import ResizableSortableTh, { type SortState } from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';
import { sortRows, toggleSort } from '@/components/ui/table/sortUtils';

interface CargoFormPanelProps {
  cargo: CargoDetails | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

const CargoFormPanel: React.FC<CargoFormPanelProps> = ({ cargo, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CargoPayload>({});
  const [availableCompetencias, setAvailableCompetencias] = useState<Competencia[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'dados' | 'competencias' | 'treinamentos' | 'historico'>('dados');
  const [auditRows, setAuditRows] = useState<AuditLogRow[]>([]);
  const [treinReqSort, setTreinReqSort] = useState<SortState<string>>({ column: 'treinamento', direction: 'asc' });
  const [auditSort, setAuditSort] = useState<SortState<string>>({ column: 'quando', direction: 'desc' });
  const [availableTreinamentos, setAvailableTreinamentos] = useState<Treinamento[]>([]);
  const [treinamentosReq, setTreinamentosReq] = useState<CargoTreinamentoRequirement[]>([]);
  const [loadingTreinReq, setLoadingTreinReq] = useState(false);
  const [selectedTreinamentoId, setSelectedTreinamentoId] = useState<string>('');
  const [treinValidadeMeses, setTreinValidadeMeses] = useState<string>('');

  const treinReqColumns: TableColumnWidthDef[] = [
    { id: 'treinamento', defaultWidth: 520, minWidth: 220 },
    { id: 'validade', defaultWidth: 180, minWidth: 140 },
    { id: 'acoes', defaultWidth: 120, minWidth: 100 },
  ];
  const { widths: treinReqWidths, startResize: startTreinReqResize } = useTableColumnWidths({
    tableId: 'rh:cargo:treinamentos-requirements',
    columns: treinReqColumns,
  });
  const sortedTreinamentosReq = useMemo(() => {
    return sortRows(
      treinamentosReq,
      treinReqSort as any,
      [
        { id: 'treinamento', type: 'string', getValue: (r) => r.treinamento_nome ?? '' },
        { id: 'validade', type: 'number', getValue: (r) => r.validade_meses ?? 0 },
      ] as const
    );
  }, [treinamentosReq, treinReqSort]);

  const auditColumns: TableColumnWidthDef[] = [
    { id: 'quando', defaultWidth: 220, minWidth: 200 },
    { id: 'acao', defaultWidth: 140, minWidth: 120 },
    { id: 'tabela', defaultWidth: 220, minWidth: 160 },
    { id: 'detalhes', defaultWidth: 520, minWidth: 220 },
  ];
  const { widths: auditWidths, startResize: startAuditResize } = useTableColumnWidths({
    tableId: 'rh:cargo:audit',
    columns: auditColumns,
  });
  const sortedAuditRows = useMemo(() => {
    return sortRows(
      auditRows,
      auditSort as any,
      [
        { id: 'quando', type: 'date', getValue: (r) => r.changed_at },
        { id: 'acao', type: 'string', getValue: (r) => r.operation ?? '' },
        { id: 'tabela', type: 'string', getValue: (r) => r.table_name ?? '' },
        { id: 'detalhes', type: 'string', getValue: (r) => formatChangedFields(r) || '' },
      ] as const
    );
  }, [auditRows, auditSort]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const permCreate = useHasPermission('rh', 'create');
  const permUpdate = useHasPermission('rh', 'update');
  const permManage = useHasPermission('rh', 'manage');
  const permsLoading = permCreate.isLoading || permUpdate.isLoading || permManage.isLoading;
  const isEditing = !!cargo?.id;
  const canSave = isEditing ? permUpdate.data : permCreate.data;
  const readOnly = !permsLoading && !canSave;
  const canManage = !permsLoading && !!permManage.data;

  useEffect(() => {
    const loadCompetencias = async () => {
      try {
        const data = await listCompetencias();
        setAvailableCompetencias(data);
      } catch (error) {
        console.error(error);
      }
    };
    loadCompetencias();

    const loadTreinamentos = async () => {
      try {
        const data = await listTreinamentos(undefined, undefined);
        setAvailableTreinamentos(data);
      } catch {
        setAvailableTreinamentos([]);
      }
    };
    loadTreinamentos();

    if (cargo) {
      setFormData(cargo);
    } else {
      setFormData({ ativo: true, competencias: [] });
    }
    setActiveTab('dados');
  }, [cargo]);

  useEffect(() => {
    const fetchAudit = async () => {
      if (activeTab !== 'historico') return;
      if (!cargo?.id) {
        setAuditRows([]);
        return;
      }
      setLoadingAudit(true);
      try {
        const data = await listAuditLogsForTables(['rh_cargos', 'rh_cargo_competencias'], 300);
        setAuditRows(data.filter((r) => r.record_id === cargo.id));
      } catch (e: any) {
        addToast(e?.message || 'Erro ao carregar histórico.', 'error');
      } finally {
        setLoadingAudit(false);
      }
    };
    fetchAudit();
  }, [activeTab, cargo?.id, addToast]);

  useEffect(() => {
    const fetchReq = async () => {
      if (activeTab !== 'treinamentos') return;
      if (!cargo?.id) {
        setTreinamentosReq([]);
        return;
      }
      setLoadingTreinReq(true);
      try {
        const data = await listCargoTreinamentos(cargo.id);
        setTreinamentosReq(data);
      } catch (e: any) {
        addToast(e?.message || 'Erro ao carregar trilha de treinamentos.', 'error');
        setTreinamentosReq([]);
      } finally {
        setLoadingTreinReq(false);
      }
    };
    void fetchReq();
  }, [activeTab, cargo?.id, addToast]);

  const handleFormChange = (field: keyof CargoPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddCompetencia = () => {
    if (readOnly) {
      addToast('Você não tem permissão para editar competências do cargo.', 'warning');
      return;
    }
    if (!selectedCompId) return;
    const comp = availableCompetencias.find(c => c.id === selectedCompId);
    if (!comp) return;

    const exists = formData.competencias?.some(c => c.competencia_id === selectedCompId);
    if (exists) {
      addToast('Esta competência já foi adicionada.', 'warning');
      return;
    }

    setFormData(prev => ({
      ...prev,
      competencias: [
        ...(prev.competencias || []),
        {
          competencia_id: selectedCompId,
          nome: comp.nome,
          tipo: comp.tipo,
          nivel_requerido: 3,
          obrigatorio: true
        }
      ]
    }));
    setSelectedCompId('');
  };

  const handleRemoveCompetencia = (compId: string) => {
    if (readOnly) {
      addToast('Você não tem permissão para editar competências do cargo.', 'warning');
      return;
    }
    setFormData(prev => ({
      ...prev,
      competencias: prev.competencias?.filter(c => c.competencia_id !== compId)
    }));
  };

  const handleUpdateCompetencia = (index: number, field: string, value: any) => {
    if (readOnly) return;
    const newComps = [...(formData.competencias || [])];
    newComps[index] = { ...newComps[index], [field]: value };
    setFormData(prev => ({ ...prev, competencias: newComps }));
  };

  const handleAddTreinamentoReq = async () => {
    if (!cargo?.id) {
      addToast('Salve o cargo antes de definir a trilha de treinamentos.', 'warning');
      return;
    }
    if (!canManage) {
      addToast('Você não tem permissão para gerenciar trilhas de treinamentos.', 'warning');
      return;
    }
    if (!selectedTreinamentoId) return;
    const validade = treinValidadeMeses ? Number(treinValidadeMeses) : null;
    try {
      await upsertCargoTreinamento({
        cargoId: cargo.id,
        treinamentoId: selectedTreinamentoId,
        obrigatorio: true,
        validadeMeses: Number.isFinite(validade as number) ? (validade as number) : null,
      });
      const data = await listCargoTreinamentos(cargo.id);
      setTreinamentosReq(data);
      setSelectedTreinamentoId('');
      setTreinValidadeMeses('');
      addToast('Treinamento adicionado à trilha do cargo.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar trilha de treinamentos.', 'error');
    }
  };

  const handleRemoveTreinamentoReq = async (id: string) => {
    if (!cargo?.id) return;
    if (!canManage) {
      addToast('Você não tem permissão para gerenciar trilhas de treinamentos.', 'warning');
      return;
    }
    try {
      await deleteCargoTreinamento(id);
      const data = await listCargoTreinamentos(cargo.id);
      setTreinamentosReq(data);
      addToast('Treinamento removido da trilha.', 'success');
    } catch (e: any) {
      addToast(e?.message || 'Erro ao remover treinamento da trilha.', 'error');
    }
  };

  const handleSave = async () => {
    if (readOnly) {
      addToast('Você não tem permissão para salvar cargos.', 'warning');
      return;
    }
    if (!formData.nome) {
      addToast('O nome do cargo é obrigatório.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await saveCargo(formData);
      addToast('Cargo salvo com sucesso!', 'success');
      onSaveSuccess();
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const labelOperation = (op: AuditLogRow['operation']) => {
    if (op === 'INSERT') return 'Criado';
    if (op === 'UPDATE') return 'Atualizado';
    if (op === 'DELETE') return 'Excluído';
    return op;
  };

  const formatChangedFields = (row: AuditLogRow) => {
    if (row.operation !== 'UPDATE') return '';
    const oldData = row.old_data || {};
    const newData = row.new_data || {};
    const keys = Array.from(
      new Set([...Object.keys(oldData || {}), ...Object.keys(newData || {})].filter((k) => k !== 'updated_at' && k !== 'created_at'))
    );
    const changed = keys.filter((k) => JSON.stringify((oldData as any)[k]) !== JSON.stringify((newData as any)[k]));
    if (changed.length === 0) return '';
    const labels: Record<string, string> = {
      nome: 'Nome',
      setor: 'Setor',
      descricao: 'Descrição',
      responsabilidades: 'Responsabilidades',
      autoridades: 'Autoridades',
      ativo: 'Status',
      nivel_requerido: 'Nível requerido',
      obrigatorio: 'Obrigatório',
    };
    return changed
      .slice(0, 4)
      .map((k) => labels[k] || k)
      .join(', ');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-200 px-6">
        <nav className="-mb-px flex space-x-6">
          <Button
            onClick={() => setActiveTab('dados')}
            type="button"
            variant="ghost"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'dados' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Dados
          </Button>
          <Button
            onClick={() => setActiveTab('competencias')}
            type="button"
            variant="ghost"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'competencias' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
          >
            Competências
          </Button>
          <Button
            onClick={() => setActiveTab('treinamentos')}
            type="button"
            variant="ghost"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'treinamentos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            disabled={!cargo?.id}
          >
            Treinamentos {!cargo?.id ? '(salve primeiro)' : ''}
          </Button>
          <Button
            onClick={() => setActiveTab('historico')}
            type="button"
            variant="ghost"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'historico' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
            disabled={!cargo?.id}
          >
            Histórico {!cargo?.id ? '(salve primeiro)' : ''}
          </Button>
        </nav>
      </div>

      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {readOnly && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Você está em modo somente leitura. Solicite permissão para criar/editar cargos.
          </div>
        )}
        {activeTab === 'dados' && (
        <Section title="Dados do Cargo" description="Informações básicas e responsabilidades.">
          <Input 
            label="Nome do Cargo" 
            name="nome" 
            value={formData.nome || ''} 
            onChange={e => handleFormChange('nome', e.target.value)} 
            required 
            className="sm:col-span-4" 
            disabled={readOnly}
          />
          <Input 
            label="Setor / Departamento" 
            name="setor" 
            value={formData.setor || ''} 
            onChange={e => handleFormChange('setor', e.target.value)} 
            className="sm:col-span-2" 
            disabled={readOnly}
          />
          <div className="sm:col-span-6">
            <Toggle 
              label="Cargo Ativo" 
              name="ativo" 
              checked={formData.ativo !== false} 
              onChange={checked => handleFormChange('ativo', checked)} 
              disabled={readOnly}
            />
          </div>
          <TextArea 
            label="Descrição Sumária" 
            name="descricao" 
            value={formData.descricao || ''} 
            onChange={e => handleFormChange('descricao', e.target.value)} 
            rows={3} 
            className="sm:col-span-6" 
            disabled={readOnly}
          />
          <TextArea 
            label="Responsabilidades Principais (ISO 9001: 5.3)" 
            name="responsabilidades" 
            value={formData.responsabilidades || ''} 
            onChange={e => handleFormChange('responsabilidades', e.target.value)} 
            rows={4} 
            className="sm:col-span-6" 
            placeholder="Liste as principais responsabilidades e deveres..."
            disabled={readOnly}
          />
          <TextArea 
            label="Autoridades (ISO 9001: 5.3)" 
            name="autoridades" 
            value={formData.autoridades || ''} 
            onChange={e => handleFormChange('autoridades', e.target.value)} 
            rows={3} 
            className="sm:col-span-6" 
            placeholder="O que este cargo tem autonomia para decidir ou aprovar?"
            disabled={readOnly}
          />
        </Section>
        )}

        {activeTab === 'competencias' && (
        <Section title="Competências Requeridas" description="Defina os requisitos de competência (ISO 9001: 7.2).">
          <div className="sm:col-span-6 bg-blue-50 p-4 rounded-lg mb-4 flex gap-2 items-end">
            <Select 
              label="Adicionar Competência" 
              name="add_comp" 
              value={selectedCompId} 
              onChange={e => setSelectedCompId(e.target.value)}
              className="flex-grow"
              disabled={readOnly}
            >
              <option value="">Selecione...</option>
              {availableCompetencias.map(c => (
                <option key={c.id} value={c.id}>{c.nome} ({c.tipo})</option>
              ))}
            </Select>
            <Button onClick={handleAddCompetencia} size="icon" className="mb-[1px]" disabled={readOnly || !selectedCompId}>
              <Plus size={20} />
            </Button>
          </div>

          <div className="sm:col-span-6 space-y-3">
            <AnimatePresence>
              {formData.competencias?.map((comp, index) => (
                <motion.div 
                  key={comp.competencia_id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="bg-white border border-gray-200 p-4 rounded-lg flex flex-wrap items-center gap-4 shadow-sm"
                >
                  <div className="flex-grow min-w-[200px]">
                    <p className="font-semibold text-gray-800">{comp.nome}</p>
                    <p className="text-xs text-gray-500 capitalize">{comp.tipo}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 whitespace-nowrap">Nível (1-5):</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="5" 
                      value={comp.nivel_requerido} 
                      onChange={e => handleUpdateCompetencia(index, 'nivel_requerido', parseInt(e.target.value))}
                      className="w-16 p-1 border rounded text-center"
                      disabled={readOnly}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={comp.obrigatorio} 
                      onChange={e => handleUpdateCompetencia(index, 'obrigatorio', e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      disabled={readOnly}
                    />
                    <label className="text-sm text-gray-700">Obrigatório</label>
                  </div>

                  <button 
                    onClick={() => handleRemoveCompetencia(comp.competencia_id)}
                    className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-full"
                    disabled={readOnly}
                  >
                    <Trash2 size={18} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {(!formData.competencias || formData.competencias.length === 0) && (
              <div className="text-center text-gray-500 py-8 border-2 border-dashed border-gray-200 rounded-lg">
                <AlertTriangle className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                <p>Nenhuma competência vinculada a este cargo.</p>
              </div>
            )}
          </div>
        </Section>
        )}

        {activeTab === 'treinamentos' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="text-blue-600 mt-0.5" size={20} />
                <div>
                  <h4 className="font-semibold text-blue-900">Trilha de treinamentos (compliance)</h4>
                  <p className="text-sm text-blue-800">
                    Defina treinamentos obrigatórios para este cargo. Isso alimenta alertas de vencimento e pendências no Dashboard RH.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Treinamento</label>
                  <Select
                    value={selectedTreinamentoId}
                    onChange={(e) => setSelectedTreinamentoId(e.target.value)}
                    disabled={!cargo?.id || !canManage}
                  >
                    <option value="">Selecione…</option>
                    {availableTreinamentos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Validade (meses)</label>
                  <input
                    value={treinValidadeMeses}
                    onChange={(e) => setTreinValidadeMeses(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                    inputMode="numeric"
                    placeholder="Opcional"
                    disabled={!cargo?.id || !canManage}
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={handleAddTreinamentoReq} disabled={!cargo?.id || !canManage || !selectedTreinamentoId} className="gap-2">
                  <Plus size={16} />
                  Adicionar à trilha
                </Button>
              </div>
              {!canManage && (
                <div className="mt-3 text-xs text-amber-800">
                  Você precisa de permissão <span className="font-semibold">rh/manage</span> para alterar a trilha.
                </div>
              )}
            </div>

            {loadingTreinReq ? (
              <div className="flex justify-center items-center h-24">
                <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
              </div>
            ) : (
              <div className="overflow-hidden border border-gray-200 rounded-lg bg-white">
                <table className="min-w-full text-sm table-fixed">
                  <TableColGroup columns={treinReqColumns} widths={treinReqWidths} />
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <ResizableSortableTh
                        columnId="treinamento"
                        label="Treinamento"
                        className="text-left p-3"
                        sort={treinReqSort as any}
                        onSort={(col) => setTreinReqSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startTreinReqResize}
                      />
                      <ResizableSortableTh
                        columnId="validade"
                        label="Validade"
                        className="text-left p-3"
                        sort={treinReqSort as any}
                        onSort={(col) => setTreinReqSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startTreinReqResize}
                      />
                      <ResizableSortableTh
                        columnId="acoes"
                        label="Ações"
                        align="right"
                        className="p-3"
                        sortable={false}
                        resizable
                        onResizeStart={startTreinReqResize}
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedTreinamentosReq.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="p-3 font-medium text-gray-800">{r.treinamento_nome}</td>
                        <td className="p-3 text-gray-600">{r.validade_meses ? `${r.validade_meses} meses` : '—'}</td>
                        <td className="p-3 text-right">
                          <Button
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleRemoveTreinamentoReq(r.id)}
                            disabled={!canManage}
                            title={!canManage ? 'Sem permissão' : undefined}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {treinamentosReq.length === 0 && (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-gray-500">
                          Nenhum treinamento obrigatório definido para este cargo ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'historico' && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-sm text-gray-600">
                Alterações registradas em <span className="font-medium">Cargo</span> e <span className="font-medium">Competências requeridas</span>.
              </div>
            </div>

            {loadingAudit ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
              </div>
            ) : auditRows.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <AlertTriangle className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                <p>Nenhuma alteração registrada para este cargo.</p>
              </div>
            ) : (
              <div className="overflow-hidden border border-gray-200 rounded-lg bg-white">
                <table className="min-w-full text-sm table-fixed">
                  <TableColGroup columns={auditColumns} widths={auditWidths} />
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <ResizableSortableTh
                        columnId="quando"
                        label="Quando"
                        className="text-left p-3"
                        sort={auditSort as any}
                        onSort={(col) => setAuditSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startAuditResize}
                      />
                      <ResizableSortableTh
                        columnId="acao"
                        label="Ação"
                        className="text-left p-3"
                        sort={auditSort as any}
                        onSort={(col) => setAuditSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startAuditResize}
                      />
                      <ResizableSortableTh
                        columnId="tabela"
                        label="Tabela"
                        className="text-left p-3"
                        sort={auditSort as any}
                        onSort={(col) => setAuditSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startAuditResize}
                      />
                      <ResizableSortableTh
                        columnId="detalhes"
                        label="Detalhes"
                        className="text-left p-3"
                        sort={auditSort as any}
                        onSort={(col) => setAuditSort((prev) => toggleSort(prev as any, col))}
                        onResizeStart={startAuditResize}
                      />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedAuditRows.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="p-3 text-gray-600">{new Date(r.changed_at).toLocaleString('pt-BR')}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              r.operation === 'INSERT'
                                ? 'bg-green-100 text-green-800'
                                : r.operation === 'UPDATE'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {labelOperation(r.operation)}
                          </span>
                        </td>
                        <td className="p-3 text-gray-600">{r.table_name}</td>
                        <td className="p-3 text-gray-600">{formatChangedFields(r) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <Button type="button" onClick={onClose} variant="outline">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || permsLoading || !canSave} className="gap-2">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar Cargo
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default CargoFormPanel;
