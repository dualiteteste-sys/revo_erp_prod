import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Save, Paperclip, Plus, Trash2 } from 'lucide-react';
import { OrdemServicoDetails, saveOs, deleteOsItem, getOsDetails, OsItemSearchResult, addOsItem } from '@/services/os';
import { getPartnerDetails } from '@/services/partners';
import { useToast } from '@/contexts/ToastProvider';
import Section from '../ui/forms/Section';
import Input from '../ui/forms/Input';
import Select from '../ui/forms/Select';
import TextArea from '../ui/forms/TextArea';
import { Database } from '@/types/database.types';
import OsFormItems from './OsFormItems';
import { useNumericField } from '@/hooks/useNumericField';
import ClientAutocomplete from '../common/ClientAutocomplete';
import { Button } from '@/components/ui/button';
import OsAuditTrailPanel from '@/components/os/OsAuditTrailPanel';
import { createContaAReceberFromOs, getContaAReceberDetails, getContaAReceberFromOs, receberContaAReceber, type ContaAReceber } from '@/services/contasAReceber';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavigate } from 'react-router-dom';
import { useConfirm } from '@/contexts/ConfirmProvider';

interface OsFormPanelProps {
  os: OrdemServicoDetails | null;
  onSaveSuccess: (savedOs: OrdemServicoDetails) => void;
  onClose: () => void;
}

const statusOptions: { value: Database['public']['Enums']['status_os']; label: string }[] = [
    { value: 'orcamento', label: 'Orçamento' },
    { value: 'aberta', label: 'Aberta' },
    { value: 'concluida', label: 'Concluída' },
    { value: 'cancelada', label: 'Cancelada' },
];

