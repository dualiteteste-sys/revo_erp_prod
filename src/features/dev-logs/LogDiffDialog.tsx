import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { AuditEvent } from './types';
import { Copy } from 'lucide-react';
import { useToast } from '@/contexts/ToastProvider';

interface LogDiffDialogProps {
  event: AuditEvent | null;
  isOpen: boolean;
  onClose: () => void;
}

const tabs = ['PK', 'Antes/Depois', 'Diff'];

const LogDiffDialog: React.FC<LogDiffDialogProps> = ({ event, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const { addToast } = useToast();

  if (!event) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      addToast('Copiado para a área de transferência!', 'success');
    }).catch(() => {
      addToast('Falha ao copiar.', 'error');
    });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'PK':
        return (
          <div className="relative">
            <button onClick={() => copyToClipboard(JSON.stringify(event.pk, null, 2))} className="absolute top-2 right-2 p-2 text-gray-500 hover:bg-gray-200 rounded-md">
              <Copy size={16} />
            </button>
            <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-auto font-mono">
              <code>{JSON.stringify(event.pk, null, 2)}</code>
            </pre>
          </div>
        );
      case 'Antes/Depois':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Antes</h4>
              <pre className="bg-red-50 p-4 rounded-lg text-sm overflow-auto font-mono h-96">
                <code>{JSON.stringify(event.row_old, null, 2)}</code>
              </pre>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Depois</h4>
              <pre className="bg-green-50 p-4 rounded-lg text-sm overflow-auto font-mono h-96">
                <code>{JSON.stringify(event.row_new, null, 2)}</code>
              </pre>
            </div>
          </div>
        );
      case 'Diff':
        if (!event.diff) return <p className="text-gray-500">Nenhuma diferença registrada.</p>;
        return (
          <div className="space-y-2 font-mono text-sm">
            {Object.entries(event.diff).map(([key, value]) => (
              <div key={key} className="p-2 border rounded-md">
                <strong className="font-semibold">{key}:</strong>
                <div className="flex gap-2 mt-1">
                  <span className="bg-red-100 text-red-800 px-2 py-1 rounded-md line-through flex-1 break-all">{String(value.old)}</span>
                  <span className="font-bold text-gray-500">&rarr;</span>
                  <span className="bg-green-100 text-green-800 px-2 py-1 rounded-md flex-1 break-all">{String(value.new)}</span>
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalhes do Evento de Auditoria" size="4xl">
      <div className="p-6">
        <div className="border-b border-gray-200 mb-4">
          <nav className="-mb-px flex space-x-4">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-2 px-3 border-b-2 font-medium text-sm`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
        {renderContent()}
      </div>
    </Modal>
  );
};

export default LogDiffDialog;
