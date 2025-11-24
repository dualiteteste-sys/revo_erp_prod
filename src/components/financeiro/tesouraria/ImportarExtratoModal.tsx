import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import TextArea from '@/components/ui/forms/TextArea';
import { Loader2, UploadCloud, DatabaseBackup } from 'lucide-react';
import { ImportarExtratoPayload, seedExtratos } from '@/services/treasury';
import { useToast } from '@/contexts/ToastProvider';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImport: (itens: ImportarExtratoPayload[]) => Promise<void>;
  contaCorrenteId: string;
}

export default function ImportarExtratoModal({ isOpen, onClose, onImport, contaCorrenteId }: Props) {
  const { addToast } = useToast();
  const [csvText, setCsvText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
        await seedExtratos(contaCorrenteId);
        addToast('Dados de exemplo importados com sucesso!', 'success');
        onClose();
        // Force refresh on parent via callback if needed, but import usually triggers refresh
        window.location.reload(); // Simple reload to refresh everything or pass a refresh callback
    } catch (e: any) {
        addToast(e.message, 'error');
    } finally {
        setIsSeeding(false);
    }
  };

  const handleImport = async () => {
    if (!csvText.trim()) {
        addToast('Cole o conteúdo do CSV.', 'warning');
        return;
    }

    setIsProcessing(true);
    try {
        // Simple CSV Parser: Data;Descricao;Valor;Documento
        // Valor: positivo = credito, negativo = debito
        const lines = csvText.split('\n');
        const itens: ImportarExtratoPayload[] = [];

        for (const line of lines) {
            if (!line.trim()) continue;
            const parts = line.split(';');
            if (parts.length < 3) continue;

            const dataRaw = parts[0].trim(); // YYYY-MM-DD
            const descricao = parts[1].trim();
            const valorRaw = parts[2].trim().replace(',', '.');
            const doc = parts[3]?.trim();

            const valor = parseFloat(valorRaw);
            if (isNaN(valor)) continue;

            itens.push({
                data_lancamento: dataRaw,
                descricao: descricao,
                valor: Math.abs(valor),
                tipo_lancamento: valor >= 0 ? 'credito' : 'debito',
                documento_ref: doc,
                identificador_banco: `IMP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
            });
        }

        if (itens.length === 0) {
            addToast('Nenhum item válido encontrado no texto.', 'error');
            return;
        }

        await onImport(itens);
        addToast(`${itens.length} lançamentos importados.`, 'success');
        setCsvText('');
        onClose();
    } catch (e: any) {
        addToast('Erro ao importar: ' + e.message, 'error');
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Importar Extrato Bancário" size="lg">
      <div className="p-6 space-y-6">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
            <p className="font-bold mb-1">Formato esperado (CSV - Ponto e vírgula):</p>
            <code className="block bg-white p-2 rounded border border-blue-200 mt-2">
                AAAA-MM-DD;Descrição do Lançamento;Valor (use - para saída);Documento
            </code>
            <p className="mt-2 text-xs">Exemplo: 2023-10-25;Pagamento Fornecedor;-150.00;DOC123</p>
        </div>

        <TextArea 
            label="Conteúdo do Arquivo (Copie e Cole)" 
            name="csv" 
            value={csvText} 
            onChange={e => setCsvText(e.target.value)} 
            rows={10} 
            placeholder="Cole aqui as linhas do seu extrato..."
        />

        <div className="flex justify-between items-center pt-4 border-t border-gray-100">
            <button 
                onClick={handleSeed} 
                disabled={isSeeding || isProcessing}
                className="text-gray-600 hover:text-blue-600 text-sm flex items-center gap-2 disabled:opacity-50"
            >
                {isSeeding ? <Loader2 className="animate-spin" size={16} /> : <DatabaseBackup size={16} />}
                Gerar dados de teste
            </button>

            <div className="flex gap-3">
                <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                    Cancelar
                </button>
                <button 
                    onClick={handleImport} 
                    disabled={isProcessing}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                    {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <UploadCloud size={18} />}
                    Importar
                </button>
            </div>
        </div>
      </div>
    </Modal>
  );
}
