import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  ContaAReceber,
  ContaAReceberRecebimento,
  estornarContaAReceberRecebimento,
  getContaAReceberDetails,
  listContaAReceberRecebimentos,
  saveContaAReceber,
} from '@/services/contasAReceber';
import { getPartnerDetails } from '@/services/partners';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import { useNumericField } from '@/hooks/useNumericField';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import CentroDeCustoDropdown from '@/components/common/CentroDeCustoDropdown';
import { Switch } from '@/components/ui/switch';
import RecorrenciaApplyScopeDialog from '@/components/financeiro/recorrencias/RecorrenciaApplyScopeDialog';
import ParcelamentoDialog from '@/components/financeiro/parcelamento/ParcelamentoDialog';
import EstornoRecebimentoModal from '@/components/financeiro/common/EstornoRecebimentoModal';
import {
  applyRecorrenciaUpdate,
  generateRecorrencia,
  upsertRecorrencia,
  type FinanceiroRecorrenciaAjusteDiaUtil,
  type FinanceiroRecorrenciaApplyScope,
  type FinanceiroRecorrenciaFrequencia,
} from '@/services/financeiroRecorrencias';
import { createParcelamentoContasAReceber } from '@/services/financeiroParcelamento';
import { useAuth } from '@/contexts/AuthProvider';

interface ContasAReceberFormPanelProps {
  conta: Partial<ContaAReceber> | null;
  onSaveSuccess: (savedConta?: ContaAReceber) => void;
  onMutate?: () => void;
  onClose: () => void;
}

const statusOptions = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'cancelado', label: 'Cancelado' },
];

