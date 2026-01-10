import React, { useState, useEffect } from 'react';
import { getCompetencyMatrix, MatrixRow, listCargos, Cargo, listPlanosAcaoCompetencias, upsertPlanoAcaoCompetencia, type PlanoAcaoCompetencia } from '@/services/rh';
import { Loader2, Filter, AlertCircle, TrendingUp, TrendingDown, Minus, Grid } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Select from '@/components/ui/forms/Select';
import PageHeader from '@/components/ui/PageHeader';
import { useToast } from '@/contexts/ToastProvider';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import TextArea from '@/components/ui/forms/TextArea';
import { Button } from '@/components/ui/button';
import { useHasPermission } from '@/hooks/useHasPermission';
import ResizableSortableTh from '@/components/ui/table/ResizableSortableTh';
import TableColGroup from '@/components/ui/table/TableColGroup';
import { useTableColumnWidths, type TableColumnWidthDef } from '@/components/ui/table/useTableColumnWidths';

export default function MatrizCompetenciasPage() {
  const { addToast } = useToast();
  const [matrixData, setMatrixData] = useState<MatrixRow[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [selectedCargo, setSelectedCargo] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [planos, setPlanos] = useState<PlanoAcaoCompetencia[]>([]);
  const [planModal, setPlanModal] = useState<null | {
    colaborador_id: string;
    colaborador_nome: string;
    cargo_nome: string;
    competencia_id: string;
    competencia_nome: string;
    nivel_atual: number;
    nivel_requerido: number;
  }>(null);
  const [planSaving, setPlanSaving] = useState(false);
  const [planStatus, setPlanStatus] = useState<PlanoAcaoCompetencia['status']>('aberto');
  const [planPrioridade, setPlanPrioridade] = useState<number>(2);
  const [planDueDate, setPlanDueDate] = useState<string>('');
  const [planResponsavel, setPlanResponsavel] = useState<string>('');
  const [planNotas, setPlanNotas] = useState<string>('');

  const permManage = useHasPermission('rh', 'manage');
  const canManage = !permManage.isLoading && !!permManage.data;

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const data = await listCargos(undefined, true); // Only active cargos
        setCargos(data);
      } catch (e) {
        addToast((e as any)?.message || 'Erro ao carregar cargos.', 'error');
      }
    };
    loadFilters();
  }, [addToast]);

  useEffect(() => {
    const fetchMatrix = async () => {
      setLoading(true);
      try {
        const [data, plans] = await Promise.all([
          getCompetencyMatrix(selectedCargo || undefined),
          listPlanosAcaoCompetencias(selectedCargo || undefined),
        ]);
        setMatrixData(data);
        setPlanos(plans);
      } catch (error) {
        addToast((error as any)?.message || 'Erro ao carregar matriz de competências.', 'error');
      } finally {
        setLoading(false);
      }
    };
    fetchMatrix();
  }, [selectedCargo, addToast]);

  // Extract all unique competencies to build columns
  const allCompetencies = React.useMemo(() => {
    const comps = new Map<string, { id: string; nome: string; tipo: string }>();
    matrixData.forEach((row) => {
      const competencias = Array.isArray(row.competencias) ? row.competencias : [];
      competencias.forEach((c) => {
        comps.set(c.id, { id: c.id, nome: c.nome, tipo: c.tipo });
      });
    });
    return Array.from(comps.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [matrixData]);

  const planosByKey = React.useMemo(() => {
    const map = new Map<string, PlanoAcaoCompetencia>();
    for (const p of planos) {
      map.set(`${p.colaborador_id}:${p.competencia_id}`, p);
    }
    return map;
  }, [planos]);

  const matrixColumns: TableColumnWidthDef[] = React.useMemo(() => {
    return [
      { id: 'colaborador', defaultWidth: 260, minWidth: 200 },
      ...allCompetencies.map((c) => ({ id: c.id, defaultWidth: 140, minWidth: 110, maxWidth: 420 })),
    ];
  }, [allCompetencies]);

  const { widths: matrixWidths, startResize: startMatrixResize } = useTableColumnWidths({
    tableId: `rh:matriz-competencias:${selectedCargo || 'all'}`,
    columns: matrixColumns,
  });

  const renderCell = (row: MatrixRow, compId: string) => {
    const competencias = Array.isArray(row.competencias) ? row.competencias : [];
    const comp = competencias.find((c) => c.id === compId);
    
    if (!comp) {
      return <div className="h-full w-full bg-gray-50/50"></div>;
    }

    // Lógica de Cores ISO 9001 (Gap Analysis)
    let bgColor = 'bg-gray-100';
    let textColor = 'text-gray-500';
    let icon = null;

    if (comp.nivel_requerido > 0) {
        if (comp.gap >= 0) {
            bgColor = 'bg-green-100';
            textColor = 'text-green-800';
            icon = <TrendingUp size={12} />;
        } else {
            bgColor = 'bg-red-100';
            textColor = 'text-red-800';
            icon = <TrendingDown size={12} />;
        }
    } else {
        // Competência extra (não requerida, mas avaliada)
        bgColor = 'bg-blue-50';
        textColor = 'text-blue-600';
        icon = <Minus size={12} className="rotate-90" />;
    }

    const isGap = comp.nivel_requerido > 0 && comp.gap < 0;
    const planKey = `${row.colaborador_id}:${comp.id}`;
    const existingPlan = planosByKey.get(planKey);
    const planDot =
      existingPlan?.status === 'concluido'
        ? 'bg-emerald-500'
        : existingPlan?.status === 'em_andamento'
          ? 'bg-amber-500'
          : existingPlan?.status === 'cancelado'
            ? 'bg-gray-400'
            : existingPlan
              ? 'bg-red-500'
              : null;

    const content = (
      <div className={`h-full w-full p-2 flex flex-col items-center justify-center text-xs border-r border-b border-gray-100 ${bgColor} ${textColor}`}>
        <div className="font-bold text-sm flex items-center gap-1">
          {comp.nivel_atual}
          {icon}
          {planDot ? <span className={`ml-1 inline-block w-2 h-2 rounded-full ${planDot}`} title="Plano de ação" /> : null}
        </div>
        {comp.nivel_requerido > 0 && <span className="opacity-70 text-[10px]">Meta: {comp.nivel_requerido}</span>}
        {isGap && <span className="text-[10px] opacity-80 mt-0.5">Ação</span>}
      </div>
    );

    if (!isGap) return content;

    return (
      <button
        type="button"
        className="w-full h-full text-left"
        onClick={() => {
          const modal = {
            colaborador_id: row.colaborador_id,
            colaborador_nome: row.colaborador_nome,
            cargo_nome: row.cargo_nome,
            competencia_id: comp.id,
            competencia_nome: comp.nome,
            nivel_atual: comp.nivel_atual,
            nivel_requerido: comp.nivel_requerido,
          };
          setPlanModal(modal);
          const existing = planosByKey.get(`${row.colaborador_id}:${comp.id}`);
          setPlanStatus(existing?.status ?? 'aberto');
          setPlanPrioridade(existing?.prioridade ?? 2);
          setPlanDueDate(existing?.due_date ?? '');
          setPlanResponsavel(existing?.responsavel ?? '');
          setPlanNotas(existing?.notas ?? '');
        }}
        title="Abrir plano de ação"
      >
        {content}
      </button>
    );
  };

  const handleSavePlano = async () => {
    if (!planModal) return;
    if (!canManage) {
      addToast('Você não tem permissão para criar/editar planos de ação.', 'warning');
      return;
    }
    setPlanSaving(true);
    try {
      await upsertPlanoAcaoCompetencia({
        colaborador_id: planModal.colaborador_id,
        competencia_id: planModal.competencia_id,
        status: planStatus,
        prioridade: planPrioridade,
        due_date: planDueDate || null,
        responsavel: planResponsavel || null,
        notas: planNotas || null,
      });
      const plans = await listPlanosAcaoCompetencias(selectedCargo || undefined);
      setPlanos(plans);
      addToast('Plano de ação salvo.', 'success');
      setPlanModal(null);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao salvar plano de ação.', 'error');
    } finally {
      setPlanSaving(false);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col gap-6">
      <PageHeader
        title="Matriz de Competências"
        description="Análise de GAPs e conformidade ISO 9001."
        icon={<Grid className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Filter className="text-gray-400" size={18} />
            <Select
              value={selectedCargo}
              onChange={(e) => setSelectedCargo(e.target.value)}
              className="min-w-[240px]"
            >
              <option value="">Todos os Cargos</option>
              {cargos.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Select>
          </div>
        }
      />

      {loading ? (
        <div className="flex-grow flex justify-center items-center">
          <Loader2 className="animate-spin text-blue-600 w-10 h-10" />
        </div>
      ) : matrixData.length === 0 ? (
        <div className="flex-grow flex flex-col items-center justify-center text-gray-500">
          <AlertCircle size={48} className="mb-4 text-gray-300" />
          <p className="text-lg">Nenhum dado encontrado.</p>
          <p className="text-sm">Cadastre colaboradores e avalie suas competências para visualizar a matriz.</p>
        </div>
      ) : (
        <GlassCard className="flex-grow overflow-hidden flex flex-col p-0">
          <div className="overflow-auto scrollbar-styled flex-grow">
            <table className="min-w-full border-collapse table-fixed">
              <TableColGroup columns={matrixColumns} widths={matrixWidths} />
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <ResizableSortableTh
                    columnId="colaborador"
                    label="Colaborador / Cargo"
                    sortable={false}
                    onResizeStart={startMatrixResize}
                    className="p-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200 sticky left-0 bg-gray-50 z-20"
                  />
                  {allCompetencies.map((comp) => (
                    <ResizableSortableTh
                      key={comp.id}
                      columnId={comp.id}
                      label={
                        <div className="text-center">
                          <div className="line-clamp-2" title={comp.nome}>{comp.nome}</div>
                          <span className="text-[10px] text-gray-400 font-normal capitalize">{comp.tipo}</span>
                        </div>
                      }
                      sortable={false}
                      onResizeStart={startMatrixResize}
                      align="center"
                      className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-r border-gray-200"
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {matrixData.map(row => (
                  <tr key={row.colaborador_id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 whitespace-nowrap border-r border-gray-200 sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="font-semibold text-gray-800">{row.colaborador_nome}</div>
                      <div className="text-xs text-gray-500">{row.cargo_nome}</div>
                    </td>
                    {allCompetencies.map(comp => (
                      <td key={comp.id} className="p-0 h-16 align-middle">
                        {renderCell(row, comp.id)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-6 text-xs text-gray-600">
            <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-green-100 border border-green-200 rounded-sm"></span>
                <span>Atende ao Requisito</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-100 border border-red-200 rounded-sm"></span>
                <span>Gap de Competência (Treinamento Necessário)</span>
            </div>
            <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-blue-50 border border-blue-100 rounded-sm"></span>
                <span>Competência Extra (Não exigida)</span>
            </div>
          </div>
        </GlassCard>
      )}

      <Modal
        isOpen={!!planModal}
        onClose={() => setPlanModal(null)}
        title="Plano de ação (Gap de competência)"
        size="2xl"
      >
        {planModal ? (
          <div className="p-6 space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">{planModal.colaborador_nome}</div>
              <div className="text-xs text-gray-600">{planModal.cargo_nome}</div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg bg-white border border-gray-200 p-3">
                  <div className="text-[11px] text-gray-500">Competência</div>
                  <div className="text-sm font-semibold text-gray-900">{planModal.competencia_nome}</div>
                </div>
                <div className="rounded-lg bg-white border border-gray-200 p-3">
                  <div className="text-[11px] text-gray-500">Nível atual</div>
                  <div className="text-sm font-semibold text-gray-900">{planModal.nivel_atual}</div>
                </div>
                <div className="rounded-lg bg-white border border-gray-200 p-3">
                  <div className="text-[11px] text-gray-500">Meta</div>
                  <div className="text-sm font-semibold text-gray-900">{planModal.nivel_requerido}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
                <Select value={planStatus} onChange={(e) => setPlanStatus(e.target.value as any)}>
                  <option value="aberto">Aberto</option>
                  <option value="em_andamento">Em andamento</option>
                  <option value="concluido">Concluído</option>
                  <option value="cancelado">Cancelado</option>
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Prioridade</label>
                <Select value={String(planPrioridade)} onChange={(e) => setPlanPrioridade(Number(e.target.value))}>
                  <option value="1">P1 (Alta)</option>
                  <option value="2">P2 (Média)</option>
                  <option value="3">P3 (Baixa)</option>
                </Select>
              </div>
              <Input
                label="Vencimento (opcional)"
                name="due_date"
                type="date"
                value={planDueDate}
                onChange={(e) => setPlanDueDate(e.target.value)}
              />
              <Input
                label="Responsável (opcional)"
                name="responsavel"
                value={planResponsavel}
                onChange={(e) => setPlanResponsavel(e.target.value)}
                placeholder="Ex.: RH / Líder do setor"
              />
            </div>

            <TextArea
              label="Notas / Próximo passo"
              name="notas"
              value={planNotas}
              onChange={(e) => setPlanNotas(e.target.value)}
              rows={4}
              placeholder="Ex.: agendar treinamento X, realizar avaliação Y, revisar cargo…"
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPlanModal(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSavePlano} disabled={planSaving || !canManage}>
                {planSaving ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
            {!canManage && (
              <div className="text-xs text-amber-800">
                Você precisa de permissão <span className="font-semibold">rh/manage</span> para salvar este plano.
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
