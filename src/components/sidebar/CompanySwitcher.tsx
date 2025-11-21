import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronsUpDown, Check, PlusCircle, Building2, Sparkles } from 'lucide-react';
import { useSubscription } from '../../contexts/SubscriptionProvider';
import RevoLogo from '../landing/RevoLogo';

interface CompanySwitcherProps {
  isCollapsed: boolean;
  onOpenCreateCompanyModal: () => void;
}

const CompanySwitcher: React.FC<CompanySwitcherProps> = ({ isCollapsed, onOpenCreateCompanyModal }) => {
  const { empresas, activeEmpresa, setActiveEmpresa } = useAuth();
  const { subscription } = useSubscription();
  const [isOpen, setIsOpen] = useState(false);

  const trialEndDate = subscription?.status === 'trialing' && subscription.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('pt-BR')
    : null;

  if (isCollapsed) {
    return (
      <div className="w-16 h-16 flex items-center justify-center flex-shrink-0">
        <RevoLogo className="h-8 w-auto text-gray-800" />
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 rounded-xl bg-white/20 hover:bg-white/40 transition-colors"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
             <Building2 className="h-6 w-6 text-gray-600" />
          </div>
          <div className="flex-1 text-left overflow-hidden">
            <p className="text-sm font-semibold text-gray-800 truncate">
              {activeEmpresa?.fantasia || activeEmpresa?.razao_social}
            </p>
            {trialEndDate ? (
              <div className="flex items-center gap-1">
                <Sparkles size={12} className="text-green-600" />
                <p className="text-xs text-green-700 font-medium">Trial termina em {trialEndDate}</p>
              </div>
            ) : (
              <p className="text-xs text-gray-600">Empresa Ativa</p>
            )}
          </div>
        </div>
        <ChevronsUpDown size={18} className="text-gray-600 flex-shrink-0" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full mt-2 w-full bg-glass-100/90 backdrop-blur-lg border border-white/20 rounded-xl shadow-lg p-2 z-30"
          >
            <div className="max-h-60 overflow-y-auto scrollbar-styled">
              {empresas.map((empresa) => (
                <button
                  key={empresa.id}
                  onClick={async () => {
                    await setActiveEmpresa(empresa);
                    setIsOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-md text-sm text-gray-700 hover:bg-blue-100/80 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <Building2 size={16} />
                    <span className="truncate">{empresa.fantasia || empresa.razao_social}</span>
                  </div>
                  {activeEmpresa?.id === empresa.id && <Check size={16} className="text-blue-600" />}
                </button>
              ))}
            </div>
            <div className="border-t border-white/20 mt-2 pt-2">
              <button
                onClick={() => {
                  onOpenCreateCompanyModal();
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 p-2 rounded-md text-sm text-blue-600 hover:bg-blue-100/80 transition-colors"
              >
                <PlusCircle size={16} />
                <span>Nova Empresa</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CompanySwitcher;
