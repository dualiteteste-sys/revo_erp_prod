import React, { useState, useEffect } from 'react';
import { listRoteiros, RoteiroListItem } from '@/services/industriaRoteiros';
import { Loader2, FileText } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import Modal from '@/components/ui/Modal';
import { logger } from '@/lib/logger';

const labelTipoRoteiro = (tipo?: string | null) => {
  if (tipo === 'beneficiamento') return { label: 'Beneficiamento', className: 'bg-purple-100 text-purple-800' };
  if (tipo === 'ambos') return { label: 'Ambos', className: 'bg-slate-100 text-slate-800' };
  return { label: 'Produção', className: 'bg-blue-100 text-blue-800' };
};

interface Props {
  ordemId: string;
  produtoId: string;
  tipoBom?: 'producao' | 'beneficiamento' | 'ambos';
    disabled?: boolean;
    onApplied: (roteiro: RoteiroListItem) => void;
}

export default function RoteiroSelector({ ordemId, produtoId, tipoBom, disabled, onApplied }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [roteiros, setRoteiros] = useState<RoteiroListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterByProduct, setFilterByProduct] = useState(true);
    const [filterByTipo, setFilterByTipo] = useState(false);
    const { addToast } = useToast();

    const loadRoteiros = async () => {
        setLoading(true);
        try {
            const targetProdutoId = filterByProduct && produtoId ? produtoId : undefined;
            const targetTipo = filterByTipo ? tipoBom : undefined;
            const data = await listRoteiros(searchTerm, targetProdutoId, targetTipo, true);
            setRoteiros(data);
        } catch (e) {
            logger.error('[Indústria][OP] Falha ao listar roteiros (selector)', e, { produtoId, tipoBom, searchTerm, filterByProduct });
            addToast('Erro ao listar roteiros.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadRoteiros();
        }
  }, [isOpen, filterByProduct, filterByTipo, searchTerm]);

    const handleApply = (roteiro: RoteiroListItem) => {
        // No confirmation needed inside selector, parent (ProducaoFormPanel) usually handles "Apply" logic via saving header.
        // But consistency with BomSelector suggests we might want one.
        // For Roteiro, typically we just "Pick" it and then "Release" the order.
        onApplied(roteiro);
        setIsOpen(false);
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                    disabled ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
                }`}
                disabled={!produtoId || !!disabled}
            >
                <FileText size={16} /> Selecionar Roteiro
            </button>

            <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Selecionar Roteiro" size="lg">
                <div className="p-6">
                    <div className="mb-4 space-y-3">
                        <input
                            type="text"
                            placeholder="Buscar por código ou descrição..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md"
                        />
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="filterByProductRot"
                                checked={filterByProduct}
                                onChange={(e) => setFilterByProduct(e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="filterByProductRot" className="text-sm text-gray-700">
                                Filtrar pelo produto da ordem
                            </label>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="filterByTipoRot"
                                checked={filterByTipo}
                                onChange={(e) => setFilterByTipo(e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="filterByTipoRot" className="text-sm text-gray-700">
                                Filtrar por tipo de uso (Produção/Beneficiamento/Ambos)
                            </label>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-500" /></div>
                    ) : roteiros.length === 0 ? (
                        <div className="text-center text-gray-500 p-8">
                            <p>Nenhum roteiro encontrado.</p>
                            {filterByProduct && <p className="text-xs mt-2">Desmarque o filtro de produto para ver todos.</p>}
                        </div>
                    ) : (
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                            {roteiros.map(rot => (
                                <div key={rot.id} className="border rounded-lg p-4 hover:bg-gray-50 flex justify-between items-center cursor-pointer" onClick={() => handleApply(rot)}>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-bold text-gray-800">{rot.codigo || 'Sem Código'} (v{rot.versao})</h4>
                                              {(() => {
                                                const meta = labelTipoRoteiro(rot.tipo_bom);
                                                return (
                                                  <span className={`text-xs px-2 py-0.5 rounded-full ${meta.className}`}>
                                                    {meta.label}
                                                  </span>
                                                );
                                              })()}
                                              {(
                                                tipoBom === 'beneficiamento'
                                                  ? rot.padrao_para_beneficiamento
                                                  : tipoBom === 'producao'
                                                    ? rot.padrao_para_producao
                                                    : (rot.padrao_para_producao || rot.padrao_para_beneficiamento)
                                              ) && <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Padrão</span>}
                                            </div>
                                        <p className="text-sm text-gray-600">{rot.descricao}</p>
                                        <p className="text-xs text-gray-500 mt-1">Produto: {rot.produto_nome}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700"
                                        >
                                            Selecionar
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
