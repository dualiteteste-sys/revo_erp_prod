import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Save } from 'lucide-react';
import { savePartner, PartnerPayload, PartnerDetails, EnderecoPayload, ContatoPayload } from '../../services/partners';
import { useToast } from '../../contexts/ToastProvider';
import IdentificationSection from './form-sections/IdentificationSection';
import ContactSection from './form-sections/ContactSection';
import AddressSection from './form-sections/AddressSection';
import AdditionalContactsSection from './form-sections/AdditionalContactsSection';
import FinancialSection from './form-sections/FinancialSection';
import { Pessoa } from '../../services/partners';
import { Button } from '@/components/ui/button';

interface PartnerFormPanelProps {
  partner: PartnerDetails | null;
  initialValues?: Partial<PartnerDetails>;
  onSaveSuccess: (savedPartner: PartnerDetails) => void;
  onClose: () => void;
}

type PartnerFormTab = 'identificacao' | 'endereco' | 'contato' | 'financeiro' | 'contatos';

const PartnerFormPanel: React.FC<PartnerFormPanelProps> = ({ partner, initialValues, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<PartnerDetails>>({});
  const [activeTab, setActiveTab] = useState<PartnerFormTab>('identificacao');

  useEffect(() => {
    if (partner) {
      setFormData({
        ...partner,
        enderecos: partner.enderecos || [],
        contatos: partner.contatos || [],
      });
    } else {
      const base: Partial<PartnerDetails> = {
        tipo: 'cliente',
        tipo_pessoa: 'juridica',
        isento_ie: false,
        contribuinte_icms: '9',
        contato_tags: [],
      };

      const merged = { ...base, ...(initialValues || {}) } as Partial<PartnerDetails>;
      setFormData({
        ...merged,
        enderecos: merged.enderecos || [],
        contatos: merged.contatos || [],
      });
    }
    setActiveTab('identificacao');
  }, [partner, initialValues]);

  const handlePessoaChange = (field: keyof Pessoa, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleEnderecosChange = useCallback((updater: (prevEnderecos: EnderecoPayload[]) => EnderecoPayload[]) => {
    setFormData(prev => ({
      ...prev,
      enderecos: updater(prev.enderecos || []),
    }));
  }, []);

  const handleContatosChange = (contatos: ContatoPayload[]) => {
    setFormData(prev => ({ ...prev, contatos }));
  };

  const handleCnpjDataFetched = (data: any) => {
    setFormData(prev => ({
      ...prev,
      nome: data.razao_social || prev?.nome,
      fantasia: data.nome_fantasia || prev?.fantasia,
      email: data.email || prev?.email,
      telefone: data.ddd_telefone_1 || prev?.telefone,
    }));
  };

  const handleSave = async () => {
    if (!formData.nome) {
      addToast('O Nome/Razão Social é obrigatório.', 'error');
      return;
    }

    const tipoPessoa = formData.tipo_pessoa || 'juridica';
    const docDigits = String(formData.doc_unico || '').replace(/\D/g, '');
    const isAllSameDigits = docDigits.length > 0 && /^(\d)\1+$/.test(docDigits);
    const expectedLen = tipoPessoa === 'fisica' ? 11 : tipoPessoa === 'juridica' ? 14 : null;

    // Documento é opcional; mas se for informado, valida tamanho e evita sequências inválidas.
    if (expectedLen && docDigits) {
      if (docDigits.length !== expectedLen || isAllSameDigits) {
        addToast(`Documento inválido. Informe um ${tipoPessoa === 'fisica' ? 'CPF' : 'CNPJ'} com ${expectedLen} dígitos.`, 'error');
        setActiveTab('identificacao');
        return;
      }
    }
    
    setIsSaving(true);
    try {
      const { enderecos, contatos, ...pessoaData } = formData;

      const payload: PartnerPayload = {
        pessoa: pessoaData,
        enderecos: enderecos,
        contatos: contatos,
      };

      const savedPartner = await savePartner(payload);
      
      addToast('Salvo com sucesso!', 'success');
      onSaveSuccess(savedPartner);
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 pt-6">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={activeTab === 'identificacao' ? 'default' : 'secondary'}
            onClick={() => setActiveTab('identificacao')}
          >
            Identificação
          </Button>
          <Button
            type="button"
            variant={activeTab === 'endereco' ? 'default' : 'secondary'}
            onClick={() => setActiveTab('endereco')}
          >
            Endereço
          </Button>
          <Button
            type="button"
            variant={activeTab === 'contato' ? 'default' : 'secondary'}
            onClick={() => setActiveTab('contato')}
          >
            Contato
          </Button>
          <Button
            type="button"
            variant={activeTab === 'financeiro' ? 'default' : 'secondary'}
            onClick={() => setActiveTab('financeiro')}
          >
            Financeiro
          </Button>
          <Button
            type="button"
            variant={activeTab === 'contatos' ? 'default' : 'secondary'}
            onClick={() => setActiveTab('contatos')}
          >
            Contatos adicionais
          </Button>
        </div>
      </div>

      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {activeTab === 'identificacao' ? (
          <IdentificationSection data={formData} onChange={handlePessoaChange} onCnpjDataFetched={handleCnpjDataFetched} />
        ) : null}
        {activeTab === 'endereco' ? (
          <AddressSection enderecos={formData.enderecos || []} onEnderecosChange={handleEnderecosChange} />
        ) : null}
        {activeTab === 'contato' ? (
          <ContactSection data={formData} onPessoaChange={handlePessoaChange} />
        ) : null}
        {activeTab === 'financeiro' ? (
          <FinancialSection data={formData} onChange={handlePessoaChange} />
        ) : null}
        {activeTab === 'contatos' ? (
          <AdditionalContactsSection contatos={formData.contatos || []} onContatosChange={handleContatosChange} />
        ) : null}
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            <span className="ml-2">Salvar</span>
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default PartnerFormPanel;
