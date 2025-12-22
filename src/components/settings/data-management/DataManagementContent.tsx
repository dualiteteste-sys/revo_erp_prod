import React, { useState } from 'react';
import { Trash2, Building, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { leaveCompany } from '@/services/company';
import { useToast } from '@/contexts/ToastProvider';
import { useConfirm } from '@/contexts/ConfirmProvider';

const DataManagementContent: React.FC = () => {
  const { empresas, refreshEmpresas, activeEmpresa } = useAuth();
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleLeaveCompany = async (empresaId: string, nome: string) => {
    const ok = await confirm({
      title: 'Sair da empresa',
      description: `Tem certeza que deseja sair da empresa "${nome}"?`,
      confirmText: 'Sair',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;

    setLoadingId(empresaId);
    try {
      await leaveCompany(empresaId);
      addToast('Você saiu da empresa com sucesso.', 'success');
      await refreshEmpresas();
    } catch (error: any) {
      addToast(error.message, 'error');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Gerenciamento de Dados</h1>
      <p className="text-gray-600 mb-8">Gerencie suas empresas e remova acessos não utilizados.</p>

      <div className="space-y-4">
        {empresas.map(empresa => {
          const isGhost = !empresa.nome_razao_social || empresa.nome_razao_social === 'Empresa sem nome';
          const isActive = activeEmpresa?.id === empresa.id;

          return (
            <div key={empresa.id} className={`bg-white/60 border ${isActive ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200'} rounded-xl p-4 flex items-center justify-between transition-all hover:shadow-md`}>
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isGhost ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                  {isGhost ? <AlertTriangle size={20} /> : <Building size={20} />}
                </div>
                <div>
                  <h3 className={`font-semibold ${isGhost ? 'text-orange-700' : 'text-gray-800'}`}>
                    {empresa.nome_razao_social || 'Empresa sem nome'}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">{empresa.cnpj || 'Sem CNPJ'}</p>
                </div>
              </div>

              <button
                onClick={() => handleLeaveCompany(empresa.id, empresa.nome_razao_social || 'Empresa sem nome')}
                disabled={!!loadingId}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Sair da empresa"
              >
                {loadingId === empresa.id ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
              </button>
            </div>
          );
        })}

        {empresas.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            Nenhuma empresa encontrada.
          </div>
        )}
      </div>
    </div>
  );
};

export default DataManagementContent;
