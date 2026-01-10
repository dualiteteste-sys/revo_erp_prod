import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import TextArea from '@/components/ui/forms/TextArea';
import { Loader2, Save } from 'lucide-react';
import { registrarMovimento, transferirEstoque, EstoqueDeposito, EstoquePosicao } from '@/services/suprimentos';
import { useToast } from '@/contexts/ToastProvider';
import { useNumericField } from '@/hooks/useNumericField';

interface MovimentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  produto: EstoquePosicao;
  onSuccess: () => void;
  depositos?: EstoqueDeposito[];
  depositoId?: string | null;
}

const MovimentoModal: React.FC<MovimentoModalProps> = ({ isOpen, onClose, produto, onSuccess, depositos = [], depositoId = null }) => {
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [tipo, setTipo] = useState('entrada');
  const [quantidade, setQuantidade] = useState<number | ''>('');
  const [custo, setCusto] = useState<number | null>(null);
  const [docRef, setDocRef] = useState('');
  const [obs, setObs] = useState('');
  const [deposito, setDeposito] = useState<string>(depositoId || '');
  const [depositoFrom, setDepositoFrom] = useState<string>(depositoId || '');
  const [depositoTo, setDepositoTo] = useState<string>('');

  const custoProps = useNumericField(custo, setCusto);

  const canUseDepositos = depositos.length > 0;
  const canMoveDeposito = (id: string) => {
    const d = depositos.find((x) => x.id === id);
    return d ? d.can_move : true;
  };

  const depositosAtivos = depositos.filter((d) => d.ativo && d.can_view);

  const handleSave = async () => {
    if (!quantidade || Number(quantidade) <= 0) {
      addToast('Informe uma quantidade válida.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (tipo === 'transferencia') {
        if (!depositoFrom || !depositoTo || depositoFrom === depositoTo) {
          addToast('Selecione depósitos diferentes para transferir.', 'error');
          return;
        }
        if (!canMoveDeposito(depositoFrom) || !canMoveDeposito(depositoTo)) {
          addToast('Sem permissão para transferir em um dos depósitos.', 'warning');
          return;
        }
        await transferirEstoque({
          produtoId: produto.produto_id,
          depositoFromId: depositoFrom,
          depositoToId: depositoTo,
          quantidade: Number(quantidade),
          documentoRef: docRef || null,
          observacao: obs || null,
        });
        addToast('Transferência registrada com sucesso!', 'success');
      } else {
        if (canUseDepositos && !deposito) {
          addToast('Selecione um depósito.', 'warning');
          return;
        }
        if (canUseDepositos && !canMoveDeposito(deposito)) {
          addToast('Sem permissão para movimentar neste depósito.', 'warning');
          return;
        }
        await registrarMovimento({
          produto_id: produto.produto_id,
          tipo,
          quantidade: Number(quantidade),
          custo_unitario: custo || undefined,
          documento_ref: docRef,
          observacao: obs,
          deposito_id: canUseDepositos ? deposito : null,
        });
        addToast('Movimentação registrada com sucesso!', 'success');
      }
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
            {canUseDepositos ? <option value="transferencia">Transferência entre depósitos</option> : null}
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
                label="Custo Unitário" 
                name="custo" 
                startAdornment="R$"
                inputMode="numeric"
                {...custoProps} 
                placeholder="0,00"
            />
        )}

        {canUseDepositos ? (
          tipo === 'transferencia' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="De depósito" name="deposito_from" value={depositoFrom} onChange={(e) => setDepositoFrom(e.target.value)}>
                <option value="">Selecione…</option>
                {depositosAtivos.map((d) => (
                  <option key={d.id} value={d.id} disabled={!d.can_move}>
                    {d.nome}
                    {!d.can_move ? ' (sem permissão)' : ''}
                  </option>
                ))}
              </Select>
              <Select label="Para depósito" name="deposito_to" value={depositoTo} onChange={(e) => setDepositoTo(e.target.value)}>
                <option value="">Selecione…</option>
                {depositosAtivos.map((d) => (
                  <option key={d.id} value={d.id} disabled={!d.can_move}>
                    {d.nome}
                    {!d.can_move ? ' (sem permissão)' : ''}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <Select label="Depósito" name="deposito" value={deposito} onChange={(e) => setDeposito(e.target.value)}>
              <option value="">Selecione…</option>
              {depositosAtivos.map((d) => (
                <option key={d.id} value={d.id} disabled={!d.can_move}>
                  {d.nome}
                  {d.is_default ? ' (padrão)' : ''}
                  {!d.can_move ? ' (sem permissão)' : ''}
                </option>
              ))}
            </Select>
          )
        ) : null}

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
