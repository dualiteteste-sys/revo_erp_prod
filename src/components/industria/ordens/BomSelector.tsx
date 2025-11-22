import React, { useState, useEffect } from 'react';
import { listBoms, BomListItem, aplicarBomProducao, aplicarBomBeneficiamento } from '@/services/industriaBom';
import { Loader2, FileCog } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import Modal from '@/components/ui/Modal';

interface Props {
  ordemId: string;
  produtoId: string;
  tipoOrdem: 'producao' | 'beneficiamento';
  onApplied: () => void;
}

export default function BomSelector({ ordemId, produtoId, tipoOrdem, onApplied }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [boms, setBoms] = useState<BomListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const { addToast } = useToast();

  const loadBoms = async () => {
    if (!produtoId) return;
    setLoading(true);
    try {
      const data = await listBoms(undefined, produtoId, tipoOrdem, true);
      setBoms(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadBoms();
    }
  }, [isOpen, produtoId]);

  const handleApply = async (bomId: string, mode: 'substituir' | 'adicionar') => {
    if (!confirm(`Tem certeza que deseja aplicar esta BOM? ${mode === 'substituir' ? 'Isso substituirá os componentes atuais.' : ''}`)) return;
    
    setApplying(bomId);
    try {
      if (tipoOrdem === 'producao') {
        await aplicarBomProducao(bomId, ordemId, mode);
      } else {
        await aplicarBomBeneficiamento(bomId, ordemId, mode);
      }
      addToast('BOM aplicada com sucesso!', 'success');
      setIsOpen(false);
      onApplied();
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setApplying(null);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"
        disabled={!ordemId || !produtoId}
      >
        <FileCog size={16} /> Aplicar BOM
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Selecionar Ficha Técnica (BOM)" size="lg">
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : boms.length === 0 ? (
            <div className="text-center text-gray-500 p-8">
              <p>Nenhuma ficha técnica ativa encontrada para este produto.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {boms.map(bom => (
                <div key={bom.id} className="border rounded-lg p-4 hover:bg-gray-50 flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                        <h4 className="font-bold text-gray-800">{bom.codigo || 'Sem código'} (v{bom.versao})</h4>
                        {bom.padrao_para_producao && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Padrão</span>}
                    </div>
                    <p className="text-sm text-gray-600">{bom.descricao}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApply(bom.id, 'substituir')}
                      disabled={!!applying}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {applying === bom.id ? <Loader2 className="animate-spin w-4 h-4" /> : 'Substituir'}
                    </button>
                    <button
                      onClick={() => handleApply(bom.id, 'adicionar')}
                      disabled={!!applying}
                      className="px-3 py-1.5 border border-blue-600 text-blue-600 text-xs font-bold rounded hover:bg-blue-50 disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
