import React, { useState, useEffect } from 'react';
import { RoteiroEtapa, manageRoteiroEtapa } from '@/services/industriaRoteiros';
import { CentroTrabalho, listCentrosTrabalho } from '@/services/industriaCentros';
import { Trash2, Plus, Save, X } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';
import { motion, AnimatePresence } from 'framer-motion';

import Modal from '@/components/ui/Modal';
import CentroTrabalhoFormPanel from '@/components/industria/centros-trabalho/CentroTrabalhoFormPanel';

interface Props {
  roteiroId: string;
  etapas: RoteiroEtapa[];
  onUpdate: () => void;
  readOnly?: boolean;
}

export default function RoteiroEtapasGrid({ roteiroId, etapas, onUpdate, readOnly }: Props) {
  const { addToast } = useToast();
  const [centros, setCentros] = useState<CentroTrabalho[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isCreateCentroOpen, setIsCreateCentroOpen] = useState(false);
  const [newEtapa, setNewEtapa] = useState<Partial<RoteiroEtapa>>({
    sequencia: (etapas.length + 1) * 10,
    tipo_operacao: 'producao',
    tempo_setup_min: 0,
    tempo_ciclo_min_por_unidade: 0,
    permitir_overlap: false
  });

  useEffect(() => {
    listCentrosTrabalho(undefined, true).then(setCentros);
  }, []);

  const handleAdd = async () => {
    if (!newEtapa.centro_trabalho_id) {
      addToast('Selecione um centro de trabalho.', 'error');
      return;
    }
    try {
      await manageRoteiroEtapa(roteiroId, null, newEtapa, 'upsert');
      addToast('Etapa adicionada.', 'success');
      setIsAdding(false);
      setNewEtapa({
        sequencia: (etapas.length + 2) * 10, // Increment for next
        tipo_operacao: 'producao',
        tempo_setup_min: 0,
        tempo_ciclo_min_por_unidade: 0,
        permitir_overlap: false
      });
      onUpdate();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remover esta etapa?')) return;
    try {
      await manageRoteiroEtapa(roteiroId, id, {}, 'delete');
      addToast('Etapa removida.', 'success');
      onUpdate();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  const handleInlineUpdate = async (etapa: RoteiroEtapa, field: keyof RoteiroEtapa, value: any) => {
    const updated = { ...etapa, [field]: value };
    // Optimistic update could be done here, but for simplicity we just save
    try {
      await manageRoteiroEtapa(roteiroId, etapa.id, updated, 'upsert');
      // Silent success or toast? Silent is better for inline edits usually
      onUpdate();
    } catch (e: any) {
      addToast(e.message, 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Etapas do Processo</h3>
        {!readOnly && (
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} /> Adicionar Etapa
          </button>
        )}
      </div>

      {isAdding && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-blue-50 p-4 rounded-lg border border-blue-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-1">
            <label className="block text-xs font-medium text-gray-700">Seq.</label>
            <input type="number" value={newEtapa.sequencia} onChange={e => setNewEtapa({ ...newEtapa, sequencia: parseInt(e.target.value) })} className="w-full p-2 rounded border border-gray-300" />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-gray-700">Centro de Trabalho</label>
            <div className="flex gap-1">
              <select value={newEtapa.centro_trabalho_id || ''} onChange={e => setNewEtapa({ ...newEtapa, centro_trabalho_id: e.target.value })} className="w-full p-2 rounded border border-gray-300">
                <option value="">Selecione...</option>
                {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <button
                onClick={() => setIsCreateCentroOpen(true)}
                className="p-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                title="Novo Centro de Trabalho"
                type="button"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">Operação</label>
            <select value={newEtapa.tipo_operacao} onChange={e => setNewEtapa({ ...newEtapa, tipo_operacao: e.target.value as any })} className="w-full p-2 rounded border border-gray-300">
              <option value="producao">Produção</option>
              <option value="setup">Setup</option>
              <option value="inspecao">Inspeção</option>
              <option value="embalagem">Embalagem</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">Setup (min)</label>
            <input type="number" value={newEtapa.tempo_setup_min || 0} onChange={e => setNewEtapa({ ...newEtapa, tempo_setup_min: parseFloat(e.target.value) })} className="w-full p-2 rounded border border-gray-300" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">Ciclo (min/un)</label>
            <input type="number" value={newEtapa.tempo_ciclo_min_por_unidade || 0} onChange={e => setNewEtapa({ ...newEtapa, tempo_ciclo_min_por_unidade: parseFloat(e.target.value) })} className="w-full p-2 rounded border border-gray-300" />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <button onClick={handleAdd} className="flex-1 bg-blue-600 text-white p-2 rounded hover:bg-blue-700"><Save size={18} className="mx-auto" /></button>
            <button onClick={() => setIsAdding(false)} className="flex-1 bg-white border border-gray-300 text-gray-700 p-2 rounded hover:bg-gray-50"><X size={18} className="mx-auto" /></button>
          </div>
        </motion.div>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seq.</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Centro de Trabalho</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operação</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Setup (min)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ciclo (min/un)</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Overlap</th>
              {!readOnly && <th className="px-4 py-3 w-10"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <AnimatePresence>
              {etapas.map(etapa => (
                <motion.tr key={etapa.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={etapa.sequencia}
                      onChange={e => handleInlineUpdate(etapa, 'sequencia', parseInt(e.target.value))}
                      disabled={readOnly}
                      className="w-16 p-1 border border-transparent hover:border-gray-300 rounded bg-transparent"
                    />
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900">{etapa.centro_trabalho_nome}</td>
                  <td className="px-4 py-2 text-sm capitalize">{etapa.tipo_operacao}</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      value={etapa.tempo_setup_min || 0}
                      onChange={e => handleInlineUpdate(etapa, 'tempo_setup_min', parseFloat(e.target.value))}
                      disabled={readOnly}
                      className="w-20 p-1 text-right border border-transparent hover:border-gray-300 rounded bg-transparent"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      value={etapa.tempo_ciclo_min_por_unidade || 0}
                      onChange={e => handleInlineUpdate(etapa, 'tempo_ciclo_min_por_unidade', parseFloat(e.target.value))}
                      disabled={readOnly}
                      className="w-20 p-1 text-right border border-transparent hover:border-gray-300 rounded bg-transparent"
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={etapa.permitir_overlap}
                      onChange={e => handleInlineUpdate(etapa, 'permitir_overlap', e.target.checked)}
                      disabled={readOnly}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => handleRemove(etapa.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </motion.tr>
              ))}
            </AnimatePresence>
            {etapas.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-gray-500">Nenhuma etapa definida.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Modal
        isOpen={isCreateCentroOpen}
        onClose={() => setIsCreateCentroOpen(false)}
        title="Novo Centro de Trabalho"
        size="lg"
      >
        <CentroTrabalhoFormPanel
          centro={null}
          onSaveSuccess={() => {
            listCentrosTrabalho(undefined, true).then(setCentros);
            setIsCreateCentroOpen(false);
            addToast('Centro de trabalho criado!', 'success');
          }}
          onClose={() => setIsCreateCentroOpen(false)}
        />
      </Modal>
    </div>
  );
}
