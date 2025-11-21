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

interface PartnerFormPanelProps {
  partner: PartnerDetails | null;
  onSaveSuccess: (savedPartner: PartnerDetails) => void;
  onClose: () => void;
}

const PartnerFormPanel: React.FC<PartnerFormPanelProps> = ({ partner, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<PartnerDetails>>({});

  useEffect(() => {
    if (partner) {
      setFormData({
        ...partner,
        enderecos: partner.enderecos || [],
        contatos: partner.contatos || [],
      });
    } else {
      setFormData({ tipo: 'cliente', tipo_pessoa: 'juridica', isento_ie: false, contribuinte_icms: '9', contato_tags: [], enderecos: [], contatos: [] });
    }
  }, [partner]);

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
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        <IdentificationSection
          data={formData}
          onChange={handlePessoaChange}
          onCnpjDataFetched={handleCnpjDataFetched}
        />
        <AddressSection
          enderecos={formData.enderecos || []}
          onEnderecosChange={handleEnderecosChange}
        />
        <ContactSection
          data={formData}
          onPessoaChange={handlePessoaChange}
        />
        <FinancialSection
          data={formData}
          onChange={handlePessoaChange}
        />
        <AdditionalContactsSection
          contatos={formData.contatos || []}
          onContatosChange={handleContatosChange}
        />
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar
          </button>
        </div>
      </footer>
    </div>
  );
};

export default PartnerFormPanel;
