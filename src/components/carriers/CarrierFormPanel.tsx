import React, { useState, useEffect } from 'react';
import { Loader2, Save, AlertCircle } from 'lucide-react';
import { CarrierPayload, saveCarrier } from '../../services/carriers';
import { useToast } from '../../contexts/ToastProvider';
import Section from '../ui/forms/Section';
import Input from '../ui/forms/Input';
import Select from '../ui/forms/Select';
import TextArea from '../ui/forms/TextArea';
import Toggle from '../ui/forms/Toggle';
import { cnpjMask, cpfMask, phoneMask, cepMask, isValidCNPJ, isValidCPF } from '../../lib/masks';
import { UFS } from '../../lib/constants';

interface CarrierFormPanelProps {
  carrier: CarrierPayload | null;
  onSaveSuccess: (savedCarrier: any) => void;
  onClose: () => void;
}

const CarrierFormPanel: React.FC<CarrierFormPanelProps> = ({ carrier, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<CarrierPayload>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (carrier) {
      setFormData(carrier);
    } else {
      setFormData({ 
        ativo: true, 
        tipo_pessoa: 'pj',
        modal_principal: 'rodoviario',
        frete_tipo_padrao: 'nao_definido',
        pais: 'Brasil',
        isento_ie: false,
        exige_agendamento: false,
        padrao_para_frete: false
      });
    }
    setErrors({});
  }, [carrier]);

  const handleFormChange = (field: keyof CarrierPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const masked = formData.tipo_pessoa === 'pj' ? cnpjMask(val) : cpfMask(val);
    handleFormChange('documento', masked);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.nome?.trim()) {
      newErrors.nome = 'O Nome é obrigatório.';
    }

    if (formData.documento) {
      const cleanDoc = formData.documento.replace(/\D/g, '');
      if (formData.tipo_pessoa === 'pj' && cleanDoc.length > 0 && !isValidCNPJ(cleanDoc)) {
        newErrors.documento = 'CNPJ inválido.';
      }
      if (formData.tipo_pessoa === 'pf' && cleanDoc.length > 0 && !isValidCPF(cleanDoc)) {
        newErrors.documento = 'CPF inválido.';
      }
    }

    if (formData.cep) {
      const clean = formData.cep.replace(/\D/g, '');
      if (clean.length > 0 && clean.length !== 8) {
        newErrors.cep = 'CEP inválido (8 dígitos).';
      }
    }

    if (formData.telefone) {
      const clean = formData.telefone.replace(/\D/g, '');
      if (clean.length > 0 && clean.length < 10) {
        newErrors.telefone = 'Telefone inválido.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      addToast('Verifique os erros no formulário.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const savedCarrier = await saveCarrier(formData);
      addToast('Transportadora salva com sucesso!', 'success');
      onSaveSuccess(savedCarrier);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {Object.keys(errors).length > 0 && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
              <p className="text-sm text-red-700 font-medium">Corrija os seguintes erros:</p>
            </div>
            <ul className="mt-2 list-disc list-inside text-sm text-red-600">
              {Object.values(errors).map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <Section title="Identificação" description="Dados principais da transportadora.">
          <Input 
            label="Nome / Razão Social" 
            name="nome" 
            value={formData.nome || ''} 
            onChange={(e) => handleFormChange('nome', e.target.value)} 
            required 
            className="sm:col-span-4" 
            error={errors.nome}
          />
          <Input 
            label="Código Interno" 
            name="codigo" 
            value={formData.codigo || ''} 
            onChange={(e) => handleFormChange('codigo', e.target.value)} 
            className="sm:col-span-2" 
          />
          
          <div className="sm:col-span-2">
            <Select 
                label="Tipo Pessoa" 
                name="tipo_pessoa" 
                value={formData.tipo_pessoa || 'pj'} 
                onChange={(e) => handleFormChange('tipo_pessoa', e.target.value)}
            >
                <option value="pj">Jurídica</option>
                <option value="pf">Física</option>
            </Select>
          </div>

          <Input 
            label={formData.tipo_pessoa === 'pf' ? 'CPF' : 'CNPJ'} 
            name="documento" 
            value={formData.documento || ''} 
            onChange={handleDocumentChange} 
            className="sm:col-span-2" 
            error={errors.documento}
          />

          <Input 
            label={formData.tipo_pessoa === 'pf' ? 'RG' : 'Inscrição Estadual'} 
            name="ie_rg" 
            value={formData.ie_rg || ''} 
            onChange={(e) => handleFormChange('ie_rg', e.target.value)} 
            className="sm:col-span-2" 
          />

          <div className="sm:col-span-6 flex flex-wrap gap-6 mt-2">
            <Toggle 
                label="Ativo" 
                name="ativo" 
                checked={formData.ativo !== false} 
                onChange={checked => handleFormChange('ativo', checked)} 
            />
            <Toggle 
                label="Padrão para Frete" 
                name="padrao" 
                checked={formData.padrao_para_frete || false} 
                onChange={checked => handleFormChange('padrao_para_frete', checked)} 
            />
            <Toggle 
                label="Isento de IE" 
                name="isento_ie" 
                checked={formData.isento_ie || false} 
                onChange={checked => handleFormChange('isento_ie', checked)} 
            />
          </div>
        </Section>

        <Section title="Contato e Endereço" description="Localização e meios de contato.">
            <Input 
                label="E-mail" 
                name="email" 
                type="email"
                value={formData.email || ''} 
                onChange={(e) => handleFormChange('email', e.target.value)} 
                className="sm:col-span-3" 
            />
            <Input 
                label="Telefone" 
                name="telefone" 
                value={phoneMask(formData.telefone || '')} 
                onChange={(e) => handleFormChange('telefone', e.target.value)} 
                className="sm:col-span-3" 
                error={errors.telefone}
            />
            <Input 
                label="Contato Principal" 
                name="contato_principal" 
                value={formData.contato_principal || ''} 
                onChange={(e) => handleFormChange('contato_principal', e.target.value)} 
                className="sm:col-span-6" 
            />
            
            <Input 
                label="CEP" 
                name="cep" 
                value={cepMask(formData.cep || '')} 
                onChange={(e) => handleFormChange('cep', e.target.value)} 
                className="sm:col-span-2" 
                error={errors.cep}
            />
            <Input 
                label="Endereço" 
                name="logradouro" 
                value={formData.logradouro || ''} 
                onChange={(e) => handleFormChange('logradouro', e.target.value)} 
                className="sm:col-span-4" 
            />
            <Input 
                label="Número" 
                name="numero" 
                value={formData.numero || ''} 
                onChange={(e) => handleFormChange('numero', e.target.value)} 
                className="sm:col-span-2" 
            />
            <Input 
                label="Bairro" 
                name="bairro" 
                value={formData.bairro || ''} 
                onChange={(e) => handleFormChange('bairro', e.target.value)} 
                className="sm:col-span-4" 
            />
            <Input 
                label="Cidade" 
                name="cidade" 
                value={formData.cidade || ''} 
                onChange={(e) => handleFormChange('cidade', e.target.value)} 
                className="sm:col-span-4" 
            />
            <Select 
                label="UF" 
                name="uf" 
                value={formData.uf || ''} 
                onChange={(e) => handleFormChange('uf', e.target.value)}
                className="sm:col-span-2"
            >
                <option value="">Selecione</option>
                {UFS.map(uf => <option key={uf.value} value={uf.value}>{uf.value}</option>)}
            </Select>
        </Section>

        <Section title="Operacional" description="Configurações de logística.">
            <Select 
                label="Modal Principal" 
                name="modal" 
                value={formData.modal_principal || 'rodoviario'} 
                onChange={(e) => handleFormChange('modal_principal', e.target.value)}
                className="sm:col-span-2"
            >
                <option value="rodoviario">Rodoviário</option>
                <option value="aereo">Aéreo</option>
                <option value="maritimo">Marítimo</option>
                <option value="ferroviario">Ferroviário</option>
                <option value="courier">Courier</option>
                <option value="outro">Outro</option>
            </Select>

            <Select 
                label="Tipo de Frete Padrão" 
                name="frete_tipo" 
                value={formData.frete_tipo_padrao || 'nao_definido'} 
                onChange={(e) => handleFormChange('frete_tipo_padrao', e.target.value)}
                className="sm:col-span-2"
            >
                <option value="nao_definido">Não Definido</option>
                <option value="cif">CIF (Pago pelo Remetente)</option>
                <option value="fob">FOB (Pago pelo Destinatário)</option>
                <option value="terceiros">Terceiros</option>
            </Select>

            <Input 
                label="Prazo Médio (dias)" 
                name="prazo" 
                type="number"
                value={formData.prazo_medio_dias || ''} 
                onChange={(e) => handleFormChange('prazo_medio_dias', parseInt(e.target.value))} 
                className="sm:col-span-2" 
            />

            <div className="sm:col-span-6">
                <Toggle 
                    label="Exige Agendamento de Coleta" 
                    name="agendamento" 
                    checked={formData.exige_agendamento || false} 
                    onChange={checked => handleFormChange('exige_agendamento', checked)} 
                />
            </div>

            <TextArea 
                label="Observações" 
                name="obs" 
                value={formData.observacoes || ''} 
                onChange={(e) => handleFormChange('observacoes', e.target.value)} 
                rows={3} 
                className="sm:col-span-6" 
            />
        </Section>
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20 bg-gray-50">
        <div className="flex gap-3">
          <button 
            type="button" 
            onClick={onClose} 
            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Cancelar
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar
          </button>
        </div>
      </footer>
    </div>
  );
};

export default CarrierFormPanel;
