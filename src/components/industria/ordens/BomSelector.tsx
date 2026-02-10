import React, { useState, useEffect } from 'react';
import { listBoms, BomListItem, aplicarBomProducao, aplicarBomBeneficiamento } from '@/services/industriaBom';
import { Loader2, FileCog } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import Modal from '@/components/ui/Modal';
import { logger } from '@/lib/logger';
import { useConfirm } from '@/contexts/ConfirmProvider';
import { useAuth } from '@/contexts/AuthProvider';

const labelTipoBom = (tipo?: string | null) => {
  if (tipo === 'beneficiamento') return { label: 'Beneficiamento', className: 'bg-purple-100 text-purple-800' };
  if (tipo === 'ambos') return { label: 'Ambos', className: 'bg-slate-100 text-slate-800' };
  return { label: 'Produção', className: 'bg-blue-100 text-blue-800' };
};

const isBomCompatibleWithOrder = (bom: BomListItem, tipoOrdem: 'producao' | 'beneficiamento') => {
  if (tipoOrdem === 'producao') return bom.tipo_bom === 'producao' || bom.tipo_bom === 'ambos';
  return bom.tipo_bom === 'beneficiamento' || bom.tipo_bom === 'ambos';
};

interface Props {
  ordemId: string;
  produtoId: string;
  tipoOrdem: 'producao' | 'beneficiamento';
  openOnMount?: boolean;
  disabled?: boolean;
  onApplied: (bom: BomListItem, ordemId: string) => void;
  onEnsureOrder?: () => Promise<string | null>;
}