const ContasAReceberFormPanel: React.FC<ContasAReceberFormPanelProps> = ({ conta, onSaveSuccess, onMutate, onClose }) => {
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<ContaAReceber>>({});
  const [clienteName, setClienteName] = useState('');
  const isPagoOuParcial = formData.status === 'pago' || formData.status === 'parcial';
  const isEditing = !!conta?.id;

  const [recebimentos, setRecebimentos] = useState<ContaAReceberRecebimento[]>([]);
  const [isLoadingRecebimentos, setIsLoadingRecebimentos] = useState(false);
  const [isEstornoRecebimentoOpen, setIsEstornoRecebimentoOpen] = useState(false);
  const [recebimentoToReverse, setRecebimentoToReverse] = useState<ContaAReceberRecebimento | null>(null);

  const [recApplyOpen, setRecApplyOpen] = useState(false);
  const [recApplyScope, setRecApplyScope] = useState<FinanceiroRecorrenciaApplyScope>('single');

  const [isRecorrente, setIsRecorrente] = useState(false);
  const [frequencia, setFrequencia] = useState<FinanceiroRecorrenciaFrequencia>('mensal');
  const [ajusteDiaUtil, setAjusteDiaUtil] = useState<FinanceiroRecorrenciaAjusteDiaUtil>('proximo_dia_util');
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState<string>('');
  const [gerarN, setGerarN] = useState<number>(12);

  const [isParcelado, setIsParcelado] = useState(false);
  const [parcelarCondicao, setParcelarCondicao] = useState<string>('1x');
  const [parcelarOpen, setParcelarOpen] = useState(false);
  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const actionTokenRef = useRef(0);
  const isStaleAction = useCallback(
    (token: number, empresaSnapshot: string | null) =>
      token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current,
    []
  );

  const valorProps = useNumericField(formData.valor, (value) => handleFormChange('valor', value));

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;
    actionTokenRef.current += 1;
    setIsSaving(false);
    setIsLoadingRecebimentos(false);
    setRecebimentos([]);
    setParcelarOpen(false);
    setRecApplyOpen(false);
    setIsEstornoRecebimentoOpen(false);
    setRecebimentoToReverse(null);
    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

  useEffect(() => {
    if (authLoading || !activeEmpresaId || empresaChanged) return;
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    if (conta) {
      setFormData(conta);
      if (conta.cliente_id) {
        getPartnerDetails(conta.cliente_id)
          .then((partner) => {
            if (isStaleAction(token, empresaSnapshot)) return;
            if (partner) setClienteName(partner.nome);
          })
          .catch(() => {
            if (isStaleAction(token, empresaSnapshot)) return;
            setClienteName('');
          });
      } else {
        setClienteName('');
      }
      setIsRecorrente(false);
    } else {
      setFormData({ status: 'pendente', valor: 0 });
      setClienteName('');
      setIsRecorrente(false);
      setFrequencia('mensal');
      setAjusteDiaUtil('proximo_dia_util');
      setHasEndDate(false);
      setEndDate('');
      setGerarN(12);
      setIsParcelado(false);
      setParcelarCondicao('1x');
    }
  }, [activeEmpresaId, authLoading, conta, empresaChanged, isStaleAction]);

  useEffect(() => {
    const contaId = String(conta?.id || '');
    if (authLoading || !activeEmpresaId || empresaChanged || !contaId) {
      setRecebimentos([]);
      setIsLoadingRecebimentos(false);
      return;
    }

    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    let cancelled = false;
    void (async () => {
      setIsLoadingRecebimentos(true);
      try {
        const list = await listContaAReceberRecebimentos(contaId);
        if (!cancelled && !isStaleAction(token, empresaSnapshot)) setRecebimentos(list);
      } catch (e: any) {
        if (!cancelled && !isStaleAction(token, empresaSnapshot)) addToast(e?.message || 'Erro ao carregar recebimentos.', 'error');
      } finally {
        if (!cancelled && !isStaleAction(token, empresaSnapshot)) setIsLoadingRecebimentos(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeEmpresaId, addToast, authLoading, conta?.id, empresaChanged, isStaleAction]);

  const handleFormChange = (field: keyof ContaAReceber | 'centro_de_custo_id', value: any) => {
    setFormData((prev: Partial<ContaAReceber>) => ({ ...(prev as any), [field]: value } as any));
  };

  const isGeradaPorRecorrencia = (() => {
    const origemTipo = (formData as any)?.origem_tipo ?? (conta as any)?.origem_tipo ?? null;
    const origemId = (formData as any)?.origem_id ?? (conta as any)?.origem_id ?? null;
    return isEditing && origemTipo === 'RECORRENCIA' && !!origemId;
  })();

  const buildRecorrenciaPatch = () => {
    const base: any = conta ?? {};
    const patch: Record<string, any> = {};
    const keys: Array<keyof any> = ['descricao', 'observacoes', 'centro_de_custo_id', 'cliente_id', 'valor', 'data_vencimento'];
    for (const k of keys) {
      const next = (formData as any)?.[k];
      const prev = (base as any)?.[k];
      const normNext = next ?? null;
      const normPrev = prev ?? null;
      const changed =
        k === 'valor' ? Number(normNext ?? 0) !== Number(normPrev ?? 0) : String(normNext) !== String(normPrev);
      if (changed) patch[String(k)] = normNext;
    }
    return patch;
  };

  const shouldAskRecorrenciaScope = () => {
    if (!isGeradaPorRecorrencia) return false;
    const patch = buildRecorrenciaPatch();
    const propagatableKeys = ['descricao', 'observacoes', 'centro_de_custo_id', 'cliente_id', 'valor'];
    return propagatableKeys.some((k) => k in patch);
  };

  const applyRecorrencia = async (scope: FinanceiroRecorrenciaApplyScope) => {
    const ocorrenciaId = String((formData as any)?.origem_id ?? (conta as any)?.origem_id ?? '');
    if (!ocorrenciaId) {
      addToast('Não foi possível identificar a recorrência desta conta.', 'error');
      return;
    }

    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    const patch = buildRecorrenciaPatch();
    setIsSaving(true);
    try {
      const result = await applyRecorrenciaUpdate({
        ocorrenciaId,
        scope,
        patch,
      });

      if (isStaleAction(token, empresaSnapshot)) return;
      if (!result?.ok) {
        addToast('Não foi possível aplicar a alteração na recorrência.', 'error');
        return;
      }

      const msg =
        scope === 'single'
          ? 'Conta recorrente atualizada.'
          : `Recorrência atualizada. Contas afetadas: ${result.updated_accounts ?? 0}.`;
      addToast(msg, 'success');

      const refreshed = await getContaAReceberDetails(String(conta?.id));
      if (isStaleAction(token, empresaSnapshot)) return;
      onSaveSuccess(refreshed);
    } catch (e: any) {
      if (isStaleAction(token, empresaSnapshot)) return;
      addToast(e?.message || 'Erro ao aplicar alteração na recorrência.', 'error');
    } finally {
      if (isStaleAction(token, empresaSnapshot)) return;
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (authLoading || !activeEmpresaId || empresaChanged) {
      addToast('Aguarde a troca de empresa concluir para salvar.', 'info');
      return;
    }
    if (!formData.descricao || !formData.data_vencimento || !formData.valor) {
      addToast('Descrição, Data de Vencimento e Valor são obrigatórios.', 'error');
      return;
    }

    try {
      const token = ++actionTokenRef.current;
      const empresaSnapshot = activeEmpresaId;
      if (!isEditing && !isRecorrente && isParcelado) {
        if (!formData.cliente_id) {
          addToast('Cliente é obrigatório para parcelar.', 'error');
          return;
        }
        if (isStaleAction(token, empresaSnapshot)) return;
        setParcelarOpen(true);
        return;
      }

      if (!isEditing && isRecorrente) {
        setIsSaving(true);
        if (!formData.cliente_id) {
          addToast('Cliente é obrigatório para recorrência.', 'error');
          return;
        }

        const startDate = String(formData.data_vencimento).slice(0, 10);
        const payload = {
          tipo: 'receber',
          ativo: true,
          frequencia,
          ajuste_dia_util: ajusteDiaUtil,
          start_date: startDate,
          end_date: hasEndDate ? (endDate || null) : null,
          descricao: formData.descricao,
          observacoes: (formData as any).observacoes ?? null,
          centro_de_custo_id: (formData as any).centro_de_custo_id ?? null,
          cliente_id: formData.cliente_id,
          valor: formData.valor,
        };

        const rec = await upsertRecorrencia(payload);
        if (isStaleAction(token, empresaSnapshot)) return;
        const gen = await generateRecorrencia({
          recorrenciaId: rec.id,
          until: hasEndDate ? (endDate || null) : null,
          max: Math.max(1, Math.min(240, Number(gerarN) || 12)),
        });

        if (isStaleAction(token, empresaSnapshot)) return;
        addToast(`Recorrência criada. Contas geradas: ${gen.contas_geradas ?? 0}.`, 'success');
        onSaveSuccess();
        return;
      }

      if (shouldAskRecorrenciaScope()) {
        setRecApplyScope('single');
        setRecApplyOpen(true);
        return;
      }

      setIsSaving(true);
      const savedConta = await saveContaAReceber(formData);
      if (isStaleAction(token, empresaSnapshot)) return;
      addToast('Conta a receber salva com sucesso!', 'success');
      onSaveSuccess(savedConta);
    } catch (error: any) {
      if (activeEmpresaId !== lastEmpresaIdRef.current) return;
      addToast(error.message, 'error');
    } finally {
      if (activeEmpresaId !== lastEmpresaIdRef.current) return;
      setIsSaving(false);
    }
  };

  const handleParcelamentoConfirm = useCallback(async ({ condicao, baseDateISO }: { condicao: string; baseDateISO: string }) => {
    const clienteId = String(formData.cliente_id || '');
    if (!clienteId) throw new Error('Cliente é obrigatório para parcelar.');

    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    const res = await createParcelamentoContasAReceber({
      clienteId,
      descricao: String(formData.descricao || ''),
      total: Number(formData.valor || 0),
      condicao,
      baseDateISO,
      centroDeCustoId: ((formData as any).centro_de_custo_id ?? null) as any,
      observacoes: ((formData as any).observacoes ?? null) as any,
    });
    if (isStaleAction(token, empresaSnapshot)) return;
    if (!res?.ok) throw new Error('Não foi possível gerar as parcelas.');
    addToast(`Parcelamento gerado: ${res.count ?? 0} título(s).`, 'success');
    onSaveSuccess();
    onClose();
  }, [activeEmpresaId, addToast, formData, isStaleAction, onClose, onSaveSuccess]);

  const handleEstornoConfirm = useCallback(async ({ contaCorrenteId, dataISO, motivo }: { contaCorrenteId: string | null; dataISO: string; motivo: string }) => {
    if (!recebimentoToReverse?.id) return;
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setIsSaving(true);
    try {
      const updated = await estornarContaAReceberRecebimento({
        recebimentoId: recebimentoToReverse.id,
        dataEstorno: dataISO,
        contaCorrenteId,
        motivo,
      });
      if (isStaleAction(token, empresaSnapshot)) return;
      addToast('Estorno registrado com sucesso!', 'success');

      const nextContaId = String((updated as any)?.id ?? conta?.id ?? '');
      if (nextContaId) {
        const list = await listContaAReceberRecebimentos(nextContaId);
        if (isStaleAction(token, empresaSnapshot)) return;
        setRecebimentos(list);
      }
      setFormData((prev) => ({ ...prev, ...updated }));
      onMutate?.();

      setIsEstornoRecebimentoOpen(false);
      setRecebimentoToReverse(null);
    } catch (e: any) {
      if (isStaleAction(token, empresaSnapshot)) return;
      addToast(e?.message || 'Erro ao estornar recebimento.', 'error');
      throw e;
    } finally {
      if (isStaleAction(token, empresaSnapshot)) return;
      setIsSaving(false);
    }
  }, [activeEmpresaId, addToast, conta?.id, isStaleAction, onMutate, recebimentoToReverse?.id]);

  return (
    <div className="flex flex-col h-full">
      <ParcelamentoDialog
        open={parcelarOpen}
        onClose={() => setParcelarOpen(false)}
        title="Parcelar conta a receber"
        total={Number(formData.valor || 0)}
        defaultCondicao={parcelarCondicao}
        defaultBaseDateISO={String(formData.data_vencimento || '').slice(0, 10) || new Date().toISOString().slice(0, 10)}
        confirmText="Gerar parcelas"
        onConfirm={handleParcelamentoConfirm}
      />
      <RecorrenciaApplyScopeDialog
        open={recApplyOpen}
        onOpenChange={setRecApplyOpen}
        scope={recApplyScope}
        onScopeChange={setRecApplyScope}
        isLoading={isSaving}
        onConfirm={async () => {
          setRecApplyOpen(false);
          await applyRecorrencia(recApplyScope);
        }}
      />
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Dados da Conta" description="Informações principais da conta a receber.">
          <Input label="Descrição" name="descricao" value={formData.descricao || ''} onChange={e => handleFormChange('descricao', e.target.value)} required className="sm:col-span-6" />
          <div className="sm:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <ClientAutocomplete
              value={formData.cliente_id || null}
              initialName={clienteName}
              onChange={(id, name) => {
                handleFormChange('cliente_id', id);
                if (name) setClienteName(name);
              }}
              placeholder="Buscar cliente..."
            />
          </div>

          {!isEditing ? (
            <div className="sm:col-span-3 flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white/60 px-4 py-3 mt-7">
              <div>
                <div className="text-sm font-medium text-gray-800">Parcelar</div>
                <div className="text-xs text-gray-500">Gera múltiplos títulos a partir deste valor.</div>
              </div>
              <Switch checked={isParcelado} onCheckedChange={setIsParcelado} disabled={isRecorrente || isSaving} />
            </div>
          ) : null}

          {!isEditing && isParcelado ? (
            <Input
              label="Condição (parcelas)"
              name="parcelar_condicao"
              value={parcelarCondicao}
              onChange={(e) => setParcelarCondicao(e.target.value)}
              className="sm:col-span-3"
              placeholder="Ex: 30/60/90 ou 3x"
              helperText="Você poderá revisar o preview antes de gerar."
              disabled={isRecorrente || isSaving}
            />
          ) : null}

          <Input label="Valor" name="valor" startAdornment="R$" inputMode="numeric" {...valorProps} required className="sm:col-span-3" />
          <Input label="Data de Vencimento" name="data_vencimento" type="date" value={formData.data_vencimento?.split('T')[0] || ''} onChange={e => handleFormChange('data_vencimento', e.target.value)} required className="sm:col-span-3" />
          <Select
            label="Status"
            name="status"
            value={formData.status || 'pendente'}
            onChange={e => handleFormChange('status', e.target.value as any)}
            className="sm:col-span-3"
            disabled={isPagoOuParcial}
          >
            {isPagoOuParcial && formData.status === 'pago' ? <option value="pago">Pago (registrado)</option> : null}
            {isPagoOuParcial && formData.status === 'parcial' ? <option value="parcial">Parcial (registrado)</option> : null}
            {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </Select>
        </Section>

        {!isEditing ? (
          <Section title="Recorrência" description="Para mensalidades e cobranças fixas, gere automaticamente as próximas parcelas.">
            <div className="sm:col-span-6 flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white/60 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-gray-800">Conta recorrente</div>
                <div className="text-xs text-gray-500">Cria um modelo e gera as próximas ocorrências automaticamente.</div>
              </div>
              <Switch checked={isRecorrente} onCheckedChange={setIsRecorrente} />
            </div>

            {isRecorrente ? (
              <>
                <Select
                  label="Frequência"
                  name="rec_frequencia"
                  value={frequencia}
                  onChange={(e) => setFrequencia(e.target.value as any)}
                  className="sm:col-span-3"
                >
                  <option value="semanal">Semanal</option>
                  <option value="mensal">Mensal</option>
                  <option value="bimestral">Bimestral</option>
                  <option value="trimestral">Trimestral</option>
                  <option value="semestral">Semestral</option>
                  <option value="anual">Anual</option>
                </Select>

                <Select
                  label="Ajuste para dia útil"
                  name="rec_ajuste"
                  value={ajusteDiaUtil}
                  onChange={(e) => setAjusteDiaUtil(e.target.value as any)}
                  className="sm:col-span-3"
                >
                  <option value="proximo_dia_util">Próximo dia útil</option>
                  <option value="dia_util_anterior">Dia útil anterior</option>
                  <option value="nao_ajustar">Não ajustar</option>
                </Select>

                <Input
                  label="Gerar próximas (ocorrências)"
                  name="rec_gerar_n"
                  type="number"
                  min={1}
                  max={240}
                  value={String(gerarN)}
                  onChange={(e) => setGerarN(Number(e.target.value))}
                  className="sm:col-span-3"
                  helperText="Dica: para mensal, 12 gera 1 ano."
                />

                <div className="sm:col-span-3 flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white/60 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800">Definir data final</div>
                    <div className="text-xs text-gray-500">Se desligado, a recorrência fica indeterminada.</div>
                  </div>
                  <Switch checked={hasEndDate} onCheckedChange={setHasEndDate} />
                </div>

                {hasEndDate ? (
                  <Input
                    label="Fim da recorrência"
                    name="rec_end_date"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="sm:col-span-3"
                    required
                  />
                ) : (
                  <div className="sm:col-span-3" />
                )}
              </>
            ) : null}
          </Section>
        ) : null}

        <Section title="Centro de Custo" description="Opcional (quando você quiser analisar por centro).">
          <div className="sm:col-span-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Centro de Custo</label>
            <CentroDeCustoDropdown
              valueId={(formData as any).centro_de_custo_id || null}
              valueName={(formData as any).centro_custo || null}
              onChange={(id, name) => {
                handleFormChange('centro_de_custo_id', id);
                if (name) {
                  // compat: algumas RPCs antigas ainda usam centro_custo text
                  handleFormChange('centro_custo' as any, name);
                }
              }}
              placeholder="Selecionar…"
              allowedTipos={['receita']}
            />
          </div>
        </Section>
        <Section title="Detalhes do Recebimento" description="Informações sobre o recebimento da conta.">
          <div className="sm:col-span-6 text-sm text-gray-600">
            Para registrar recebimento (e manter a Tesouraria/caixa consistente), use a ação <span className="font-medium">Registrar recebimento</span> na listagem.
          </div>
          <Input label="Data de Recebimento" name="data_pagamento" type="date" value={formData.data_pagamento?.split('T')[0] || ''} disabled className="sm:col-span-3" />
          <Input
            label="Valor Recebido"
            name="valor_pago"
            startAdornment="R$"
            inputMode="numeric"
            value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(formData.valor_pago || 0)}
            disabled
            className="sm:col-span-3"
          />
          <TextArea label="Observações" name="observacoes" value={formData.observacoes || ''} onChange={e => handleFormChange('observacoes', e.target.value)} rows={3} className="sm:col-span-6" />
        </Section>

	        {isEditing ? (
	          <Section title="Recebimentos" description="Histórico de recebimentos parciais e estornos (por evento).">
	            {isLoadingRecebimentos ? (
	              <div className="sm:col-span-6 flex items-center gap-2 text-sm text-gray-600">
	                <Loader2 className="animate-spin" size={16} />
	                Carregando recebimentos...
	              </div>
	            ) : recebimentos.length === 0 ? (
	              <div className="sm:col-span-6 text-sm text-gray-600">Nenhum recebimento registrado ainda.</div>
	            ) : (
	              <div className="sm:col-span-6 overflow-x-auto">
	                <table className="min-w-[820px] w-full divide-y divide-gray-200">
	                  <thead className="bg-gray-50">
	                    <tr>
	                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Data</th>
	                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700">Valor</th>
	                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Conta</th>
	                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Status</th>
	                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Observações</th>
	                      <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700">Ações</th>
	                    </tr>
	                  </thead>
	                  <tbody className="bg-white divide-y divide-gray-200">
	                    {recebimentos.map((r) => {
	                      const canReverse = !r.estornado && !r.movimentacao_conciliada;
	                      const statusLabel = r.estornado ? 'Estornado' : 'Recebido';
	                      const statusClass = r.estornado ? 'bg-gray-100 text-gray-800' : 'bg-green-100 text-green-800';
	                      return (
	                        <tr key={r.id} className="hover:bg-gray-50">
	                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
	                            {new Date(r.data_recebimento).toLocaleDateString('pt-BR')}
	                          </td>
	                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700 text-right font-semibold">
	                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(r.valor || 0))}
	                          </td>
	                          <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600">{r.conta_corrente_nome || '-'}</td>
	                          <td className="px-4 py-2 whitespace-nowrap">
	                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}`}>
	                              {statusLabel}
	                              {r.movimentacao_conciliada ? ' • conciliado' : ''}
	                            </span>
	                          </td>
	                          <td className="px-4 py-2 text-sm text-gray-600">{r.estorno_motivo || r.observacoes || '-'}</td>
	                          <td className="px-4 py-2 whitespace-nowrap text-right text-sm">
	                            <button
	                              type="button"
	                              onClick={() => {
	                                setRecebimentoToReverse(r);
	                                setIsEstornoRecebimentoOpen(true);
	                              }}
	                              disabled={!canReverse || isSaving}
	                              className="rounded-md border border-gray-300 bg-white py-1.5 px-3 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
	                              title={
	                                r.movimentacao_conciliada
	                                  ? 'Movimentação conciliada: desfaça a conciliação para estornar.'
	                                  : r.estornado
	                                    ? 'Recebimento já estornado.'
	                                    : 'Estornar este recebimento.'
	                              }
	                            >
	                              Estornar
	                            </button>
	                          </td>
	                        </tr>
	                      );
	                    })}
	                  </tbody>
	                </table>
	              </div>
	            )}
	          </Section>
	        ) : null}
	      </div>

	      <EstornoRecebimentoModal
	        isOpen={isEstornoRecebimentoOpen}
	        onClose={() => {
	          setIsEstornoRecebimentoOpen(false);
	          setRecebimentoToReverse(null);
	        }}
	        title="Estornar recebimento"
	        description={
	          recebimentoToReverse?.valor
	            ? `Estornar o recebimento de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(recebimentoToReverse.valor || 0))}?`
	            : 'Estornar recebimento?'
	        }
	        confirmLabel="Estornar"
	        onConfirm={handleEstornoConfirm}
	      />
	      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
	        <div className="flex gap-3">
	          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancelar</button>
	          <button onClick={handleSave} disabled={isSaving || authLoading || !activeEmpresaId || empresaChanged} className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
	            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
	            Salvar Conta
	          </button>
	        </div>
	      </footer>
    </div>
  );
};

export default ContasAReceberFormPanel;
