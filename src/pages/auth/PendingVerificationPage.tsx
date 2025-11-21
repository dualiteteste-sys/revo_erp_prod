import { Mail } from 'lucide-react';
import { Link } from 'react-router-dom';

const PendingVerificationPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="w-full max-w-md text-center">
        <div className="bg-glass-200 backdrop-blur-xl border border-white/30 rounded-3xl shadow-glass-lg p-8">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <Mail className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Verifique seu e-mail</h1>
          <p className="text-gray-600">
            Enviamos um link de confirmação para o seu endereço de e-mail. Por favor, clique no link para ativar sua conta.
          </p>
          <p className="text-gray-500 text-sm mt-4">
            Se não encontrar o e-mail, verifique sua caixa de spam.
          </p>
          <Link to="/" className="inline-block mt-6 bg-blue-600 text-white font-bold py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors">
            Voltar para o Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PendingVerificationPage;
