import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { CobrancaBancaria, CobrancaPayload, getCobrancaDetails, saveCobranca } from '@/services/cobrancas';
import { useToast } from '@/contexts/ToastProvider';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import { useNumericField } from '@/hooks/useNumericField';
import { useContasCorrentes } from '@/hooks/useTesouraria';
import { useAuth } from '@/contexts/AuthProvider';

interface Props {
  cobranca: CobrancaBancaria | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

const INITIAL_FORM_DATA: CobrancaPayload = {
  status: 'pendente_emissao',
  tipo_cobranca: 'boleto',
  valor_original: 0,
  valor_atual: 0,
};

export default function CobrancaFormPanel({ cobranca, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [loading, setLoading] = useState(!!cobranca);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CobrancaPayload>(INITIAL_FORM_DATA);
  const { contas } = useContasCorrentes(); // Para selecionar conta bancária
  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const actionTokenRef = useRef(0);

  const valorOriginalProps = useNumericField(formData.valor_original, (v) => {
    setFormData(prev => ({ ...prev, valor_original: v || 0, valor_atual: v || 0 }));
  });

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;
    actionTokenRef.current += 1;
    setIsSaving(false);
    setFormData(INITIAL_FORM_DATA);
    setLoading(!!cobranca);
    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId, cobranca]);

  const loadDetails = useCallback(async (cobrancaId: string) => {
    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    try {
      const data = await getCobrancaDetails(cobrancaId);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setFormData(data);
    } catch (e) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      console.error(e);
      addToast('Erro ao carregar cobrança.', 'error');
      onClose();
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setLoading(false);
    }
  }, [activeEmpresaId, addToast, onClose]);

  useEffect(() => {
    if (authLoading || !activeEmpresaId || empresaChanged) return;
    if (!cobranca?.id) {
      setLoading(false);
      setFormData(INITIAL_FORM_DATA);
      return;
    }
    setLoading(true);
    void loadDetails(cobranca.id);
  }, [activeEmpresaId, authLoading, cobranca, empresaChanged, loadDetails]);

  const handleChange = (field: keyof CobrancaPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (authLoading || !activeEmpresaId || empresaChanged) {
      addToast('Aguarde a troca de empresa concluir para salvar.', 'info');
      return;
    }
    if (!formData.cliente_id) {
      addToast('Selecione um cliente.', 'error');
      return;
    }
    if (!formData.data_vencimento) {
      addToast('Data de vencimento é obrigatória.', 'error');
      return;
    }
    if (!formData.valor_original || formData.valor_original <= 0) {
      addToast('Valor deve ser maior que zero.', 'error');
      return;
    }

    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setIsSaving(true);
    try {
      await saveCobranca(formData);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast('Cobrança salva com sucesso!', 'success');
      onSaveSuccess();
    } catch (e: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(e.message, 'error');
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setIsSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  const isLocked = ['liquidada', 'baixada', 'cancelada'].includes(formData.status || '');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <Section title="Dados da Cobrança" description="Informações principais do título.">
          <div className="sm:col-span-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
            <ClientAutocomplete
              value={formData.cliente_id || null}
              initialName={formData.cliente_nome}
              onChange={(id, name) => {
                handleChange('cliente_id', id);
                if (name) handleChange('cliente_nome', name);
              }}
              disabled={isLocked}
            />
          </div>
          
          <div className="sm:col-span-2">
            <Select 
                label="Conta Bancária" 
                name="conta" 
                value={formData.conta_corrente_id || ''} 
                onChange={e => handleChange('conta_corrente_id', e.target.value)}
                disabled={isLocked}
            >
                <option value="">Selecione...</option>
                {contas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </div>

          <Input 
            label="Descrição" 
            name="descricao" 
            value={formData.descricao || ''} 
            onChange={e => handleChange('descricao', e.target.value)} 
            className="sm:col-span-4" 
            disabled={isLocked}
          />
          <Input 
            label="Documento Ref." 
            name="doc" 
            value={formData.documento_ref || ''} 
            onChange={e => handleChange('documento_ref', e.target.value)} 
            className="sm:col-span-2" 
            disabled={isLocked}
          />

          <Select 
            label="Tipo" 
            name="tipo" 
            value={formData.tipo_cobranca || 'boleto'} 
            onChange={e => handleChange('tipo_cobranca', e.target.value)}
            className="sm:col-span-2"
            disabled={isLocked}
          >
            <option value="boleto">Boleto Bancário</option>
            <option value="pix">Pix</option>
            <option value="carne">Carnê</option>
            <option value="link_pagamento">Link de Pagamento</option>
            <option value="outro">Outro</option>
          </Select>

          <Select 
            label="Status" 
            name="status" 
            value={formData.status || 'pendente_emissao'} 
            onChange={e => handleChange('status', e.target.value)}
            className="sm:col-span-2"
          >
            <option value="pendente_emissao">Pendente Emissão</option>
            <option value="emitida">Emitida</option>
            <option value="registrada">Registrada</option>
            <option value="enviada">Enviada</option>
            <option value="liquidada">Liquidada</option>
            <option value="baixada">Baixada</option>
            <option value="cancelada">Cancelada</option>
            <option value="erro">Erro</option>
          </Select>

          <div className="sm:col-span-2"></div>

          <Input 
            label="Data Emissão" 
            name="dt_emissao" 
            type="date"
            value={formData.data_emissao || ''} 
            onChange={e => handleChange('data_emissao', e.target.value)} 
            className="sm:col-span-2" 
            disabled={isLocked}
          />
          <Input 
            label="Vencimento" 
            name="dt_venc" 
            type="date"
            value={formData.data_vencimento || ''} 
            onChange={e => handleChange('data_vencimento', e.target.value)} 
            className="sm:col-span-2" 
            required
            disabled={isLocked}
          />
          <Input
            label="Valor"
            name="valor"
            startAdornment="R$"
            inputMode="numeric"
            {...valorOriginalProps}
            className="sm:col-span-2"
            required
            disabled={isLocked}
          />
        </Section>

        <Section title="Dados Bancários" description="Informações de registro (Boleto/Pix).">
            <Input label="Nosso Número" name="nosso_num" value={formData.nosso_numero || ''} onChange={e => handleChange('nosso_numero', e.target.value)} className="sm:col-span-2" disabled={isLocked} />
            <Input label="Carteira" name="carteira" value={formData.carteira_codigo || ''} onChange={e => handleChange('carteira_codigo', e.target.value)} className="sm:col-span-2" disabled={isLocked} />
            <Input label="Linha Digitável" name="linha" value={formData.linha_digitavel || ''} onChange={e => handleChange('linha_digitavel', e.target.value)} className="sm:col-span-6" disabled={isLocked} />
            <Input label="Código de Barras" name="barras" value={formData.codigo_barras || ''} onChange={e => handleChange('codigo_barras', e.target.value)} className="sm:col-span-6" disabled={isLocked} />
            
            <TextArea label="Observações" name="obs" value={formData.observacoes || ''} onChange={e => handleChange('observacoes', e.target.value)} rows={3} className="sm:col-span-6" disabled={isLocked} />
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20 bg-gray-50">
        <div className="flex gap-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving || loading || authLoading || !activeEmpresaId || empresaChanged}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar
          </button>
        </div>
      </footer>
    </div>
  );
}
