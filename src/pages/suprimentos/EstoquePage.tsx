import React, { useState, useEffect } from 'react';
import { listPosicaoEstoque, getKardex, EstoquePosicao, EstoqueMovimento } from '@/services/suprimentos';
import { Search, Package, ArrowRightLeft, History, AlertCircle, Loader2 } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import Modal from '@/components/ui/Modal';
import MovimentoModal from '@/components/suprimentos/MovimentoModal';
import { useDebounce } from '@/hooks/useDebounce';
import Toggle from '@/components/ui/forms/Toggle';

export default function EstoquePage() {
  const [produtos, setProdutos] = useState<EstoquePosicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showBaixoEstoque, setShowBaixoEstoque] = useState(false);
  const debouncedSearch = useDebounce(search, 500);

  const [selectedProduto, setSelectedProduto] = useState<EstoquePosicao | null>(null);
  const [isMovimentoOpen, setIsMovimentoOpen] = useState(false);
  const [isKardexOpen, setIsKardexOpen] = useState(false);
  const [kardexData, setKardexData] = useState<EstoqueMovimento[]>([]);
  const [loadingKardex, setLoadingKardex] = useState(false);

  const fetchEstoque = async () => {
    setLoading(true);
    try {
      const data = await listPosicaoEstoque(debouncedSearch, showBaixoEstoque);
      setProdutos(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEstoque();
  }, [debouncedSearch, showBaixoEstoque]);

  const handleOpenMovimento = (produto: EstoquePosicao) => {
    setSelectedProduto(produto);
    setIsMovimentoOpen(true);
  };

  const handleOpenKardex = async (produto: EstoquePosicao) => {
    setSelectedProduto(produto);
    setIsKardexOpen(true);
    setLoadingKardex(true);
    try {
      const data = await getKardex(produto.produto_id);
      setKardexData(data);
    } finally {
      setLoadingKardex(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'zerado': return <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-semibold">Zerado</span>;
      case 'baixo': return <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full font-semibold">Baixo</span>;
      default: return <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-semibold">OK</span>;
    }
  };

  return (
    <div className="p-1">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Controle de Estoque</h1>
          <p className="text-gray-600 text-sm mt-1">Gerencie saldos e movimentações.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 mb-6 items-end">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar produto (Nome ou SKU)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full p-3 pl-10 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="bg-white p-2 rounded-lg border border-gray-200">
            <Toggle 
                label="Apenas Estoque Baixo/Zerado" 
                name="baixoEstoque" 
                checked={showBaixoEstoque} 
                onChange={setShowBaixoEstoque} 
            />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={4} className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-blue-500" /></td></tr>
              ) : produtos.length === 0 ? (
                <tr><td colSpan={4} className="p-8 text-center text-gray-500">Nenhum produto encontrado.</td></tr>
              ) : (
                produtos.map((prod) => (
                  <tr key={prod.produto_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{prod.nome}</div>
                      <div className="text-xs text-gray-500">SKU: {prod.sku || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-lg font-bold text-gray-800">{prod.saldo}</span>
                      <span className="text-xs text-gray-500 ml-1">{prod.unidade}</span>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(prod.status_estoque)}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => handleOpenMovimento(prod)}
                        className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg" 
                        title="Nova Movimentação"
                      >
                        <ArrowRightLeft size={18} />
                      </button>
                      <button 
                        onClick={() => handleOpenKardex(prod)}
                        className="text-gray-600 hover:bg-gray-100 p-2 rounded-lg" 
                        title="Histórico (Kardex)"
                      >
                        <History size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedProduto && (
        <MovimentoModal 
            isOpen={isMovimentoOpen} 
            onClose={() => setIsMovimentoOpen(false)} 
            produto={selectedProduto}
            onSuccess={fetchEstoque}
        />
      )}

      <Modal isOpen={isKardexOpen} onClose={() => setIsKardexOpen(false)} title={`Kardex: ${selectedProduto?.nome}`} size="4xl">
        <div className="p-6">
            {loadingKardex ? (
                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-500" /></div>
            ) : kardexData.length === 0 ? (
                <div className="text-center text-gray-500 p-8">Nenhuma movimentação registrada.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="p-3 text-left">Data</th>
                                <th className="p-3 text-left">Tipo</th>
                                <th className="p-3 text-right">Qtd.</th>
                                <th className="p-3 text-right">Saldo Anterior</th>
                                <th className="p-3 text-right">Novo Saldo</th>
                                <th className="p-3 text-left">Ref.</th>
                                <th className="p-3 text-left">Usuário</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {kardexData.map(mov => (
                                <tr key={mov.id}>
                                    <td className="p-3">{new Date(mov.created_at).toLocaleString('pt-BR')}</td>
                                    <td className="p-3 capitalize">{mov.tipo.replace(/_/g, ' ')}</td>
                                    <td className={`p-3 text-right font-bold ${['entrada', 'ajuste_entrada'].includes(mov.tipo) ? 'text-green-600' : 'text-red-600'}`}>
                                        {['entrada', 'ajuste_entrada'].includes(mov.tipo) ? '+' : '-'}{mov.quantidade}
                                    </td>
                                    <td className="p-3 text-right text-gray-500">{mov.saldo_anterior}</td>
                                    <td className="p-3 text-right font-semibold">{mov.saldo_novo}</td>
                                    <td className="p-3 text-gray-600">{mov.documento_ref || '-'}</td>
                                    <td className="p-3 text-gray-500 text-xs">{mov.usuario_email}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
      </Modal>
    </div>
  );
}
