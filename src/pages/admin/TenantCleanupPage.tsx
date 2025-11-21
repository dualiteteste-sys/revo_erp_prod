import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2, ShieldCheck, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import Input from '@/components/ui/forms/Input';
import Toggle from '@/components/ui/forms/Toggle';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { useToast } from '@/contexts/ToastProvider';
import { previewTenantCleanup, executeTenantCleanup, CleanupUser } from '@/services/admin';

interface PreviewData {
  tenantId: string;
  users: CleanupUser[];
}

export default function TenantCleanupPage() {
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [keepEmail, setKeepEmail] = useState('');
  const [removeActive, setRemoveActive] = useState(false);

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [executing, setExecuting] = useState(false);

  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const handlePreview = async () => {
    if (!keepEmail) {
      addToast('Por favor, insira o e-mail do usuário a ser preservado.', 'warning');
      return;
    }
    setLoadingPreview(true);
    setError(null);
    setPreviewData(null);
    try {
      const users = await previewTenantCleanup(keepEmail, removeActive);
      if (users.length === 0) {
        setPreviewData({ tenantId: 'N/A', users: [] });
        addToast('Nenhum usuário para remover com os critérios selecionados.', 'info');
      } else {
        setPreviewData({ tenantId: users[0].empresa_id, users });
      }
    } catch (e: any) {
      setError(e.message || 'Erro ao buscar dados para pré-visualização.');
      addToast(e.message, 'error');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleExecute = async () => {
    setIsConfirmModalOpen(false);
    if (!keepEmail || !previewData) return;

    setExecuting(true);
    setError(null);
    try {
      const removedUsers = await executeTenantCleanup(keepEmail, removeActive);
      addToast(`${removedUsers.length} vínculos de usuário foram removidos com sucesso.`, 'success');
      setPreviewData({ tenantId: previewData.tenantId, users: [] }); // Reset preview
    } catch (e: any) {
      setError(e.message || 'Erro ao executar a limpeza.');
      addToast(e.message, 'error');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Limpeza de Usuários do Tenant</h1>
        <Button variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
      </div>

      <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 rounded-r-lg mb-6 flex items-start gap-3">
        <AlertTriangle className="h-6 w-6 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold">Atenção: Ação Destrutiva</h3>
          <p className="text-sm">Esta ferramenta remove permanentemente os vínculos dos usuários com uma empresa. A ação cria um backup, mas a remoção é irreversível pela UI. Use com extrema cautela.</p>
        </div>
      </div>

      {/* Configuration Card */}
      <div className="bg-white/80 p-6 rounded-2xl shadow-md border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">1. Configurar Limpeza</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
          <Input
            label="E-mail do Usuário a Preservar"
            name="keepEmail"
            type="email"
            placeholder="admin@exemplo.com"
            value={keepEmail}
            onChange={(e) => setKeepEmail(e.target.value)}
            disabled={loadingPreview || executing}
          />
          <Toggle
            label="Remover também usuários ATIVOS"
            name="removeActive"
            checked={removeActive}
            onChange={setRemoveActive}
            description="Por padrão, apenas convites PENDENTES são removidos."
          />
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={handlePreview} disabled={loadingPreview || executing || !keepEmail}>
            {loadingPreview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Pré-visualizar Limpeza
          </Button>
        </div>
      </div>

      {/* Preview Section */}
      {loadingPreview && (
        <div className="mt-8 flex justify-center items-center h-40">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        </div>
      )}

      {error && (
         <div className="mt-8 bg-red-100 text-red-700 p-4 rounded-lg">
            <p className="font-bold">Erro na Operação:</p>
            <p>{error}</p>
         </div>
      )}

      {previewData && !loadingPreview && (
        <div className="mt-8 bg-white/80 p-6 rounded-2xl shadow-md border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">2. Pré-visualização</h2>
          <div className="space-y-4">
            <div className="bg-gray-100 p-4 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-4">
              <InfoItem label="ID do Tenant Alvo" value={previewData.tenantId} />
              <InfoItem label="Usuário Preservado" value={keepEmail} />
              <InfoItem label="Total a Remover" value={`${previewData.users.length} usuários`} />
            </div>

            {previewData.users.length > 0 && (
              <div className="max-h-60 overflow-y-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">E-mail</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {previewData.users.map(user => (
                      <tr key={user.user_id}>
                        <td className="px-4 py-2 text-sm text-gray-800">{user.email}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${user.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                            {user.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <Button
                variant="destructive"
                onClick={() => setIsConfirmModalOpen(true)}
                disabled={executing || previewData.users.length === 0}
              >
                {executing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Executar Limpeza
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleExecute}
        isLoading={executing}
        title="Confirmar Limpeza"
        description={`Você está prestes a remover ${previewData?.users.length || 0} vínculos de usuário do tenant ${previewData?.tenantId}. Esta ação é irreversível. Deseja continuar?`}
        confirmText="Sim, Executar Limpeza"
        variant="danger"
      />
    </div>
  );
}

const InfoItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</p>
    <p className="text-md font-semibold text-gray-900 truncate">{value}</p>
  </div>
);
