import React from 'react';
import { useAuth } from '../../contexts/AuthProvider';
import { CreditCard, AlertTriangle } from 'lucide-react';
import { Database } from '../../types/database.types';

type Subscription = Database['public']['Tables']['subscriptions']['Row'];

interface BillingBlockPageProps {
  subscription: Subscription;
}

const BillingBlockPage: React.FC<BillingBlockPageProps> = ({ subscription }) => {
  const { activeEmpresa, signOut } = useAuth();

  const statusMessages: { [key: string]: string } = {
    past_due: 'Seu pagamento está pendente.',
    canceled: 'Sua assinatura foi cancelada.',
    unpaid: 'Sua assinatura não foi paga.',
    incomplete: 'O processo de assinatura está incompleto.',
    incomplete_expired: 'A tentativa de assinatura expirou.',
    default: 'Sua assinatura precisa de atenção.'
  };

  const message = statusMessages[subscription.status] || statusMessages.default;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-red-50 via-orange-50 to-amber-50">
      <div className="w-full max-w-2xl text-center">
        <div className="bg-glass-200 backdrop-blur-xl border border-white/30 rounded-3xl shadow-glass-lg p-8 md:p-12">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-10 h-10 text-red-600" />
            </div>
          </div>
          <p className="text-sm font-semibold text-gray-700 mb-2">
            Empresa: {activeEmpresa?.fantasia || activeEmpresa?.razao_social}
          </p>
          <h1 className="text-3xl font-bold text-gray-800 mb-4">Acesso Suspenso</h1>
          <p className="text-gray-600 text-lg mb-8">
            {message} Por favor, atualize seus dados de pagamento para reativar o acesso.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <CreditCard size={20} />
              Gerenciar Assinatura
            </button>
            <button
              onClick={signOut}
              className="w-full sm:w-auto bg-white/50 px-6 py-3 rounded-lg text-sm text-gray-700 hover:bg-white/80 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingBlockPage;
