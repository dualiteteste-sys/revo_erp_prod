import React from 'react';
import RevoLogo from './RevoLogo';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-800 text-white">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-sm font-semibold tracking-wider uppercase">Produtos</h3>
            <ul className="mt-4 space-y-2">
              <li><Link to="/" className="text-base text-gray-300 hover:text-white">REVO ERP</Link></li>
              <li><Link to="/revo-send" className="text-base text-gray-300 hover:text-white">REVO Send</Link></li>
              <li><Link to="/revo-fluxo" className="text-base text-gray-300 hover:text-white">REVO Fluxo</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-wider uppercase">Suporte</h3>
            <ul className="mt-4 space-y-2">
              <li><a href="#faq" className="text-base text-gray-300 hover:text-white">FAQ</a></li>
              <li><a href="#" className="text-base text-gray-300 hover:text-white">Documentação API</a></li>
              <li><a href="#" className="text-base text-gray-300 hover:text-white">Status do Serviço</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-wider uppercase">Empresa</h3>
            <ul className="mt-4 space-y-2">
              <li><a href="#" className="text-base text-gray-300 hover:text-white">Sobre Nós</a></li>
              <li><a href="#" className="text-base text-gray-300 hover:text-white">Carreiras</a></li>
              <li><a href="#" className="text-base text-gray-300 hover:text-white">Contato</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-wider uppercase">Legal</h3>
            <ul className="mt-4 space-y-2">
              <li><a href="#" className="text-base text-gray-300 hover:text-white">Termos de Serviço</a></li>
              <li><a href="#" className="text-base text-gray-300 hover:text-white">Política de Privacidade</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 border-t border-gray-700 pt-8 flex flex-col md:flex-row justify-between items-center">
          <RevoLogo className="h-8 w-auto text-white" />
          <p className="mt-4 md:mt-0 text-base text-gray-400">&copy; 2025 REVO ERP. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
