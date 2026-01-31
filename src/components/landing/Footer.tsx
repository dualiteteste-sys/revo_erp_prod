import React from 'react';
import RevoLogo from './RevoLogo';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-xs font-semibold tracking-wider uppercase text-slate-500">Produtos</h3>
            <ul className="mt-4 space-y-2">
              <li><Link to="/" className="text-base text-slate-500 hover:text-slate-900">Ultria ERP</Link></li>
              <li><Link to="/revo-fluxo" className="text-base text-slate-500 hover:text-slate-900">Ultria Fluxo</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold tracking-wider uppercase text-slate-500">Suporte</h3>
            <ul className="mt-4 space-y-2">
              <li><a href="#faq" className="text-sm text-slate-700 hover:text-slate-900">FAQ</a></li>
              <li><a href="#" className="text-sm text-slate-700 hover:text-slate-900">Documentação API</a></li>
              <li><a href="#" className="text-sm text-slate-700 hover:text-slate-900">Status do Serviço</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold tracking-wider uppercase text-slate-500">Empresa</h3>
            <ul className="mt-4 space-y-2">
              <li><a href="#" className="text-sm text-slate-700 hover:text-slate-900">Sobre Nós</a></li>
              <li><a href="#" className="text-sm text-slate-700 hover:text-slate-900">Carreiras</a></li>
              <li><a href="#" className="text-sm text-slate-700 hover:text-slate-900">Contato</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold tracking-wider uppercase text-slate-500">Legal</h3>
            <ul className="mt-4 space-y-2">
              <li><a href="#" className="text-sm text-slate-700 hover:text-slate-900">Termos de Serviço</a></li>
              <li><a href="#" className="text-sm text-slate-700 hover:text-slate-900">Política de Privacidade</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 border-t border-slate-200 pt-8 flex flex-col md:flex-row justify-between items-center">
          <RevoLogo className="h-12 w-auto text-slate-900" />
          <p className="mt-4 md:mt-0 text-sm text-slate-500">&copy; 2026 Ultria. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