const OsFormPanel: React.FC<OsFormPanelProps> = ({ os, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [formData, setFormData] = useState<Partial<OrdemServicoDetails>>({});
  const [clientName, setClientName] = useState('');
  const [novoAnexo, setNovoAnexo] = useState('');
  const [contaReceberId, setContaReceberId] = useState<string | null>(null);
  const [contaReceber, setContaReceber] = useState<ContaAReceber | null>(null);
  const [isContaDialogOpen, setIsContaDialogOpen] = useState(false);
  const [contaVencimento, setContaVencimento] = useState<string>('');
  const [isCreatingConta, setIsCreatingConta] = useState(false);
  const [isReceivingConta, setIsReceivingConta] = useState(false);

  const descontoProps = useNumericField(formData.desconto_valor, (value) => handleFormChange('desconto_valor', value));
  const custoEstimadoProps = useNumericField((formData as any).custo_estimado, (value) => handleFormChange('custo_estimado' as any, value));
  const custoRealProps = useNumericField((formData as any).custo_real, (value) => handleFormChange('custo_real' as any, value));

  useEffect(() => {
    if (os) {
      setFormData(os);
      setNovoAnexo('');
      setContaReceberId(null);
      setContaVencimento('');
      if (os.cliente_id) {
        getPartnerDetails(os.cliente_id).then(partner => {
          if (partner) setClientName(partner.nome);
        });
      } else {
        setClientName('');
      }
    } else {
      setFormData({ status: 'orcamento', desconto_valor: 0, total_itens: 0, total_geral: 0, itens: [] });
      setClientName('');
      setNovoAnexo('');
      setContaReceberId(null);
      setContaVencimento('');
    }
  }, [os]);

  useEffect(() => {
    const osId = formData.id ? String(formData.id) : null;
    if (!osId) return;

    void (async () => {
      const id = await getContaAReceberFromOs(osId);
      setContaReceberId(id);
      setContaReceber(null);
      if (id) {
        try {
          const details = await getContaAReceberDetails(id);
          setContaReceber(details);
        } catch {
          setContaReceber(null);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.id]);

  const statusOs = (formData.status as any) as Database['public']['Enums']['status_os'] | undefined;
  const canGenerateConta = !!formData.id && statusOs === 'concluida';

  const defaultVencimento = useMemo(() => {
    const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }, []);

  const handleOpenContaDialog = () => {
    setContaVencimento(contaVencimento || defaultVencimento);
    setIsContaDialogOpen(true);
  };

  const handleCreateConta = async () => {
    if (!formData.id) return;
    setIsCreatingConta(true);
    try {
      const conta = await createContaAReceberFromOs({
        osId: String(formData.id),
        dataVencimento: contaVencimento || null,
      });
      setContaReceberId(conta.id);
      addToast('Conta a receber gerada com sucesso!', 'success');
      setIsContaDialogOpen(false);
      navigate(`/app/financeiro/contas-a-receber?contaId=${encodeURIComponent(conta.id)}`);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao gerar conta a receber.', 'error');
    } finally {
      setIsCreatingConta(false);
    }
  };

  const handleOpenConta = () => {
    if (!contaReceberId) return;
    navigate(`/app/financeiro/contas-a-receber?contaId=${encodeURIComponent(contaReceberId)}`);
  };

  const handleReceberContaAgora = async () => {
    if (!contaReceberId || !contaReceber) return;
    if (contaReceber.status === 'pago' || contaReceber.status === 'cancelado') {
      handleOpenConta();
      return;
    }

    const ok = await confirm({
      title: 'Registrar recebimento',
      description: `Deseja marcar esta conta como paga hoje? Valor: ${new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(contaReceber.valor || 0)}.`,
      confirmText: 'Registrar recebimento',
      cancelText: 'Cancelar',
      variant: 'default',
    });
    if (!ok) return;

    setIsReceivingConta(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const updated = await receberContaAReceber({
        id: contaReceberId,
        dataPagamento: today,
        valorPago: Number(contaReceber.valor || 0),
      });
      setContaReceber(updated);
      addToast('Recebimento registrado com sucesso!', 'success');
      navigate(`/app/financeiro/contas-a-receber?contaId=${encodeURIComponent(contaReceberId)}`);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao registrar recebimento.', 'error');
    } finally {
      setIsReceivingConta(false);
    }
  };

  const contaStatusBadge = useMemo(() => {
    if (!contaReceber) return null;
    const map: Record<string, { label: string; color: string }> = {
      pendente: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
      pago: { label: 'Pago', color: 'bg-green-100 text-green-800' },
      vencido: { label: 'Vencido', color: 'bg-red-100 text-red-800' },
      cancelado: { label: 'Cancelado', color: 'bg-gray-100 text-gray-800' },
    };
    const cfg = map[contaReceber.status] || { label: contaReceber.status, color: 'bg-gray-100 text-gray-800' };
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>;
  }, [contaReceber]);

  const refreshOsData = async (osId: string) => {
    try {
        const updatedOs = await getOsDetails(osId);
        setFormData(updatedOs);
    } catch (error: any) {
        addToast("Erro ao atualizar dados da O.S.", "error");
    }
  };

  const handleFormChange = (field: keyof OrdemServicoDetails, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const anexos = (formData.anexos || []) as string[];

  const handleAddAnexo = () => {
    const value = novoAnexo.trim();
    if (!value) return;
    if (anexos.includes(value)) {
      addToast('Este anexo já foi adicionado.', 'warning');
      return;
    }
    handleFormChange('anexos' as any, [...anexos, value]);
    setNovoAnexo('');
  };

  const handleRemoveAnexo = (value: string) => {
    handleFormChange('anexos' as any, anexos.filter((a) => a !== value));
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
        await deleteOsItem(itemId);
        if(formData.id) await refreshOsData(formData.id);
        addToast('Item removido.', 'success');
    } catch (error: any) {
        addToast(error.message, 'error');
    }
  };

  const handleAddItem = async (item: OsItemSearchResult) => {
    setIsAddingItem(true);
    try {
      let osToUpdate = formData;
  
      if (!osToUpdate.id) {
        if (!osToUpdate.descricao) {
          addToast('Adicione uma descrição à O.S. antes de adicionar itens.', 'warning');
          setIsAddingItem(false);
          return;
        }
        osToUpdate = await saveOs(osToUpdate);
        setFormData(osToUpdate); // Update form data with the newly created OS
      }
  
      const osId = osToUpdate.id!;
      
      const payload = item.type === 'service'
        ? { servico_id: item.id, qtd: 1 }
        : { produto_id: item.id, quantidade: 1 };

      await addOsItem(osId, payload);
  
      const updatedOs = await getOsDetails(osId);
      setFormData(updatedOs);
  
      addToast(`${item.type === 'service' ? 'Serviço' : 'Produto'} adicionado.`, 'success');
    } catch (error: any) {
      addToast(error.message || 'Falha ao adicionar item à Ordem de Serviço.', 'error');
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleSave = async () => {
    if (!formData.descricao) {
      addToast('A descrição da O.S. é obrigatória.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const savedOs = await saveOs(formData);
      addToast('Ordem de Serviço salva com sucesso!', 'success');
      onSaveSuccess(savedOs);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Dados Gerais" description="Informações principais da Ordem de Serviço">
          <Input
            label="Número"
            name="numero"
            value={formData.numero ?? ''}
            readOnly
            className="sm:col-span-2"
          />
          <div className="sm:col-span-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <ClientAutocomplete
              value={formData.cliente_id || null}
              initialName={clientName}
              onChange={(id, name) => {
                handleFormChange('cliente_id', id);
                if (name) setClientName(name);
              }}
              placeholder="Buscar cliente..."
            />
          </div>
          <Input label="Descrição do Serviço" name="descricao" value={formData.descricao || ''} onChange={e => handleFormChange('descricao', e.target.value)} required className="sm:col-span-4" />
          <Select label="Status" name="status" value={formData.status || 'orcamento'} onChange={e => handleFormChange('status', e.target.value)} className="sm:col-span-2">
            {statusOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </Select>
        </Section>

        <Section title="Datas e Prazos" description="Agendamento e execução do serviço">
          <Input label="Data de Início" name="data_inicio" type="date" value={formData.data_inicio?.split('T')[0] || ''} onChange={e => handleFormChange('data_inicio', e.target.value)} className="sm:col-span-2" />
          <Input label="Data Prevista" name="data_prevista" type="date" value={formData.data_prevista?.split('T')[0] || ''} onChange={e => handleFormChange('data_prevista', e.target.value)} className="sm:col-span-2" />
          <Input label="Hora" name="hora" type="time" value={formData.hora || ''} onChange={e => handleFormChange('hora', e.target.value)} className="sm:col-span-2" />
        </Section>
        
        <OsFormItems items={formData.itens || []} onRemoveItem={handleRemoveItem} onAddItem={handleAddItem} isAddingItem={isAddingItem} />

        <Section title="Custos" description="Controle básico de custos para cálculo de margem e relatórios.">
          <Input label="Custo Estimado (R$)" name="custo_estimado" {...custoEstimadoProps} className="sm:col-span-3" />
          <Input label="Custo Real (R$)" name="custo_real" {...custoRealProps} className="sm:col-span-3" />
        </Section>

        <Section title="Financeiro" description="Valores e condições de pagamento">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Total dos Itens</label>
            <div className="p-3 bg-gray-100 rounded-lg text-right font-semibold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.total_itens || 0)}</div>
          </div>
          <Input label="Desconto (R$)" name="desconto_valor" {...descontoProps} className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Geral</label>
            <div className="p-3 bg-blue-100 text-blue-800 rounded-lg text-right font-bold text-lg">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(formData.total_geral || 0)}</div>
          </div>
          <Input label="Forma de Recebimento" name="forma_recebimento" value={formData.forma_recebimento || ''} onChange={e => handleFormChange('forma_recebimento', e.target.value)} className="sm:col-span-3" />
          <Input label="Condição de Pagamento" name="condicao_pagamento" value={formData.condicao_pagamento || ''} onChange={e => handleFormChange('condicao_pagamento', e.target.value)} className="sm:col-span-3" />

          {canGenerateConta ? (
            <div className="sm:col-span-6 flex flex-wrap items-center justify-between gap-2 mt-2">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Conta a receber vinculada à OS concluída.</span>
                {contaStatusBadge}
              </div>
              <div className="flex gap-2">
                {contaReceberId ? (
                  <>
                    {contaReceber && contaReceber.status !== 'pago' && contaReceber.status !== 'cancelado' ? (
                      <Button type="button" onClick={handleReceberContaAgora} disabled={isReceivingConta} className="gap-2">
                        {isReceivingConta ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                        Registrar Recebimento
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" onClick={handleOpenConta} className="gap-2">
                      <FileText size={18} />
                      Abrir Conta
                    </Button>
                  </>
                ) : (
                  <Button type="button" onClick={handleOpenContaDialog} className="gap-2">
                    <FileText size={18} />
                    Gerar Conta a Receber
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </Section>

        <Section title="Observações" description="Detalhes adicionais e anotações internas">
            <TextArea label="Observações" name="observacoes" value={formData.observacoes || ''} onChange={e => handleFormChange('observacoes', e.target.value)} rows={3} className="sm:col-span-3" />
            <TextArea label="Observações Internas" name="observacoes_internas" value={formData.observacoes_internas || ''} onChange={e => handleFormChange('observacoes_internas', e.target.value)} rows={3} className="sm:col-span-3" />
        </Section>

        <Section title="Anexos" description="Links/arquivos relacionados (fotos, PDFs, comprovantes).">
          <div className="sm:col-span-6 flex gap-2 items-end">
            <Input
              label="Adicionar anexo (URL ou caminho)"
              name="novo_anexo"
              value={novoAnexo}
              onChange={(e) => setNovoAnexo(e.target.value)}
              className="flex-1"
              startAdornment={<Paperclip size={18} />}
            />
            <Button type="button" onClick={handleAddAnexo} className="gap-2">
              <Plus size={18} />
              Adicionar
            </Button>
          </div>
          <div className="sm:col-span-6 space-y-2">
            {anexos.length === 0 ? (
              <div className="text-sm text-gray-500 py-3">Nenhum anexo adicionado.</div>
            ) : (
              anexos.map((a) => (
                <div key={a} className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <a
                    href={a}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-700 hover:underline truncate"
                    title={a}
                  >
                    {a}
                  </a>
                  <Button type="button" variant="ghost" size="icon" className="text-rose-600 hover:text-rose-700" onClick={() => handleRemoveAnexo(a)}>
                    <Trash2 size={18} />
                  </Button>
                </div>
              ))
            )}
          </div>
        </Section>

        {formData.id ? (
          <div className="mt-6">
            <OsAuditTrailPanel osId={String(formData.id)} />
          </div>
        ) : null}
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <Button type="button" onClick={onClose} variant="outline">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar O.S.
          </Button>
        </div>
      </footer>

      <Dialog open={isContaDialogOpen} onOpenChange={setIsContaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar Conta a Receber</DialogTitle>
            <DialogDescription>
              Cria uma conta a receber vinculada a esta OS. Se já existir uma conta vinculada, o sistema retorna a existente.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2">
            <Input
              label="Data de vencimento"
              name="conta_vencimento"
              type="date"
              value={contaVencimento}
              onChange={(e) => setContaVencimento(e.target.value)}
            />
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setIsContaDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreateConta} disabled={isCreatingConta} className="gap-2">
              {isCreatingConta ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
              Gerar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OsFormPanel;
