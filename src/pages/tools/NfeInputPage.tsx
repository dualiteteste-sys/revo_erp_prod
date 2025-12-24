import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { XMLParser } from 'fast-xml-parser';
import { FileUp, Loader2, AlertTriangle, CheckCircle, Save, Link as LinkIcon, ArrowRight, RefreshCw } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { useToast } from '@/contexts/ToastProvider';
import { useNavigate } from 'react-router-dom';
import {
  registerNfeImport,
  previewBeneficiamento,
  NfeImportPayload,
  PreviewResult,
  MatchItem
} from '@/services/nfeInput';
import {
  conferirItem,
  createRecebimentoFromXml,
  finalizarRecebimentoV2,
  getRecebimento,
  listRecebimentoItens,
  setRecebimentoClassificacao,
  updateRecebimentoItemProduct,
} from '@/services/recebimento';
import ItemAutocomplete from '@/components/os/ItemAutocomplete';
import { getProductDetails } from '@/services/products';
import { savePartner, searchClients } from '@/services/partners';

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

type NfeInputPageProps = {
  embedded?: boolean;
  onRecebimentoReady?: (params: { recebimentoId: string; status: 'created' | 'exists' | 'reopened' }) => void;
  autoFinalizeMaterialCliente?: boolean;
};

