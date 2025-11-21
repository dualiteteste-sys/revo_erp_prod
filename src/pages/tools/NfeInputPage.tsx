import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { XMLParser } from 'fast-xml-parser';
import { FileUp, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { useToast } from '@/contexts/ToastProvider';

// Helper function to safely access nested properties
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

const NfeInputPage: React.FC = () => {
  const [nfeData, setNfeData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('dadosGerais');
  const { addToast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setLoading(true);
    setError(null);
    setNfeData(null);

    const file = acceptedFiles[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const xmlData = e.target?.result as string;
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
        const jsonData = parser.parse(xmlData);
        
        const infNFe = get(jsonData, 'nfeProc.NFe.infNFe');
        if (!infNFe) {
          throw new Error('Estrutura do XML inválida: tag <infNFe> não encontrada.');
        }

        setNfeData(jsonData);
        addToast('XML processado com sucesso!', 'success');
      } catch (err: any) {
        setError(err.message || 'Falha ao processar o arquivo XML.');
        addToast(err.message || 'Falha ao processar o arquivo XML.', 'error');
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Falha ao ler o arquivo.');
      addToast('Falha ao ler o arquivo.', 'error');
      setLoading(false);
    };

    reader.readAsText(file);
  }, [addToast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/xml': ['.xml'] },
    multiple: false,
    disabled: loading,
  });

  const handleImport = () => {
    addToast('Funcionalidade de importação será implementada em breve.', 'info');
  };

  const tabs = ['dadosGerais', 'produtos', 'transporte', 'faturas'];
  const tabLabels: { [key: string]: string } = {
    dadosGerais: 'Dados Gerais',
    produtos: 'Produtos',
    transporte: 'Transporte',
    faturas: 'Faturas',
  };

  const renderTabContent = () => {
    if (!nfeData) return null;
    const infNFe = get(nfeData, 'nfeProc.NFe.infNFe', {});
    
    switch (activeTab) {
      case 'dadosGerais':
        const ide = get(infNFe, 'ide', {});
        const emit = get(infNFe, 'emit', {});
        const dest = get(infNFe, 'dest', {});
        return (
          <div className="space-y-6">
            <InfoItem label="Chave de Acesso" value={infNFe['@_Id']?.replace('NFe', '')} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <InfoItem label="Número / Série" value={`${ide.nNF} / ${ide.serie}`} />
              <InfoItem label="Data de Emissão" value={ide.dhEmi ? new Date(ide.dhEmi).toLocaleString('pt-BR') : ''} />
              <InfoItem label="Valor Total da Nota" value={get(infNFe, 'total.ICMSTot.vNF') ? `R$ ${parseFloat(get(infNFe, 'total.ICMSTot.vNF')).toFixed(2)}` : ''} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6 border-t">
              <div>
                <h3 className="font-semibold text-lg mb-2">Emitente</h3>
                <InfoItem label="Nome / Razão Social" value={emit.xNome} />
                <InfoItem label="CNPJ" value={emit.CNPJ} />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">Destinatário</h3>
                <InfoItem label="Nome / Razão Social" value={dest.xNome} />
                <InfoItem label="CNPJ / CPF" value={dest.CNPJ || dest.CPF} />
              </div>
            </div>
          </div>
        );
      case 'produtos':
        let produtos = get(infNFe, 'det', []);
        if (!Array.isArray(produtos)) produtos = [produtos]; // Handle single product case
        return (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NCM</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CFOP</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Qtd.</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Vl. Unit.</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Vl. Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {produtos.map((item: any, index: number) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{get(item, 'prod.xProd')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{get(item, 'prod.NCM')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{get(item, 'prod.CFOP')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{parseFloat(get(item, 'prod.qCom')).toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{parseFloat(get(item, 'prod.vUnCom')).toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{parseFloat(get(item, 'prod.vProd')).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'transporte':
        const transp = get(infNFe, 'transp', {});
        return <div className="text-center p-8 text-gray-500">Modalidade: {get(transp, 'modFrete') === 0 ? 'Por conta do emitente' : 'Por conta do destinatário/remetente'}</div>;
      case 'faturas':
        return <div className="text-center p-8 text-gray-500">Dados de faturas/cobrança aparecerão aqui.</div>;
      default:
        return null;
    }
  };

  return (
    <div className="p-1">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Importar NFe de Entrada</h1>
      <GlassCard className="p-6 md:p-8">
        <div
          {...getRootProps()}
          className={`relative flex flex-col items-center justify-center w-full p-12 border-2 border-dashed rounded-xl cursor-pointer transition-colors duration-200
            ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50/50 hover:border-gray-400'}
            ${loading ? 'cursor-wait' : ''}`}
        >
          <input {...getInputProps()} />
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center">
                <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
                <p className="mt-4 font-semibold text-blue-600">Processando XML...</p>
              </motion.div>
            ) : error ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-red-600">
                <AlertTriangle className="w-12 h-12 mx-auto" />
                <p className="mt-4 font-semibold">Erro ao processar</p>
                <p className="text-sm">{error}</p>
              </motion.div>
            ) : nfeData ? (
                <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-green-600">
                    <CheckCircle className="w-12 h-12 mx-auto" />
                    <p className="mt-4 font-semibold">Arquivo carregado com sucesso!</p>
                    <p className="text-sm">Veja os dados abaixo ou arraste um novo arquivo.</p>
                </motion.div>
            ) : (
              <motion.div key="initial" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center text-gray-500">
                <FileUp className="w-12 h-12 mx-auto" />
                <p className="mt-4 font-semibold text-gray-700">Arraste e solte o arquivo XML da NF-e aqui</p>
                <p className="my-2">ou</p>
                <button type="button" className="font-semibold text-blue-600 hover:underline">Selecione o arquivo</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {nfeData && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-8"
            >
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                  {tabs.map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`${
                        activeTab === tab
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                      {tabLabels[tab]}
                    </button>
                  ))}
                </nav>
              </div>
              <div className="mt-6 bg-white/50 p-6 rounded-xl border border-gray-200">
                {renderTabContent()}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleImport}
                  className="bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Importar Nota Fiscal
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </div>
  );
};

export default NfeInputPage;
