import React, { useState } from 'react';
import { HeartHandshake, PlusCircle, Settings } from 'lucide-react';
import CrmKanbanBoard from '@/components/vendas/crm/CrmKanbanBoard';
import Modal from '@/components/ui/Modal';
import DealFormPanel from '@/components/vendas/crm/DealFormPanel';
import { CrmOportunidade, seedCrm } from '@/services/crm';
import { SeedButton } from '@/components/common/SeedButton';
import { useToast } from '@/contexts/ToastProvider';
import PipelineConfigPanel from '@/components/vendas/crm/PipelineConfigPanel';

export default function CrmPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<CrmOportunidade | null>(null);
  const [targetEtapaId, setTargetEtapaId] = useState<string>('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isSeeding, setIsSeeding] = useState(false);
  const { addToast } = useToast();

  const handleNewDeal = (etapaId: string) => {
    setSelectedDeal(null);
    setTargetEtapaId(etapaId);
    setIsFormOpen(true);
  };

  const handleEditDeal = (deal: CrmOportunidade) => {
    setSelectedDeal(deal);
    setTargetEtapaId(deal.etapa_id || '');
    setIsFormOpen(true);
  };

  const handleSuccess = () => {
    setRefreshTrigger(prev => prev + 1);
    setIsFormOpen(false);
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedCrm();
      addToast('5 Oportunidades geradas com sucesso!', 'success');
      handleSuccess();
    } catch (e: any) {
      addToast(e.message || 'Erro ao popular dados.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <HeartHandshake className="text-red-600" /> CRM - Funil de Vendas
          </h1>
          <p className="text-gray-600 text-sm mt-1">Gestão de oportunidades e negociações.</p>
        </div>
        <div className="flex items-center gap-2">
            <SeedButton 
              onSeed={handleSeed} 
              isSeeding={isSeeding} 
            />
            <button
              onClick={() => setIsConfigOpen(true)}
              className="flex items-center gap-2 bg-white border border-gray-300 text-gray-800 font-semibold py-2 px-4 rounded-lg hover:bg-gray-50 transition-colors"
              title="Configurar etapas do funil"
            >
              <Settings size={20} />
              Configurar Etapas
            </button>
            <button
              onClick={() => handleNewDeal('')} // Empty string will use default logic in form or fail gracefully
              className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <PlusCircle size={20} />
              Nova Oportunidade
            </button>
        </div>
      </div>

      <div className="flex-grow overflow-hidden">
        <CrmKanbanBoard 
            onEditDeal={handleEditDeal} 
            onNewDeal={handleNewDeal} 
            refreshTrigger={refreshTrigger}
        />
      </div>

      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title={selectedDeal ? 'Editar Oportunidade' : 'Nova Oportunidade'} size="lg">
        <DealFormPanel 
            deal={selectedDeal} 
            funilId="" // Will rely on backend default or existing deal data
            etapaId={targetEtapaId}
            onSaveSuccess={handleSuccess} 
            onClose={() => setIsFormOpen(false)} 
        />
      </Modal>

      <Modal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        title="Configurar Etapas do Funil"
        size="4xl"
      >
        <PipelineConfigPanel
          onChanged={() => {
            setRefreshTrigger((v) => v + 1);
          }}
        />
      </Modal>
    </div>
  );
}
