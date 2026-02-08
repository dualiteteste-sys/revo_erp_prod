import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Save } from 'lucide-react';
import { savePartner, PartnerPayload, PartnerDetails, EnderecoPayload, ContatoPayload, findPartnerDuplicates } from '../../services/partners';
import { useToast } from '../../contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';
import IdentificationSection from './form-sections/IdentificationSection';
import ContactSection from './form-sections/ContactSection';
import AddressSection from './form-sections/AddressSection';
import AdditionalContactsSection from './form-sections/AdditionalContactsSection';
import FinancialSection from './form-sections/FinancialSection';
import { Pessoa } from '../../services/partners';
import { isValidCpfOrCnpj } from '@/lib/masks';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthProvider';

interface PartnerFormPanelProps {
  partner: PartnerDetails | null;
  initialValues?: Partial<PartnerDetails>;
  onSaveSuccess: (savedPartner: PartnerDetails) => void;
  onClose: () => void;
}

type PartnerFormTab = 'identificacao' | 'endereco' | 'contato' | 'financeiro' | 'contatos';

const PartnerFormPanel: React.FC<PartnerFormPanelProps> = ({ partner, initialValues, onSaveSuccess, onClose }) => {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<PartnerDetails>>({});
  const [activeTab, setActiveTab] = useState<PartnerFormTab>('identificacao');
  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const actionTokenRef = useRef(0);

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

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;
    actionTokenRef.current += 1;
    setIsSaving(false);
    setActiveTab('identificacao');
    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

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
    if (authLoading || !activeEmpresaId || empresaChanged) {
      addToast('Aguarde a troca de empresa concluir para salvar.', 'info');
      return;
    }

    if (!formData.nome) {
      addToast('O Nome/Razão Social é obrigatório.', 'error');
      return;
    }

    const tipoPessoa = formData.tipo_pessoa || 'juridica';
    const docDigits = String(formData.doc_unico || '').replace(/\D/g, '');
    const expectedLen = tipoPessoa === 'fisica' ? 11 : tipoPessoa === 'juridica' ? 14 : null;

    // Documento é opcional; mas se for informado, valida tamanho e evita sequências inválidas.
    if (expectedLen && docDigits) {
      if (docDigits.length !== expectedLen || !isValidCpfOrCnpj(docDigits)) {
        addToast(`Documento inválido. Informe um ${tipoPessoa === 'fisica' ? 'CPF' : 'CNPJ'} com ${expectedLen} dígitos.`, 'error');
        setActiveTab('identificacao');
        return;
      }
    }

    const email = String(formData.email || '').trim();
    if (email) {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!ok) {
        addToast('E-mail inválido. Verifique o formato.', 'error');
        setActiveTab('contato');
        return;
      }
    }

    const telDigits = String(formData.telefone || '').replace(/\D/g, '');
    const celDigits = String((formData as any).celular || '').replace(/\D/g, '');
    const invalidPhone = (d: string) => d.length > 0 && d.length < 10;
    if (invalidPhone(telDigits) || invalidPhone(celDigits)) {
      addToast('Telefone/celular inválido. Use DDD + número (mín. 10 dígitos).', 'error');
      setActiveTab('contato');
      return;
    }

    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;

    // Dedupe (não bloqueia por padrão): alerta caso e-mail/telefone já existam em outro parceiro
    try {
      const duplicates = await findPartnerDuplicates({
        excludeId: (formData as any)?.id || null,
        email: email || null,
        telefone: telDigits || null,
        celular: celDigits || null,
      });
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      if (duplicates.length > 0) {
        const list = duplicates
          .slice(0, 5)
          .map((d) => `• ${d.nome}${d.doc_unico ? ` (${d.doc_unico})` : ''}`)
          .join('\n');
        const ok = await confirm({
          title: 'Possível duplicidade',
          description:
            `Encontramos ${duplicates.length} parceiro(s) com o mesmo e-mail/telefone.\n\n${list}\n\nDeseja salvar mesmo assim?`,
          confirmText: 'Salvar mesmo assim',
          cancelText: 'Revisar',
          variant: 'primary',
        });
        if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
        if (!ok) {
          setActiveTab('contato');
          return;
        }
      }
    } catch {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      // best-effort: não bloqueia o save
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
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      
      addToast('Salvo com sucesso!', 'success');
      onSaveSuccess(savedPartner);
    } catch (error: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(error.message, 'error');
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
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
          <Button type="button" onClick={handleSave} disabled={isSaving || authLoading || !activeEmpresaId || empresaChanged}>
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            <span className="ml-2">Salvar</span>
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default PartnerFormPanel;
