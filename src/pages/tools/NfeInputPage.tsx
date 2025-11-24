import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { XMLParser } from 'fast-xml-parser';
import { FileUp, Loader2, AlertTriangle, CheckCircle, Save, Link as LinkIcon, ArrowRight, RefreshCw } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { useToast } from '@/contexts/ToastProvider';
import { 
  registerNfeImport, 
  previewBeneficiamento, 
  processBeneficiamentoImport, 
  NfeImportPayload, 
  PreviewResult, 
  MatchItem 
} from '@/services/nfeInput';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';

// Helper para acesso seguro a propriedades aninhadas
const get = (obj: any, path: string, defaultValue: any = null) => {
  return path.split('.').reduce((acc, part) => acc && acc[part], obj) || defaultValue;
};

const InfoItem: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  value ? (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-md font-semibold text-gray-800 break-words">{value}</p>
    </div>
  ) : null
);

export default function NfeInputPage() {
  const { addToast } = useToast();
  
  // Estado do Arquivo e Parsing
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [nfeData, setNfeData] = useState<any | null>(null);
  
  // Estado do Processo
  const [step, setStep] = useState<'upload' | 'review' | 'matching' | 'success'>('upload');
  const [loading, setLoading] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [manualMatches, setManualMatches] = useState<Record<string, string>>({}); // item_id -> produto_id

  // Parsing do XML
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setLoading(true);
    const file = acceptedFiles[0];
    setXmlFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const xmlData = e.target?.result as string;
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
        const jsonData = parser.parse(xmlData);
        
        // Suporte a nfeProc (com protocolo) ou NFe direta
        const root = jsonData.nfeProc ? jsonData.nfeProc.NFe : jsonData.NFe;
        const infNFe = root?.infNFe;

        if (!infNFe) {
          throw new Error('Estrutura do XML inválida: tag <infNFe> não encontrada.');
        }

        setNfeData(jsonData);
        setStep('review');
        addToast('XML lido com sucesso. Revise os dados antes de importar.', 'info');
      } catch (err: any) {
        addToast(err.message || 'Falha ao processar o arquivo XML.', 'error');
        setXmlFile(null);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  }, [addToast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/xml': ['.xml'] },
    multiple: false,
    disabled: loading || step !== 'upload',
  });

  // Passo 1: Registrar Importação
  const handleRegister = async () => {
    if (!nfeData) return;
    setLoading(true);

    try {
      const root = nfeData.nfeProc ? nfeData.nfeProc.NFe : nfeData.NFe;
      const infNFe = root.infNFe;
      
      // Extração de itens (pode ser array ou objeto único)
      let det = infNFe.det;
      if (!Array.isArray(det)) det = [det];

      const itemsPayload = det.map((d: any) => ({
        n_item: parseInt(d['@_nItem']),
        cprod: get(d, 'prod.cProd'),
        ean: get(d, 'prod.cEAN'),
        xprod: get(d, 'prod.xProd'),
        ncm: get(d, 'prod.NCM'),
        cfop: get(d, 'prod.CFOP'),
        ucom: get(d, 'prod.uCom'),
        qcom: parseFloat(get(d, 'prod.qCom')),
        vuncom: parseFloat(get(d, 'prod.vUnCom')),
        vprod: parseFloat(get(d, 'prod.vProd')),
        // Tributos básicos (simplificado)
        cst: get(d, 'imposto.ICMS.ICMS00.CST') || get(d, 'imposto.ICMS.ICMSSN101.CSOSN'),
      }));

      const payload: NfeImportPayload = {
        chave_acesso: (infNFe['@_Id'] || '').replace('NFe', ''),
        numero: get(infNFe, 'ide.nNF'),
        serie: get(infNFe, 'ide.serie'),
        emitente_cnpj: get(infNFe, 'emit.CNPJ'),
        emitente_nome: get(infNFe, 'emit.xNome'),
        destinat_cnpj: get(infNFe, 'dest.CNPJ'),
        destinat_nome: get(infNFe, 'dest.xNome'),
        data_emissao: get(infNFe, 'ide.dhEmi'),
        total_produtos: parseFloat(get(infNFe, 'total.ICMSTot.vProd')),
        total_nf: parseFloat(get(infNFe, 'total.ICMSTot.vNF')),
        items: itemsPayload,
        origem_upload: 'xml'
      };

      const id = await registerNfeImport(payload);
      setImportId(id);
      
      // Carregar preview para matching
      const preview = await previewBeneficiamento(id);
      setPreviewData(preview);
      
      setStep('matching');
      addToast('Nota registrada! Verifique os vínculos dos produtos.', 'success');
    } catch (e: any) {
      console.error('[NFE_IMPORT_ERROR]', e);
      
      // Tratamento específico para erro de cache do PostgREST
      if (
        e.message?.includes('Could not find the function') || 
        e.message?.includes('schema cache') ||
        e.message?.includes('function public.fiscal_nfe_import_register')
      ) {
        addToast('O banco de dados está atualizando a estrutura. Por favor, aguarde 30 segundos e tente novamente.', 'warning');
      } else if (e.message?.includes('chave_acesso')) {
        addToast('Erro nos dados da nota: Chave de acesso inválida ou ausente.', 'error');
      } else {
        addToast(e.message || 'Erro ao registrar a nota. Verifique o console para detalhes.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Passo 2: Processar Entrada
  const handleProcess = async () => {
    if (!importId || !previewData) return;

    // Verificar se todos os itens têm match
    const missingMatch = previewData.itens.some(item => 
      !item.match_produto_id && !manualMatches[item.item_id]
    );

    if (missingMatch) {
      addToast('Existem itens sem produto vinculado. Por favor, vincule todos os itens.', 'warning');
      return;
    }

    setLoading(true);
    try {
      // Preparar array de matches manuais
      const matches: MatchItem[] = Object.entries(manualMatches).map(([itemId, prodId]) => ({
        item_id: itemId,
        produto_id: prodId
      }));

      await processBeneficiamentoImport(importId, matches);
      setStep('success');
      addToast('Entrada de beneficiamento processada com sucesso!', 'success');
    } catch (e: any) {
      console.error(e);
      addToast(e.message || 'Erro ao processar entrada.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleMatchSelect = (itemId: string, product: any) => {
    setManualMatches(prev => ({ ...prev, [itemId]: product.id }));
  };

  // Renderização
  return (
    <div className="p-1">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Entrada de Beneficiamento (NF-e)</h1>
      <p className="text-gray-600 mb-6">Importe o XML da nota fiscal para registrar a entrada de insumos de terceiros.</p>

      {/* Stepper */}
      <div className="flex items-center mb-8 text-sm font-medium text-gray-500">
        <div className={`flex items-center gap-2 ${step === 'upload' ? 'text-blue-600' : ''}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step === 'upload' ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>1</span>
          Upload
        </div>
        <div className="w-8 h-px bg-gray-300 mx-2" />
        <div className={`flex items-center gap-2 ${step === 'review' ? 'text-blue-600' : ''}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step === 'review' ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>2</span>
          Revisão
        </div>
        <div className="w-8 h-px bg-gray-300 mx-2" />
        <div className={`flex items-center gap-2 ${step === 'matching' ? 'text-blue-600' : ''}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step === 'matching' ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>3</span>
          Vínculos
        </div>
        <div className="w-8 h-px bg-gray-300 mx-2" />
        <div className={`flex items-center gap-2 ${step === 'success' ? 'text-green-600' : ''}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step === 'success' ? 'border-green-600 bg-green-50' : 'border-gray-300'}`}>4</span>
          Conclusão
        </div>
      </div>

      <GlassCard className="p-6 md:p-8 min-h-[400px]">
        
        {/* STEP 1: UPLOAD */}
        {step === 'upload' && (
          <div
            {...getRootProps()}
            className={`flex flex-col items-center justify-center w-full h-80 border-2 border-dashed rounded-xl cursor-pointer transition-colors duration-200
              ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50/50 hover:border-gray-400'}
              ${loading ? 'cursor-wait opacity-50' : ''}`}
          >
            <input {...getInputProps()} />
            {loading ? (
              <div className="text-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
                <p className="mt-4 font-semibold text-blue-600">Lendo arquivo...</p>
              </div>
            ) : (
              <div className="text-center text-gray-500">
                <FileUp className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-semibold text-gray-700">Arraste o XML da NF-e aqui</p>
                <p className="my-2 text-sm">ou clique para selecionar</p>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: REVIEW */}
        {step === 'review' && nfeData && (
          <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-blue-800 text-lg">Resumo da Nota</h3>
                <p className="text-blue-600 text-sm">Verifique se os dados conferem com o documento físico.</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-blue-500 uppercase font-bold">Valor Total</p>
                <p className="text-2xl font-bold text-blue-800">
                  R$ {parseFloat(get(nfeData, 'nfeProc.NFe.infNFe.total.ICMSTot.vNF') || get(nfeData, 'NFe.infNFe.total.ICMSTot.vNF')).toFixed(2)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-gray-700 mb-3">Emitente</h4>
                <InfoItem label="Razão Social" value={get(nfeData, 'nfeProc.NFe.infNFe.emit.xNome') || get(nfeData, 'NFe.infNFe.emit.xNome')} />
                <InfoItem label="CNPJ" value={get(nfeData, 'nfeProc.NFe.infNFe.emit.CNPJ') || get(nfeData, 'NFe.infNFe.emit.CNPJ')} />
              </div>
              <div className="p-4 border rounded-lg">
                <h4 className="font-semibold text-gray-700 mb-3">Dados da Nota</h4>
                <InfoItem label="Número / Série" value={`${get(nfeData, 'nfeProc.NFe.infNFe.ide.nNF') || get(nfeData, 'NFe.infNFe.ide.nNF')} / ${get(nfeData, 'nfeProc.NFe.infNFe.ide.serie') || get(nfeData, 'NFe.infNFe.ide.serie')}`} />
                <InfoItem label="Chave de Acesso" value={(get(nfeData, 'nfeProc.NFe.infNFe.@_Id') || get(nfeData, 'NFe.infNFe.@_Id'))?.replace('NFe', '')} />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button 
                onClick={() => { setStep('upload'); setNfeData(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button 
                onClick={handleRegister}
                disabled={loading}
                className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                Confirmar e Importar
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: MATCHING */}
        {step === 'matching' && previewData && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Vincular Produtos</h3>
              <span className="text-sm text-gray-500">
                {previewData.itens.length} itens encontrados
              </span>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item (XML)</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Qtd.</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vínculo no Sistema</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewData.itens.map((item) => {
                    const isMatched = !!item.match_produto_id || !!manualMatches[item.item_id];
                    return (
                      <tr key={item.item_id} className={isMatched ? 'bg-green-50/30' : 'bg-red-50/30'}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{item.xprod}</p>
                          <p className="text-xs text-gray-500">Cód: {item.cprod} | EAN: {item.ean || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-700">
                          {item.qcom} <span className="text-xs text-gray-500">{item.ucom}</span>
                        </td>
                        <td className="px-4 py-3">
                          {item.match_produto_id ? (
                            <div className="flex items-center gap-2 text-sm text-green-700">
                              <CheckCircle size={16} />
                              <span>Produto encontrado automaticamente</span>
                              <span className="text-xs bg-green-100 px-2 py-0.5 rounded-full capitalize">
                                {item.match_strategy}
                              </span>
                            </div>
                          ) : (
                            <div className="w-full max-w-xs">
                              <ItemAutocomplete 
                                onSelect={(prod) => handleMatchSelect(item.item_id, prod)}
                                placeholder="Buscar produto para vincular..."
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isMatched ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Pronto
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Pendente
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button 
                onClick={handleProcess}
                disabled={loading}
                className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Save />}
                Processar Entrada no Estoque
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: SUCCESS */}
        {step === 'success' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Importação Concluída!</h2>
            <p className="text-gray-600 mb-8 max-w-md">
              A entrada de beneficiamento foi registrada e o estoque foi atualizado com sucesso.
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => { setStep('upload'); setNfeData(null); setXmlFile(null); setPreviewData(null); setManualMatches({}); }}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Importar Outra Nota
              </button>
              <a 
                href="/app/suprimentos/estoque"
                className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
              >
                Ver Estoque
              </a>
            </div>
          </div>
        )}

      </GlassCard>
    </div>
  );
}
