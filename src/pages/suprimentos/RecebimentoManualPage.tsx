import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Trash2, Save, ArrowLeft, Package } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { registerNfeImport, NfeImportPayload } from '@/services/nfeInput';
import { createRecebimentoFromXml, listRecebimentoItens, updateRecebimentoItemProduct } from '@/services/recebimento';
import GlassCard from '@/components/ui/GlassCard';
import Section from '@/components/ui/forms/Section';
import Input from '@/components/ui/forms/Input';
import ClienteFornecedorAutocomplete from '@/components/common/ClienteFornecedorAutocomplete';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import UnidadeMedidaSelect from '@/components/common/UnidadeMedidaSelect';
import { OsItemSearchResult } from '@/services/os';

type ManualItem = {
  id: string; // temp id for UI
  codigo_externo: string;
  descricao_externa: string;
  quantidade: number;
  unidade: string;
  valor_unitario: number;
  produto_interno_id?: string;
  produto_interno_nome?: string;
};

export default function RecebimentoManualPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  // Header Data
  const [emitenteId, setEmitenteId] = useState<string | null>(null);
  const [emitenteNome, setEmitenteNome] = useState('');
  const [numeroNota, setNumeroNota] = useState('');
  const [serieNota, setSerieNota] = useState('');
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().split('T')[0]);

  // Items Data
  const [items, setItems] = useState<ManualItem[]>([]);

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        codigo_externo: '',
        descricao_externa: '',
        quantidade: 1,
        unidade: 'UN',
        valor_unitario: 0
      }
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof ManualItem, value: any) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleLinkProduct = (itemId: string, product: OsItemSearchResult) => {
    setItems(prev => prev.map(i => i.id === itemId ? {
      ...i,
      produto_interno_id: product.id,
      produto_interno_nome: product.descricao,
      // Auto-fill description if empty
      descricao_externa: i.descricao_externa || product.descricao,
      unidade: i.unidade === 'UN' && product.unidade ? product.unidade : i.unidade
    } : i));
  };

  const handleSave = async () => {
    if (!emitenteId) {
      addToast('Selecione o Cliente/Fornecedor.', 'error');
      return;
    }
    if (!numeroNota) {
      addToast('Informe o número do documento.', 'error');
      return;
    }
    if (items.length === 0) {
      addToast('Adicione pelo menos um item.', 'error');
      return;
    }

    setLoading(true);
    try {
      // 1. Construct Payload similar to NFe Import
      const nfePayload: NfeImportPayload = {
        chave_acesso: `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        origem_upload: 'xml', // Treat as XML to reuse logic, or adjust backend to accept 'manual'
        numero: numeroNota,
        serie: serieNota,
        emitente_nome: emitenteNome,
        // emitente_cnpj: fetched from DB in backend or we assume ID is enough for now 
        // (In a real scenario we might need the CNPJ, but for manual entry ID is safer linkage)
        data_emissao: dataEmissao,
        total_produtos: items.reduce((acc, i) => acc + (i.quantidade * i.valor_unitario), 0),
        total_nf: items.reduce((acc, i) => acc + (i.quantidade * i.valor_unitario), 0),
        items: items.map((item, index) => ({
          n_item: index + 1,
          cprod: item.codigo_externo || `ITEM-${index + 1}`,
          xprod: item.descricao_externa,
          qcom: item.quantidade,
          ucom: item.unidade,
          vuncom: item.valor_unitario,
          vprod: item.quantidade * item.valor_unitario,
        }))
      };

      // 2. Register "Import"
      const importId = await registerNfeImport(nfePayload);

      // 3. Create Receipt (Pre-Note)
      const { id: recebimentoId } = await createRecebimentoFromXml(importId);

      // 4. Link Internal Products
      // We need to fetch the created items to match them by sequence (n_item)
      const createdItems = await listRecebimentoItens(recebimentoId);
      
      // Map manual items to created items by index (since we sent them in order)
      // n_item in payload = index + 1
      const updatePromises = items.map(async (manualItem, index) => {
        if (manualItem.produto_interno_id) {
          // Find corresponding DB item. 
          // Note: listRecebimentoItens might not return in order, but we can rely on fiscal_nfe_import_items.n_item if available, 
          // or we assume the order if we implement a robust matcher.
          // For now, let's assume we can match by the product code we sent.
          const codeSent = manualItem.codigo_externo || `ITEM-${index + 1}`;
          const dbItem = createdItems.find(ci => ci.fiscal_nfe_import_items?.cprod === codeSent);
          
          if (dbItem) {
            await updateRecebimentoItemProduct(dbItem.id, manualItem.produto_interno_id);
          }
        }
      });

      await Promise.all(updatePromises);

      addToast('Recebimento criado com sucesso!', 'success');
      navigate(`/app/suprimentos/recebimento/${recebimentoId}`);

    } catch (e: any) {
      console.error(e);
      addToast(e.message || 'Erro ao criar recebimento.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft size={20} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Novo Recebimento Manual</h1>
          <p className="text-gray-600 text-sm mt-1">Entrada de materiais sem XML (Talão, Avulso, etc).</p>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto scrollbar-styled pb-20">
        <GlassCard className="p-6 mb-6">
          <Section title="Dados do Documento" description="Informações básicas da nota ou documento de remessa.">
            <div className="sm:col-span-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente / Fornecedor</label>
              <ClienteFornecedorAutocomplete
                value={emitenteId} 
                onChange={(id, name) => {
                  setEmitenteId(id);
                  if (name) setEmitenteNome(name);
                }}
                placeholder="Buscar parceiro..."
              />
            </div>
            <Input 
              label="Número Doc." 
              name="numero" 
              value={numeroNota} 
              onChange={e => setNumeroNota(e.target.value)} 
              className="sm:col-span-2"
              placeholder="Ex: 12345"
            />
            <Input 
              label="Série" 
              name="serie" 
              value={serieNota} 
              onChange={e => setSerieNota(e.target.value)} 
              className="sm:col-span-2"
            />
            <Input 
              label="Data Emissão" 
              name="data" 
              type="date" 
              value={dataEmissao} 
              onChange={e => setDataEmissao(e.target.value)} 
              className="sm:col-span-2"
            />
          </Section>
        </GlassCard>

        <GlassCard className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Itens do Documento</h3>
            <button 
              onClick={handleAddItem}
              className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"
            >
              <Plus size={16} /> Adicionar Item
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={item.id} className="bg-gray-50/50 border border-gray-200 rounded-xl p-4 transition-all hover:shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  
                  {/* Linha 1: Identificação Externa */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Cód. Externo</label>
                    <input 
                      className="w-full p-2 border rounded-md text-sm"
                      value={item.codigo_externo}
                      onChange={e => handleUpdateItem(item.id, 'codigo_externo', e.target.value)}
                      placeholder="Cód. no Cliente"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Descrição Externa (Na Nota)</label>
                    <input 
                      className="w-full p-2 border rounded-md text-sm"
                      value={item.descricao_externa}
                      onChange={e => handleUpdateItem(item.id, 'descricao_externa', e.target.value)}
                      placeholder="Descrição conforme documento"
                    />
                  </div>

                  {/* Linha 1: Quantidades */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Quantidade</label>
                    <input 
                      type="number"
                      className="w-full p-2 border rounded-md text-sm"
                      value={item.quantidade}
                      onChange={e => handleUpdateItem(item.id, 'quantidade', parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Un.</label>
                    <UnidadeMedidaSelect
                      label={null}
                      name={`unidade_${item.id}`}
                      uiSize="sm"
                      value={item.unidade}
                      onChange={(sigla) => handleUpdateItem(item.id, 'unidade', sigla || '')}
                      className="w-full"
                      placeholder="Selecione..."
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Valor Unit.</label>
                    <input 
                      type="number"
                      className="w-full p-2 border rounded-md text-sm"
                      value={item.valor_unitario}
                      onChange={e => handleUpdateItem(item.id, 'valor_unitario', parseFloat(e.target.value))}
                    />
                  </div>
                  
                  {/* Linha 2: Vínculo Interno */}
                  <div className="md:col-span-1 flex justify-center pt-8">
                    <div className="w-px h-8 bg-gray-300"></div>
                  </div>
                  
                  <div className="md:col-span-10 bg-blue-50/50 p-3 rounded-lg border border-blue-100 flex items-center gap-4">
                    <Package className="text-blue-500 flex-shrink-0" size={20} />
                    <div className="flex-grow">
                      <label className="block text-xs font-bold text-blue-700 mb-1">Vincular ao Produto Interno (Estoque)</label>
                      {item.produto_interno_id ? (
                        <div className="flex justify-between items-center bg-white p-2 rounded border border-blue-200">
                          <span className="text-sm font-medium text-gray-800">{item.produto_interno_nome}</span>
                          <button 
                            onClick={() => handleUpdateItem(item.id, 'produto_interno_id', null)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Alterar
                          </button>
                        </div>
                      ) : (
                        <ItemAutocomplete 
                          onSelect={(prod) => handleLinkProduct(item.id, prod)}
                          placeholder="Buscar produto no sistema..."
                          type="product"
                          onlySales={false}
                        />
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-1 flex justify-end pt-2">
                    <button 
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                      title="Remover item"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                </div>
              </div>
            ))}

            {items.length === 0 && (
              <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                <p>Nenhum item adicionado.</p>
                <button onClick={handleAddItem} className="text-blue-600 hover:underline mt-2">Adicionar o primeiro item</button>
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 flex justify-end gap-3 md:pl-80 z-10">
        <button 
          onClick={() => navigate(-1)}
          className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
        >
          Cancelar
        </button>
        <button 
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-bold shadow-lg shadow-green-600/20 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar e Conferir
        </button>
      </div>
    </div>
  );
}
