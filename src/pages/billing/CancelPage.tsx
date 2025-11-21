import React from 'react';
import { XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const BillingCancelPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50">
      <div className="w-full max-w-md text-center">
        <div className="bg-glass-200 backdrop-blur-xl border border-white/30 rounded-3xl shadow-glass-lg p-8">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="w-12 h-12 text-red-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Pagamento Cancelado</h1>
          <p className="text-gray-600 mb-6">
            O processo de pagamento foi cancelado. Sua assinatura não foi alterada.
          </p>
          <Link to="/app/settings" className="inline-block bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
            Voltar para Configurações
          </Link>
        </div>
      </div>
    </div>
  );
};

export default BillingCancelPage;