export default function NfeInputPage({ embedded, onRecebimentoReady, autoFinalizeMaterialCliente }: NfeInputPageProps) {
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Estado do Arquivo e Parsing
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [nfeData, setNfeData] = useState<any | null>(null);

  // Estado do Processo
  const [step, setStep] = useState<'upload' | 'review' | 'matching' | 'conferencia' | 'success'>('upload');
  const [loading, setLoading] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);
  const [recebimentoId, setRecebimentoId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [manualMatches, setManualMatches] = useState<Record<string, { id: string, name: string }>>({}); // item_id -> { id, name }
  const [creatingObItemId, setCreatingObItemId] = useState<string | null>(null);
  const [conferidas, setConferidas] = useState<Record<string, number>>({}); // item_id (fiscal) -> quantidade conferida

  const digitsOnly = (value?: string | null) => (value || '').replace(/\D/g, '');
  const formatQty = (value?: number | string | null) => {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) return '-';
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(num);
  };
  const parseQtyInput = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return NaN;
    let normalized = trimmed;
    if (normalized.includes(',')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  };

  useEffect(() => {
    if (!previewData?.itens) return;
    setConferidas((prev) => {
      const next = { ...prev };
      for (const it of previewData.itens) {
        if (typeof next[it.item_id] !== 'number') {
          next[it.item_id] = typeof it.qcom === 'number' ? it.qcom : Number(it.qcom);
        }
      }
      return next;
    });
  }, [previewData]);

  const resolveClienteFromCnpj = async (cnpj?: string | null): Promise<{ id: string; nome: string; doc: string } | null> => {
    const doc = digitsOnly(cnpj);
    if (!doc) return null;

    try {
      const hits = await searchClients(doc, 5);
      const exact = hits.find(h => digitsOnly(h.doc_unico) === doc) || hits[0];
      if (!exact) return null;
      return { id: exact.id, nome: exact.nome, doc: exact.doc_unico || doc };
    } catch (e) {
      console.warn('[NFE][CTA][resolveClienteFromCnpj] failed', e);
      return null;
    }
  };

  const ensureClienteFromNfe = async (): Promise<{ id: string; nome: string; doc: string } | null> => {
    const doc = digitsOnly(previewData?.import?.emitente_cnpj || null);
    const nome = (previewData?.import?.emitente_nome || '').trim() || 'Cliente (NF-e)';
    if (!doc) return null;

    const resolved = await resolveClienteFromCnpj(doc);
    if (resolved) return resolved;

    try {
      const created = await savePartner({
        pessoa: {
          tipo: 'cliente',
          tipo_pessoa: 'juridica',
          nome,
          fantasia: nome,
          doc_unico: doc,
        },
        enderecos: [],
        contatos: [],
      });

      return { id: created.id, nome: created.nome || nome, doc: created.doc_unico || doc };
    } catch (e) {
      // Se deu race/unique, tenta resolver novamente.
      const retry = await resolveClienteFromCnpj(doc);
      if (retry) return retry;
      throw e;
    }
  };

  const handleCreateObFromItem = async (item: any) => {
    if (!previewData) return;
    const matchId: string | null = item.match_produto_id || manualMatches[item.item_id]?.id || null;
    if (!matchId) {
      addToast('Vincule o item a um produto antes de criar a OB.', 'warning');
      return;
    }

    setCreatingObItemId(item.item_id);
    try {
      const produto = manualMatches[item.item_id]
        ? { id: matchId, nome: manualMatches[item.item_id]?.name }
        : await (async () => {
          const details = await getProductDetails(matchId);
          return { id: matchId, nome: details?.nome || 'Produto vinculado' };
        })();

      const clienteDoc = previewData.import?.emitente_cnpj || null;
      const clienteNomeSugerido = previewData.import?.emitente_nome || null;
      const clienteResolved = await resolveClienteFromCnpj(clienteDoc);

      const numero = previewData.import?.numero || '';
      const serie = previewData.import?.serie || '';
      const chave = previewData.import?.chave_acesso || '';
      const documentoRef = `NF-e ${numero}${serie ? `/${serie}` : ''}${chave ? ` — ${chave}` : ''}`.trim();

      navigate('/app/industria/ordens?tipo=beneficiamento&new=1', {
        state: {
          prefill: {
            clienteId: clienteResolved?.id || null,
            clienteNome: clienteResolved?.nome || clienteNomeSugerido,
            clienteDoc: clienteResolved?.doc || clienteDoc,
            produtoId: produto.id,
            produtoNome: produto.nome,
            quantidade: typeof item.qcom === 'number' ? item.qcom : Number(item.qcom),
            unidade: item.ucom || null,
            documentoRef,
            materialClienteNome: item.xprod || null,
            materialClienteCodigo: item.cprod || null,
            materialClienteUnidade: item.ucom || null,
            origemNfeImportId: importId,
            origemNfeItemId: item.item_id,
            origemQtdXml: typeof item.qcom === 'number' ? item.qcom : Number(item.qcom),
            origemUnidadeXml: item.ucom || null,
          },
          source: { kind: 'nfe-beneficiamento', importId, itemId: item.item_id },
        },
      });
    } catch (e: any) {
      console.error(e);
      addToast(e.message || 'Erro ao preparar a Ordem de Beneficiamento.', 'error');
    } finally {
      setCreatingObItemId(null);
    }
  };

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
        // Remove namespaces via regex before parsing to handle <ns:tag>
        const cleanXml = xmlData.replace(/<(\/?)[a-zA-Z0-9]+:/g, '<$1');

        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
        const jsonData = parser.parse(cleanXml);

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
        pedido_numero: get(infNFe, 'compra.xPed') || null,
        items: itemsPayload,
        origem_upload: 'xml'
      };

      const id = await registerNfeImport(payload);
      setImportId(id);

      // Carregar preview para matching
      const preview = await previewBeneficiamento(id);
      setPreviewData(preview);

      setStep('matching');
      if (!embedded) {
        addToast('Nota registrada! Verifique os vínculos dos produtos.', 'success');
      }
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

  // Passo 2: Processar Entrada (Criar Recebimento)
  const handleProcess = async () => {
    if (!importId || !previewData) return;

    setLoading(true);
    try {
      const missingQty = (previewData.itens || []).filter((it) => {
        const qty = conferidas[it.item_id];
        return typeof qty !== 'number' || Number.isNaN(qty);
      });
      if (missingQty.length > 0) {
        addToast('Informe a quantidade conferida de todos os itens antes de concluir.', 'warning');
        return;
      }

      // 1. Criar o Recebimento (Pré-Nota)
      const { id: recebimentoId, status } = await createRecebimentoFromXml(importId);
      setRecebimentoId(recebimentoId);

      // 2. Aplicar Matches Manuais (se houver)
      const itensCriados = await listRecebimentoItens(recebimentoId);

      const matchByFiscalItemId: Record<string, string> = {};
      for (const it of previewData.itens || []) {
        const manual = manualMatches[it.item_id]?.id || null;
        const auto = it.match_produto_id || null;
        const resolved = manual || auto;
        if (resolved) matchByFiscalItemId[it.item_id] = resolved;
      }

      const missingMatches = (previewData.itens || []).filter((it) => !matchByFiscalItemId[it.item_id]);
      if (missingMatches.length > 0) {
        addToast('Há itens sem vínculo de produto. Vincule todos na etapa “Vínculos” antes de concluir.', 'warning');
        return;
      }

      await Promise.all(
        itensCriados.map(async (itemRecebimento) => {
          const desiredProductId = matchByFiscalItemId[itemRecebimento.fiscal_nfe_item_id];
          if (desiredProductId && itemRecebimento.produto_id !== desiredProductId) {
            await updateRecebimentoItemProduct(itemRecebimento.id, desiredProductId);
          }
        })
      );

      const itensAtualizados = await listRecebimentoItens(recebimentoId);
      const missingAfterUpdate = itensAtualizados.filter((it) => !it.produto_id);
      if (missingAfterUpdate.length > 0) {
        addToast('Ainda existem itens sem vínculo de produto. Verifique os vínculos e tente novamente.', 'warning');
        return;
      }

      // Conferência: usa as quantidades informadas pelo usuário (ou default do XML)
      await Promise.all(
        itensAtualizados.map(async (item) => {
          const fiscalItemId = item.fiscal_nfe_item_id;
          const qty = conferidas[fiscalItemId];
          await conferirItem(item.id, qty);
        })
      );

      if (embedded && autoFinalizeMaterialCliente) {
        const rec = await getRecebimento(recebimentoId);
        if (rec.status === 'concluido') {
          addToast('Recebimento já estava concluído.', 'info');
          onRecebimentoReady?.({ recebimentoId, status });
          setStep('success');
          return;
        }

        const cliente = await ensureClienteFromNfe();
        if (!cliente?.id) {
          addToast('Não foi possível determinar/criar o cliente (emitente) do XML.', 'error');
          return;
        }

        await setRecebimentoClassificacao(recebimentoId, 'material_cliente', cliente.id);
        try {
          const result = await finalizarRecebimentoV2(recebimentoId);

          if (result?.status !== 'concluido') {
            addToast(result?.message || 'Não foi possível concluir o recebimento automaticamente.', 'warning');
            return;
          }

          addToast('Recebimento concluído e Materiais de Clientes sincronizados.', 'success');
          onRecebimentoReady?.({ recebimentoId, status });
          setStep('success');
          return;
        } catch (e: any) {
          const msg = String(e?.message || '');
          if (/sem mapeamento de produto/i.test(msg) || /Utilize preview e envie p_matches/i.test(msg)) {
            addToast('Há itens sem vínculo de produto. Vincule todos na etapa “Vínculos” e tente novamente.', 'warning');
            return;
          }
          throw e;
        }
      }

      if (embedded) {
        addToast(status === 'exists' ? 'Recebimento já existe para esta nota.' : 'Recebimento criado com sucesso!', 'success');
        onRecebimentoReady?.({ recebimentoId, status });
        setStep('success');
        return;
      }

      addToast(status === 'exists' ? 'Recebimento já existe para esta nota.' : 'Recebimento criado com sucesso!', 'success');
      setStep('success');

    } catch (e: any) {
      console.error(e);
      const msg = String(e?.message || '');
      if (/Informe a quantidade conferida/i.test(msg)) {
        addToast(msg, 'warning');
      } else {
        addToast(msg || 'Erro ao criar recebimento.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoToConferencia = () => {
    if (!previewData) return;
    const matchByFiscalItemId: Record<string, string> = {};
    for (const it of previewData.itens || []) {
      const manual = manualMatches[it.item_id]?.id || null;
      const auto = it.match_produto_id || null;
      const resolved = manual || auto;
      if (resolved) matchByFiscalItemId[it.item_id] = resolved;
    }
    const missingMatches = (previewData.itens || []).filter((it) => !matchByFiscalItemId[it.item_id]);
    if (missingMatches.length > 0) {
      addToast('Vincule todos os itens a um produto para continuar para a conferência.', 'warning');
      return;
    }
    setStep('conferencia');
  };

  const handleMatchSelect = (itemId: string, product: any) => {
    setManualMatches(prev => ({ ...prev, [itemId]: { id: product.id, name: product.descricao } }));
  };

  // Renderização
  return (
    <div className="p-1">
      {!embedded && (
        <>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Entrada de Beneficiamento (NF-e)</h1>
          <p className="text-gray-600 mb-6">Importe o XML da nota fiscal para registrar a entrada de insumos de terceiros.</p>
        </>
      )}

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
        <div className={`flex items-center gap-2 ${step === 'conferencia' ? 'text-blue-600' : ''}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step === 'conferencia' ? 'border-blue-600 bg-blue-50' : 'border-gray-300'}`}>4</span>
          Conferência
        </div>
        <div className="w-8 h-px bg-gray-300 mx-2" />
        <div className={`flex items-center gap-2 ${step === 'success' ? 'text-green-600' : ''}`}>
          <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${step === 'success' ? 'border-green-600 bg-green-50' : 'border-gray-300'}`}>5</span>
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[40rem]">Vínculo no Sistema</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ação</th>
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
                          {formatQty(item.qcom)} <span className="text-xs text-gray-500">{item.ucom}</span>
                        </td>
                        <td className="px-4 py-3 w-[40rem]">
                          {item.match_produto_id || manualMatches[item.item_id] ? (
                            <div className="flex items-center gap-2 text-sm text-green-700">
                              <CheckCircle size={16} />
                              <div>
                                <p className="font-medium">
                                  {item.match_produto_id
                                    ? 'Produto encontrado automaticamente'
                                    : manualMatches[item.item_id]?.name || 'Produto vinculado manualmente'}
                                </p>
                                {item.match_strategy && (
                                  <span className="text-xs bg-green-100 px-2 py-0.5 rounded-full capitalize">
                                    {item.match_strategy}
                                  </span>
                                )}
                              </div>
                              {!item.match_produto_id && (
                                <button
                                  onClick={() => {
                                    const newMatches = { ...manualMatches };
                                    delete newMatches[item.item_id];
                                    setManualMatches(newMatches);
                                  }}
                                  className="ml-2 text-xs text-red-500 hover:text-red-700 underline"
                                >
                                  Desvincular
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="w-full max-w-[40rem]">
                              <ItemAutocomplete
                                onSelect={(prod) => handleMatchSelect(item.item_id, prod)}
                                placeholder="Buscar produto para vincular..."
                                onlySales={false}
                                type="product"
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
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleCreateObFromItem(item)}
                            disabled={!isMatched || creatingObItemId === item.item_id}
                            className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-600 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={isMatched ? 'Criar Ordem de Beneficiamento' : 'Vincule o produto para habilitar'}
                          >
                            {creatingObItemId === item.item_id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar OB'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => setStep('review')}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                onClick={handleGoToConferencia}
                disabled={loading}
                className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <ArrowRight />
                Conferir Quantidades
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: CONFERÊNCIA */}
        {step === 'conferencia' && previewData && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Conferência de Quantidades</h3>
              <span className="text-sm text-gray-500">
                {previewData.itens.length} itens
              </span>
            </div>

            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item (XML)</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Qtd. XML</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Qtd. Conferida</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {previewData.itens.map((item) => {
                    const qty = conferidas[item.item_id];
                    const qtyNumber = typeof qty === 'number' && !Number.isNaN(qty) ? qty : NaN;
                    const tol = 1e-6;
                    const ok = typeof qtyNumber === 'number' && !Number.isNaN(qtyNumber) && Math.abs(qtyNumber - item.qcom) <= tol;
                    const diverge = typeof qtyNumber === 'number' && !Number.isNaN(qtyNumber) && Math.abs(qtyNumber - item.qcom) > tol;
                    return (
                      <tr key={item.item_id} className={diverge ? 'bg-yellow-50/40' : ''}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{item.xprod}</p>
                          <p className="text-xs text-gray-500">Cód: {item.cprod} | EAN: {item.ean || '-'}</p>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-700">
                          {formatQty(item.qcom)} <span className="text-xs text-gray-500">{item.ucom}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={Number.isFinite(conferidas[item.item_id]) ? formatQty(conferidas[item.item_id]) : ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const next = parseQtyInput(raw);
                              setConferidas((prev) => ({ ...prev, [item.item_id]: next }));
                            }}
                            className="w-32 rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                            aria-label={`Quantidade conferida do item ${item.n_item}`}
                            title="Quantidade conferida"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {ok ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Ok
                            </span>
                          ) : diverge ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              Divergente
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
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
                onClick={() => setStep('matching')}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Voltar para Vínculos
              </button>
              <button
                onClick={handleProcess}
                disabled={loading}
                className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Save />}
                {embedded
                  ? (autoFinalizeMaterialCliente ? 'Concluir e Sincronizar' : 'Criar Recebimento')
                  : 'Salvar Conferência e Criar Recebimento'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: SUCCESS (Redundant now, but kept for fallback) */}
        {step === 'success' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Importação Concluída!</h2>
            <p className="text-gray-600 mb-8 max-w-md">
              {embedded
                ? (autoFinalizeMaterialCliente
                    ? 'O recebimento foi concluído e os Materiais de Clientes foram sincronizados.'
                    : 'O recebimento foi criado. Você pode continuar e concluir o recebimento quando desejar.')
                : 'O recebimento foi criado e a conferência foi registrada. Ele também está disponível em Suprimentos → Recebimentos.'}
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => { setStep('upload'); setNfeData(null); setXmlFile(null); setPreviewData(null); setManualMatches({}); }}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Importar Outra Nota
              </button>
              {!embedded && (
                <>
                  <button
                    onClick={() => navigate('/app/suprimentos/recebimentos')}
                    className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
                  >
                    Voltar para Recebimentos
                  </button>
                  {recebimentoId && (
                    <button
                      onClick={() => navigate(`/app/suprimentos/recebimento/${recebimentoId}?view=details`)}
                      className="px-6 py-2 bg-white border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50"
                    >
                      Ver Detalhes
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

      </GlassCard>
    </div>
  );
}
