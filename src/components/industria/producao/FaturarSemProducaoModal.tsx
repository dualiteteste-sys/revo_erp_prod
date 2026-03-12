import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import ProductAutocomplete from '@/components/common/ProductAutocomplete';
import Input from '@/components/ui/forms/Input';
import { Loader2, Receipt } from 'lucide-react';
import { faturarSemProducao } from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
import { useNavigate } from 'react-router-dom';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function FaturarSemProducaoModal({ isOpen, onClose }: Props) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState('');
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [produtoNome, setProdutoNome] = useState('');
  const [quantidade, setQuantidade] = useState<string>('');
  const [precoUnitario, setPrecoUnitario] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setClienteId(null);
    setClienteNome('');
    setProdutoId(null);
    setProdutoNome('');
    setQuantidade('');
    setPrecoUnitario('');
  };

  const handleSubmit = async () => {
    if (!clienteId) {
      addToast('Selecione o cliente (destinatário).', 'error');
      return;
    }
    if (!produtoId) {
      addToast('Selecione o produto.', 'error');
      return;
    }
    const qty = parseFloat(quantidade);
    if (!qty || qty <= 0) {
      addToast('Informe uma quantidade maior que zero.', 'error');
      return;
    }
    const preco = parseFloat(precoUnitario);
    if (isNaN(preco) || preco < 0) {
      addToast('Informe um preço unitário válido.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const result = await faturarSemProducao({
        clienteId,
        produtoId,
        quantidade: qty,
        precoUnitario: preco,
      });

      addToast('NF-e rascunho criada! Revise e envie para a SEFAZ.', 'success');
      reset();
      onClose();
      navigate(`/app/fiscal/nfe?open=${encodeURIComponent(result.emissao_id)}`);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao gerar faturamento.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Faturar Sem Ordem de Produção" size="md">
      <div className="p-6 space-y-5">
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
          Cria um pedido de venda aprovado automaticamente e uma NF-e em rascunho. Nenhuma OP será vinculada — ideal quando a produção já foi concluída ou não será controlada.
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cliente (Destinatário) <span className="text-red-500">*</span>
          </label>
          <ClientAutocomplete
            value={clienteId}
            onChange={(id, name) => {
              setClienteId(id);
              setClienteNome(name || '');
            }}
            initialName={clienteNome}
            entity="client"
            placeholder="Buscar cliente..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Produto <span className="text-red-500">*</span>
          </label>
          <ProductAutocomplete
            value={produtoId}
            onChange={(id, hit) => {
              setProdutoId(id);
              setProdutoNome(hit?.nome || '');
              if (hit?.preco_venda && !precoUnitario) {
                setPrecoUnitario(String(hit.preco_venda));
              }
            }}
            initialName={produtoNome}
            placeholder="Buscar produto..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Quantidade *"
            name="quantidade"
            type="number"
            min="0.0001"
            step="0.01"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="Ex: 100"
          />
          <Input
            label="Preço Unitário *"
            name="preco_unitario"
            type="number"
            min="0"
            step="0.01"
            value={precoUnitario}
            onChange={(e) => setPrecoUnitario(e.target.value)}
            placeholder="R$ 0,00"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !clienteId || !produtoId || !quantidade || !precoUnitario}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={18} className="mr-2 animate-spin" />
            ) : (
              <Receipt size={18} className="mr-2" />
            )}
            {submitting ? 'Gerando NF-e...' : 'Faturar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