export default function BomSelector({ ordemId, produtoId, tipoOrdem, openOnMount, disabled, onApplied, onEnsureOrder }: Props) {
  const [resolvedOrdemId, setResolvedOrdemId] = useState(ordemId);
  const [isOpen, setIsOpen] = useState(false);
  const [boms, setBoms] = useState<BomListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterByProduct, setFilterByProduct] = useState(true);
  const [filterByTipo, setFilterByTipo] = useState(false);
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const { loading: authLoading, activeEmpresaId } = useAuth();

  useEffect(() => {
    setResolvedOrdemId(ordemId);
  }, [ordemId]);

  useEffect(() => {
    if (!openOnMount) return;
    if (!resolvedOrdemId) return;
    setIsOpen(true);
  }, [openOnMount, resolvedOrdemId]);

  const ensureOrderBeforeOpen = async () => {
    if (authLoading || !activeEmpresaId) return null;
    if (resolvedOrdemId) return resolvedOrdemId;
    if (!onEnsureOrder) return null;
    const id = await onEnsureOrder();
    if (id) setResolvedOrdemId(id);
    return id;
  };

  const loadBoms = async () => {
    if (authLoading || !activeEmpresaId) return;
    setLoading(true);
    try {
      // Se filterByProduct for true, usa o produtoId recebido via prop.
      // Caso contrário, passa undefined para listar BOMs de qualquer produto.
      const targetProdutoId = filterByProduct && produtoId ? produtoId : undefined;
      const targetTipo = filterByTipo ? tipoOrdem : undefined;
      const data = await listBoms(searchTerm, targetProdutoId, targetTipo, true);
      setBoms(data);
    } catch (e) {
      logger.error('[Indústria][OP] Falha ao listar BOMs (selector)', e, { produtoId, tipoOrdem, searchTerm, filterByProduct });
      addToast((e as any)?.message || 'Erro ao listar fichas técnicas (BOM).', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadBoms();
  }, [isOpen, filterByProduct, filterByTipo, searchTerm, authLoading, activeEmpresaId]); // Recarrega ao mudar filtros

  const handleApply = async (bomId: string, mode: 'substituir' | 'adicionar') => {
    if (authLoading || !activeEmpresaId) {
      addToast('Aguarde a troca de contexto (login/empresa) concluir para aplicar BOM.', 'info');
      return;
    }
    const ok = await confirm({
      title: 'Aplicar BOM',
      description:
        mode === 'substituir'
          ? 'Tem certeza que deseja aplicar esta BOM? Isso substituirá os componentes atuais.'
          : 'Tem certeza que deseja aplicar esta BOM? Os componentes atuais serão mantidos.',
      confirmText: 'Aplicar',
      cancelText: 'Cancelar',
      variant: 'primary',
    });
    if (!ok) return;

    const selectedBom = boms.find(b => b.id === bomId);
    if (!selectedBom) return;

    const currentId = resolvedOrdemId || (await ensureOrderBeforeOpen());
    if (!currentId) return;

    setApplying(bomId);
    try {
      if (tipoOrdem === 'producao') {
        await aplicarBomProducao(bomId, currentId, mode);
      } else {
        await aplicarBomBeneficiamento(bomId, currentId, mode);
      }
      addToast('BOM aplicada com sucesso!', 'success');
      setIsOpen(false);
      onApplied(selectedBom, currentId);
    } catch (e: any) {
      addToast(e.message, 'error');
    } finally {
      setApplying(null);
    }
  };

  return (
    <>
      <button
        onClick={async () => {
          const ok = await ensureOrderBeforeOpen();
          if (!ok) return;
          setIsOpen(true);
        }}
        className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
          disabled ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'
        }`}
        disabled={!!disabled || !produtoId || authLoading || !activeEmpresaId}
      >
        <FileCog size={16} /> Aplicar BOM
      </button>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Selecionar Ficha Técnica (BOM)" size="lg">
        <div className="p-6">
          <div className="mb-4 space-y-3">
            <input
              type="text"
              placeholder="Buscar por nome ou código..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md"
            />
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="filterByProduct"
                checked={filterByProduct}
                onChange={(e) => setFilterByProduct(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="filterByProduct" className="text-sm text-gray-700">
                Filtrar pelo produto/serviço selecionado na ordem
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="filterByTipo"
                checked={filterByTipo}
                onChange={(e) => setFilterByTipo(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="filterByTipo" className="text-sm text-gray-700">
                Filtrar por tipo de uso (Produção/Beneficiamento/Ambos)
              </label>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-500" /></div>
          ) : boms.length === 0 ? (
            <div className="text-center text-gray-500 p-8">
              <p>Nenhuma ficha técnica encontrada.</p>
              {filterByProduct && <p className="text-xs mt-2">Tente desmarcar o filtro de produto acima.</p>}
            </div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {boms.map(bom => (
                <div key={bom.id} className="border rounded-lg p-4 hover:bg-gray-50 flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-gray-800">{bom.codigo || 'Sem código'} (v{bom.versao})</h4>
                      {(() => {
                        const meta = labelTipoBom(bom.tipo_bom);
                        return (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${meta.className}`}>
                            {meta.label}
                          </span>
                        );
                      })()}
                    {(tipoOrdem === 'beneficiamento' ? bom.padrao_para_beneficiamento : bom.padrao_para_producao) && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Padrão</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Produto: {bom.produto_nome}</p>
                  </div>
                  <div className="flex gap-2">
                    {(() => {
                      const compatible = isBomCompatibleWithOrder(bom, tipoOrdem);
                      const tip =
                        tipoOrdem === 'producao'
                          ? 'Esta ordem é de Produção: selecione uma BOM do tipo Produção ou Ambos.'
                          : 'Esta ordem é de Beneficiamento: selecione uma BOM do tipo Beneficiamento ou Ambos.';
                      return (
                        <>
                    <button
                      onClick={() => handleApply(bom.id, 'substituir')}
                      disabled={!!applying || !compatible}
                      title={!compatible ? tip : 'Substituir componentes atuais pelos da BOM'}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {applying === bom.id ? <Loader2 className="animate-spin w-4 h-4" /> : 'Substituir'}
                    </button>
                    <button
                      onClick={() => handleApply(bom.id, 'adicionar')}
                      disabled={!!applying || !compatible}
                      title={!compatible ? tip : 'Adicionar componentes da BOM mantendo os atuais'}
                      className="px-3 py-1.5 border border-blue-600 text-blue-600 text-xs font-bold rounded hover:bg-blue-50 disabled:opacity-50"
                    >
                      Adicionar
                    </button>
                        </>
                      );
                    })()}
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
