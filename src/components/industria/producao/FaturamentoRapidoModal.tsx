import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import ClientAutocomplete from '@/components/common/ClientAutocomplete';
import Input from '@/components/ui/forms/Input';
import { Loader2, Receipt } from 'lucide-react';
import { faturarOrdemProducao } from '@/services/industriaProducao';
import { useToast } from '@/contexts/ToastProvider';
import { useNavigate } from 'react-router-dom';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ordemId: string;
  ordemNumero: number;
  produtoNome: string;
  quantidade: number;
  unidade: string;
  onSuccess: () => void;
}

export default function FaturamentoRapidoModal({
  isOpen,
  onClose,
  ordemId,
  ordemNumero,
  produtoNome,
  quantidade,
  unidade,
  onSuccess,
}: Props) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState('');
  const [precoUnitario, setPrecoUnitario] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!clienteId) {
      addToast('Selecione o cliente (destinatário).', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const result = await faturarOrdemProducao(
        ordemId,
        clienteId,
        precoUnitario ? parseFloat(precoUnitario) : undefined,
      );

      addToast('NF-e rascunho criada! Revise e envie para a SEFAZ.', 'success');
      onSuccess();
      onClose();
      navigate(`/app/fiscal/nfe?open=${encodeURIComponent(result.emissao_id)}`);
    } catch (e: any) {
      addToast(e?.message || 'Erro ao faturar ordem de produção.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setClienteId(null);
    setClienteNome('');
    setPrecoUnitario('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Faturar Ordem de Produção" size="md">
      <div className="p-6 space-y-5">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
          <div className="font-semibold text-gray-800 mb-2">Resumo da OP #{ordemNumero}</div>
          <div className="text-gray-700">
            <div><span className="font-medium">Produto:</span> {produtoNome}</div>
            <div><span className="font-medium">Quantidade:</span> {quantidade} {unidade}</div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800">
          Será criado um pedido de venda aprovado automaticamente e uma NF-e em rascunho para você revisar antes de enviar à SEFAZ.
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
          <Input
            label="Preço Unitário (opcional)"
            name="preco_unitario"
            type="number"
            min="0"
            step="0.01"
            value={precoUnitario}
            onChange={(e) => setPrecoUnitario(e.target.value)}
            placeholder="Deixe vazio para usar o preço de venda do produto"
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
            disabled={submitting || !clienteId}
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
