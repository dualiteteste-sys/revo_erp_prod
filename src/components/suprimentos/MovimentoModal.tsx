import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import { Loader2, Save } from 'lucide-react';
import { registrarMovimento, EstoquePosicao } from '@/services/suprimentos';
import { useToast } from '@/contexts/ToastProvider';
import { useNumericField } from '@/hooks/useNumericField';

interface MovimentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  produto: EstoquePosicao;
  onSuccess: () => void;
}

const MovimentoModal: React.FC<MovimentoModalProps> = ({ isOpen, onClose, produto, onSuccess }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [tipo, setTipo] = useState('entrada');
  const [quantidade, setQuantidade] = useState<number | ''>('');
  const [custo, setCusto] = useState<number | null>(null);
  const [docRef, setDocRef] = useState('');
  const [obs, setObs] = useState('');

  const custoProps = useNumericField(custo, setCusto);

  const handleSave = async () => {
    if (!quantidade || Number(quantidade) <= 0) {
      addToast('Informe uma quantidade válida.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await registrarMovimento({
        produto_id: produto.produto_id,
        tipo,
        quantidade: Number(quantidade),
        custo_unitario: custo || undefined,
        documento_ref: docRef,
        observacao: obs,
      });
      addToast('Movimentação registrada com sucesso!', 'success');
      onSuccess();
      onClose();
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Nova Movimentação: ${produto.nome}`} size="lg">
      <div className="p-6 space-y-4">
        <div className="bg-gray-50 p-3 rounded-lg text-sm text-gray-600 flex justify-between">
            <span>Saldo Atual: <strong>{produto.saldo} {produto.unidade}</strong></span>
            <span>SKU: {produto.sku || '-'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select label="Tipo de Movimento" name="tipo" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="entrada">Entrada (Compra/Produção)</option>
            <option value="saida">Saída (Venda/Consumo)</option>
            <option value="ajuste_entrada">Ajuste de Entrada (Inventário)</option>
            <option value="ajuste_saida">Ajuste de Saída (Inventário)</option>
            <option value="perda">Perda / Quebra</option>
          </Select>

          <Input 
            label="Quantidade" 
            name="quantidade" 
            type="number" 
            value={quantidade} 
            onChange={e => setQuantidade(parseFloat(e.target.value))} 
            placeholder="0.00"
          />
        </div>

        {['entrada', 'ajuste_entrada'].includes(tipo) && (
            <Input 
                label="Custo Unitário (R$)" 
                name="custo" 
                {...custoProps} 
                placeholder="0,00"
            />
        )}

        <Input 
            label="Documento de Referência" 
            name="docRef" 
            value={docRef} 
            onChange={e => setDocRef(e.target.value)} 
            placeholder="Ex: NF 1234, Pedido 567"
        />

        <TextArea 
            label="Observações" 
            name="obs" 
            value={obs} 
            onChange={e => setObs(e.target.value)} 
            rows={2} 
        />

        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            Registrar
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default MovimentoModal;
