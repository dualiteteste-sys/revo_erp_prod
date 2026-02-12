import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, Loader2, Save } from 'lucide-react';
import { Database } from '../../types/database.types';
import { useToast } from '../../contexts/ToastProvider';
import DadosGeraisTab from './form-tabs/DadosGeraisTab';
import AdditionalDataTab from './form-tabs/AdditionalDataTab';
import MediaTab from './form-tabs/MediaTab';
import SeoTab from './form-tabs/SeoTab';
import OthersTab from './form-tabs/OthersTab';
import VariacoesTab from './form-tabs/VariacoesTab';
import PrecosTab from './form-tabs/PrecosTab';
import WooCommerceChannelTab from './form-tabs/WooCommerceChannelTab';
import { normalizeProductPayload } from '@/services/products.normalize';
import { validatePackaging } from '@/services/products.validate';
import { useAuth } from '@/contexts/AuthProvider';

export type ProductFormData = Partial<Database['public']['Tables']['produtos']['Row']>;

interface FormErrors {
  nome?: string;
}

interface ProductFormPanelProps {
  product: ProductFormData | null;
  initialValues?: Partial<ProductFormData>;
  onSaveSuccess: (savedProduct: ProductFormData) => void;
  onClose: () => void;
  saveProduct: (formData: ProductFormData) => Promise<ProductFormData>;
}

const tabs = ['Dados Gerais', 'Canais / WooCommerce', 'Variações', 'Preço por Quantidade', 'Dados Complementares', 'Mídia', 'SEO', 'Outros'];

const ProductFormPanel: React.FC<ProductFormPanelProps> = ({ product, initialValues, onSaveSuccess, onClose, saveProduct }) => {
  const { addToast } = useToast();
  const { loading: authLoading, activeEmpresaId } = useAuth();
  const [formData, setFormData] = useState<ProductFormData>({});
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const lastEmpresaIdRef = useRef<string | null>(activeEmpresaId);
  const empresaChanged = lastEmpresaIdRef.current !== activeEmpresaId;
  const actionTokenRef = useRef(0);

  useEffect(() => {
    if (product) {
      setFormData(product);
    } else {
      const base: ProductFormData = {
        tipo: 'simples',
        status: 'ativo',
        unidade: 'un',
        preco_venda: 0,
        moeda: 'BRL',
        icms_origem: 0,
        tipo_embalagem: 'outro',
        controla_estoque: true,
        permitir_inclusao_vendas: true,
        controlar_lotes: false,
        pode_comprar: false,
        pode_vender: false,
        pode_produzir: false,
        rastreio_lote: false,
        rastreio_serial: false,
      };
      setFormData({ ...base, ...(initialValues || {}) });
    }
  }, [product, initialValues]);

  useEffect(() => {
    const prevEmpresaId = lastEmpresaIdRef.current;
    if (prevEmpresaId === activeEmpresaId) return;
    actionTokenRef.current += 1;
    setIsSaving(false);
    setActiveTab(tabs[0]);
    lastEmpresaIdRef.current = activeEmpresaId;
  }, [activeEmpresaId]);

  useEffect(() => {
    const newErrors: FormErrors = {};
    if (!formData.nome || formData.nome.trim() === '') {
      newErrors.nome = 'O nome do produto é obrigatório.';
    }
    setErrors(newErrors);
  }, [formData.nome]);

  const isSaveDisabled = useMemo(() => {
    if (isSaving) return true;
    // A validação em tempo real agora checa apenas os erros principais (nome).
    return Object.keys(errors).length > 0;
  }, [isSaving, errors]);

  const handleFormChange = (field: any, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isService = useMemo(() => String((formData as any).tipo ?? '') === 'servico', [formData.tipo]);

  const visibleTabs = useMemo(() => {
    if (isService) {
      return ['Dados Gerais', 'Outros']; // Services usually don't need Media, SEO, Additional Data in this context
    }
    return tabs;
  }, [isService]);

  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [visibleTabs, activeTab]);

  const handleSave = async () => {
    if (authLoading || !activeEmpresaId || empresaChanged) {
      addToast('Aguarde a troca de empresa concluir para salvar.', 'info');
      return;
    }
    if (Object.keys(errors).length > 0) {
      addToast('Por favor, corrija os erros no formulário.', 'warning');
      setActiveTab('Dados Gerais');
      return;
    }

    // Skip packaging validation for services
    if (!isService) {
      const normalizedForSubmit = normalizeProductPayload(formData);
      const finalValidationErrors = validatePackaging(normalizedForSubmit);

      if (finalValidationErrors.length > 0) {
        addToast(`Dados de embalagem inválidos: ${finalValidationErrors.join(', ')}`, 'warning');
        setActiveTab('Dados Gerais');
        return;
      }
    }

    const token = ++actionTokenRef.current;
    const empresaSnapshot = activeEmpresaId;
    setIsSaving(true);
    try {
      const savedProduct = await saveProduct(formData);
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      addToast(`${isService ? 'Serviço' : 'Produto'} salvo com sucesso!`, 'success');
      setFormData(savedProduct);
      onSaveSuccess(savedProduct);
    } catch (error: any) {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      console.error(error);
      if (error.code === 'CLIENT_VALIDATION') {
        addToast(error.message.replace('[VALIDATION] ', ''), 'warning');
        setActiveTab('Dados Gerais');
      } else {
        addToast(error.message || `Erro ao salvar o ${isService ? 'serviço' : 'produto'}`, 'error');
      }
    } finally {
      if (token !== actionTokenRef.current || empresaSnapshot !== lastEmpresaIdRef.current) return;
      setIsSaving(false);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Dados Gerais':
        return <DadosGeraisTab data={formData} onChange={handleFormChange} errors={errors} isService={isService} />;
      case 'Variações':
        return <VariacoesTab produtoId={formData.id} produtoPaiId={formData.produto_pai_id} skuBase={formData.sku} />;
      case 'Canais / WooCommerce':
        return <WooCommerceChannelTab data={formData} />;
      case 'Preço por Quantidade':
        return <PrecosTab produtoId={formData.id} />;
      case 'Outros':
        return <OthersTab data={formData} onChange={handleFormChange} />;
      case 'Dados Complementares':
        return <AdditionalDataTab data={formData} onChange={handleFormChange} />;
      case 'Mídia':
        if (formData.id && formData.empresa_id) {
          return <MediaTab produtoId={formData.id} empresaId={formData.empresa_id} />;
        }
        return (
          <div className="flex flex-col items-center justify-center text-center p-8 h-full bg-gray-50 rounded-lg">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mb-4" />
            <h3 className="text-lg font-semibold text-gray-800">Salve o {isService ? 'serviço' : 'produto'} primeiro</h3>
            <p className="text-gray-600 mt-2">
              Você precisa salvar o {isService ? 'serviço' : 'produto'} na aba "Dados Gerais" antes de poder adicionar imagens.
            </p>
          </div>
        );
      case 'SEO':
        return <SeoTab data={formData} onChange={handleFormChange} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-white/20">
        <nav className="-mb-px flex space-x-4 overflow-x-auto p-4" aria-label="Tabs">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`${activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {renderTabContent()}
      </div>
      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20">
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
            disabled={isSaveDisabled || authLoading || !activeEmpresaId || empresaChanged}
            className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Salvar {isService ? 'Serviço' : 'Produto'}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ProductFormPanel;
