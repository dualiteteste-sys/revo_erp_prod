import React, { useState, useEffect } from 'react';
import { Loader2, Save, Plus, Trash2, Package } from 'lucide-react';
import { BomDetails, BomPayload, saveBom, manageBomComponente, getBomDetails, BomComponente } from '@/services/industriaBom';
import { useToast } from '@/contexts/ToastProvider';
import { listUnidades, UnidadeMedida } from '@/services/unidades';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import Toggle from '@/components/ui/forms/Toggle';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import DecimalInput from '@/components/ui/forms/DecimalInput';
import { motion, AnimatePresence } from 'framer-motion';
// ... existing imports

// Inside the component return
// ... (removed duplicate lines)

interface Props {
  bomId: string | null;
  initialData?: Partial<BomDetails> | null;
  onSaveSuccess: () => void;
  onClose: () => void;
}

export default function BomFormPanel({ bomId, initialData, onSaveSuccess, onClose }: Props) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(!!bomId);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'dados' | 'componentes'>('dados');
  const [unidades, setUnidades] = useState<UnidadeMedida[]>([]);

  const [formData, setFormData] = useState<Partial<BomDetails>>({
    tipo_bom: 'producao',
    versao: 1,
    ativo: true,
    padrao_para_producao: true,
    padrao_para_beneficiamento: false,
    componentes: []
  });

  useEffect(() => {
    // Fetch units
    listUnidades().then(setUnidades).catch(console.error);

    if (bomId) {
      loadDetails();
    } else if (initialData) {
      setFormData({
        ...initialData,
        componentes: initialData.componentes || []
      });
      console.log('Dados iniciais carregados (Clonagem):', initialData);
      setLoading(false);

      // If cloning, we might want to ensure components tab is accessible if there are components
      if (initialData.componentes && initialData.componentes.length > 0) {
        // Just let them start at dados, but maybe verify IDs are stripped
      }
    } else {
      // Reset for new
      setFormData({
        tipo_bom: 'producao',
        versao: 1,
        ativo: true,
        padrao_para_producao: true,
        padrao_para_beneficiamento: false,
        componentes: []
      });
      setLoading(false);
    }
  }, [bomId, initialData]);

  const loadDetails = async (id?: string) => {
    const targetId = id || bomId || formData.id;
    if (!targetId) return;

    try {
      const data = await getBomDetails(targetId);
      setFormData(data);
    } catch (e) {
      console.error(e);
      addToast('Erro ao carregar BOM.', 'error');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderChange = (field: keyof BomPayload, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleProductSelect = (item: any) => {
    handleHeaderChange('produto_final_id', item.id);
    // produto_nome is not in BomPayload, need to handle separately if needed for UI, but formData is Partial<BomDetails>
    setFormData(prev => ({ ...prev, produto_nome: item.descricao }));
  };

  const handleSaveHeader = async () => {
    if (!formData.produto_final_id) {
      addToast('Selecione um produto final.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const payload: BomPayload = {
        id: formData.id,
        produto_final_id: formData.produto_final_id,
        tipo_bom: formData.tipo_bom,
        codigo: formData.codigo,
        descricao: formData.descricao,
        versao: formData.versao,
        ativo: formData.ativo,
        padrao_para_producao: formData.padrao_para_producao,
        padrao_para_beneficiamento: formData.padrao_para_beneficiamento,
        data_inicio_vigencia: formData.data_inicio_vigencia,
        data_fim_vigencia: formData.data_fim_vigencia,
        observacoes: formData.observacoes
      };

      const saved = await saveBom(payload);
      setFormData(prev => ({ ...prev, ...saved }));

      if (!formData.id) {
        addToast('BOM criada! Adicione os componentes.', 'success');
        setActiveTab('componentes');
        onSaveSuccess(); // Notify parent on first save
      } else {
        addToast('BOM salva.', 'success');
        onSaveSuccess(); // Notify parent on updates too
      }
      return saved.id;
    } catch (e: any) {
      addToast(e.message, 'error');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // --- Componentes ---
  const handleAddComponente = async (item: any) => {
    let currentId = formData.id;
    if (!currentId) {
      currentId = await handleSaveHeader();
      if (!currentId) return;
    }

    try {
      // Default to 'un' or first available unit if 'un' doesn't exist, though backend defaults too?
      const defaultUnit = item.unidade || 'un';
      await manageBomComponente(currentId!, null, item.id, 1, defaultUnit, 0, true, null, 'upsert');
      await loadDetails(currentId!);
      addToast('Componente adicionado.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleRemoveComponente = async (componenteId: string) => {
    const item = formData.componentes?.find(c => c.id === componenteId);
    if (!item) return;

    try {
      await manageBomComponente(formData.id!, componenteId, item.produto_id, 0, '', 0, false, null, 'delete');
      await loadDetails(formData.id!);
      addToast('Componente removido.', 'success');
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleUpdateComponente = async (componenteId: string, field: keyof BomComponente, value: any) => {
    // Immediate local update for responsiveness
    setFormData(prev => ({
      ...prev,
      componentes: prev.componentes?.map(c => c.id === componenteId ? { ...c, [field]: value } : c)
    }));

    // If it's a select or checkbox, persist immediately (UX expectation)
    // If it's a text/numeric input, this function shouldn't be called on every keystroke for persistence
    // But since this function WAS doing both, we need to split usage or handle it here.
    // For now, let's assume this is called for "commit" actions or we debounce it.
    // Actually, for Select/Checkbox we call this directly. For Inputs we need a separate handler or use onBlur.

    // Check if value is valid for persistence
    if (field === 'quantidade' && (value <= 0 || isNaN(value))) return;

    const item = formData.componentes?.find(c => c.id === componenteId);
    if (!item) return;

    // Merge with latest local state for the item (in case other fields changed)
    const updates = { ...item, [field]: value };

    try {
      await manageBomComponente(
        formData.id!,
        componenteId,
        item.produto_id,
        updates.quantidade,
        updates.unidade,
        updates.perda_percentual,
        updates.obrigatorio,
        updates.observacoes || null,
        'upsert'
      );
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleLocalUpdate = (componenteId: string, field: keyof BomComponente, value: any) => {
    setFormData(prev => ({
      ...prev,
      componentes: prev.componentes?.map(c => c.id === componenteId ? { ...c, [field]: value } : c)
    }));
  };

  const handleBlurUpdate = (componenteId: string) => {
    const item = formData.componentes?.find(c => c.id === componenteId);
    if (!item) return;

    // Trigger persistence with current state
    if (item.quantidade > 0) {
      handleUpdateComponente(componenteId, 'quantidade', item.quantidade);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-white/20">
        <nav className="-mb-px flex space-x-6 p-4 overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('dados')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${activeTab === 'dados'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
          >
            Dados Gerais
          </button>
          <button
            onClick={() => setActiveTab('componentes')}
            className={`whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm transition-colors ${activeTab === 'componentes'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            disabled={!formData.id}
          >
            Componentes ({formData.componentes?.length || 0})
          </button>
        </nav>
      </div>

      <div className="flex-grow p-6 overflow-y-auto scrollbar-styled">
        {activeTab === 'dados' && (
          <>
            <Section title="Identificação" description="Produto e versão da ficha técnica.">
              <div className="sm:col-span-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Produto Final</label>
                {formData.id ? (
                  <div className="p-3 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 flex items-center gap-2">
                    <Package size={16} />
                    {formData.produto_nome}
                  </div>
                ) : (
                  <ItemAutocomplete onSelect={handleProductSelect} clearOnSelect={false} />
                )}
              </div>
              <div className="sm:col-span-2">
                <Select label="Tipo" name="tipo_bom" value={formData.tipo_bom} onChange={e => handleHeaderChange('tipo_bom', e.target.value)} disabled={!!formData.id}>
                  <option value="producao">Produção</option>
                  <option value="beneficiamento">Beneficiamento</option>
                </Select>
              </div>
              <Input
                label="Código Interno"
                name="codigo"
                value={formData.codigo || ''}
                onChange={e => handleHeaderChange('codigo', e.target.value)}
                className="sm:col-span-2"
                placeholder="Ex: FT-001"
              />
              <Input
                label="Versão"
                name="versao"
                type="number"
                value={formData.versao || 1}
                onChange={e => handleHeaderChange('versao', parseInt(e.target.value))}
                className="sm:col-span-1"
              />
              <Input
                label="Descrição"
                name="descricao"
                value={formData.descricao || ''}
                onChange={e => handleHeaderChange('descricao', e.target.value)}
                className="sm:col-span-3"
                placeholder="Ex: Versão padrão 2025"
              />
            </Section>

            <Section title="Configurações" description="Vigência e aplicação.">
              <div className="sm:col-span-6 flex flex-wrap gap-6">
                <Toggle
                  label="Ativo"
                  name="ativo"
                  checked={formData.ativo !== false}
                  onChange={checked => handleHeaderChange('ativo', checked)}
                />
                {formData.tipo_bom === 'producao' && (
                  <Toggle
                    label="Padrão para Produção"
                    name="padrao_prod"
                    checked={formData.padrao_para_producao || false}
                    onChange={checked => handleHeaderChange('padrao_para_producao', checked)}
                  />
                )}
                {formData.tipo_bom === 'beneficiamento' && (
                  <Toggle
                    label="Padrão para Beneficiamento"
                    name="padrao_benef"
                    checked={formData.padrao_para_beneficiamento || false}
                    onChange={checked => handleHeaderChange('padrao_para_beneficiamento', checked)}
                  />
                )}
              </div>

              <Input label="Início Vigência" type="date" value={formData.data_inicio_vigencia || ''} onChange={e => handleHeaderChange('data_inicio_vigencia', e.target.value)} className="sm:col-span-3" />
              <Input label="Fim Vigência" type="date" value={formData.data_fim_vigencia || ''} onChange={e => handleHeaderChange('data_fim_vigencia', e.target.value)} className="sm:col-span-3" />

              <TextArea label="Observações" name="obs" value={formData.observacoes || ''} onChange={e => handleHeaderChange('observacoes', e.target.value)} rows={3} className="sm:col-span-6" />
            </Section>
          </>
        )}

        {activeTab === 'componentes' && (
          <Section title="Lista de Materiais (BOM)" description="Insumos necessários para produzir 1 unidade.">
            <div className="sm:col-span-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Adicionar Componente</label>
                <ItemAutocomplete onSelect={handleAddComponente} />
              </div>

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Qtd.</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Un.</th>
                      <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Perda %</th>
                      <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">Obrig.</th>
                      <th className="px-3 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <AnimatePresence>
                      {formData.componentes?.map((item) => (
                        <motion.tr
                          key={item.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="hover:bg-gray-50"
                        >
                          <td className="px-3 py-2 text-sm text-gray-900">
                            {item.produto_nome}
                          </td>
                          <td className="px-3 py-2">
                            <DecimalInput
                              value={item.quantidade}
                              onChange={val => handleLocalUpdate(item.id, 'quantidade', val)}
                              onBlur={() => handleBlurUpdate(item.id)}
                              precision={4}
                              className="text-right min-w-[80px]"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={item.unidade}
                              onChange={e => handleUpdateComponente(item.id, 'unidade', e.target.value)}
                              className="w-full text-center p-1 border rounded text-sm bg-white outline-none focus:ring-1 focus:ring-blue-500 appearance-none cursor-pointer"
                              style={{ textAlignLast: 'center' }}
                            >
                              {unidades.map(u => (
                                <option key={u.id} value={u.sigla}>{u.sigla}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <DecimalInput
                              value={item.perda_percentual}
                              onChange={val => handleLocalUpdate(item.id, 'perda_percentual', val)}
                              onBlur={() => handleBlurUpdate(item.id)}
                              precision={2}
                              className="text-right min-w-[80px]"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={item.obrigatorio}
                              onChange={e => handleUpdateComponente(item.id, 'obrigatorio', e.target.checked)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => handleRemoveComponente(item.id)} className="text-red-500 hover:text-red-700">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {formData.componentes?.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-gray-500">Nenhum componente adicionado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
        )}
      </div>

      <footer className="flex-shrink-0 p-4 flex justify-end items-center border-t border-white/20 bg-gray-50">
        <div className="flex gap-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button
            onClick={handleSaveHeader}
            disabled={isSaving}
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
