import React from 'react';
import { LifeBuoy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';

export default function SuportePage() {
  const { session, activeEmpresa } = useAuth();
  const userId = session?.user?.id || '';
  const userEmail = (session?.user as any)?.email || '';

  return (
    <div className="p-1 h-full flex flex-col">
      <div className="mb-6 flex-shrink-0">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
          <LifeBuoy className="text-blue-600" /> Suporte
        </h1>
        <p className="text-gray-600 text-sm mt-1">MVP: informações úteis para atendimento e diagnóstico.</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Antes de abrir um chamado</h2>
          <ul className="list-disc ml-5 mt-2 text-sm text-gray-700 space-y-1">
            <li>Recarregue a página (Ctrl/Cmd + R) e tente novamente.</li>
            <li>Se der erro, copie a mensagem do console e o caminho do menu/rota onde ocorreu.</li>
            <li>Se for erro de permissão (403), confirme se o usuário tem papel/permissão na empresa.</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Empresa ativa</div>
            <div className="text-sm font-semibold text-gray-900 mt-1">{activeEmpresa?.nome_fantasia || activeEmpresa?.nome_razao_social || '-'}</div>
            <div className="text-xs text-gray-500 mt-2">empresa_id</div>
            <div className="text-sm font-mono text-gray-900 break-all">{activeEmpresa?.id || '-'}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Usuário</div>
            <div className="text-sm font-semibold text-gray-900 mt-1">{userEmail || '-'}</div>
            <div className="text-xs text-gray-500 mt-2">user_id</div>
            <div className="text-sm font-mono text-gray-900 break-all">{userId || '-'}</div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-800">Contato</h2>
          <div className="text-sm text-gray-700 mt-2 space-y-1">
            <div>Canal principal: WhatsApp / Chat (definir após go-live).</div>
            <div>Para incidentes: enviar print + rota + horário + user_id + empresa_id.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
