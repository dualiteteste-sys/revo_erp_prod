import React, { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown } from 'lucide-react';
import RevoLogo from './RevoLogo';

interface HeaderProps {
  onLoginClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onLoginClick }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isProductsMenuOpen, setIsProductsMenuOpen] = useState(false);
  const navigate = useNavigate();

  const navLinks = useMemo(
    () => [
      { name: 'Planos', href: '#pricing' },
      { name: 'Recursos', href: '#features' },
      { name: 'FAQ', href: '#faq' },
    ],
    []
  );

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLinkClick = (href: string) => {
    if (href.startsWith('#')) {
        const element = document.querySelector(href);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    } else {
      navigate(href);
    }
    setIsMenuOpen(false);
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
          isScrolled ? 'bg-white/70 backdrop-blur-xl border-b border-slate-200/60' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-shrink-0 flex items-center gap-3">
              <Link to="/" aria-label="REVO ERP Home">
                <RevoLogo className="h-7 w-auto text-gray-900" />
              </Link>
              <div className="flex items-center">
                <span className="hidden sm:inline-flex items-center gap-2 rounded-full bg-blue-600/10 text-blue-700 px-3 py-1 text-xs font-semibold ring-1 ring-blue-600/20">
                  <span className="inline-flex h-2 w-2 rounded-full bg-blue-600" aria-hidden="true" />
                  Versão beta
                </span>
                <span className="inline-flex sm:hidden items-center rounded-full bg-blue-600/10 text-blue-700 px-2.5 py-1 text-[11px] font-semibold ring-1 ring-blue-600/20">
                  BETA
                </span>
              </div>
            </div>
            <nav className="hidden md:flex items-center space-x-8">
              <div className="relative" onMouseEnter={() => setIsProductsMenuOpen(true)} onMouseLeave={() => setIsProductsMenuOpen(false)}>
                <button className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                  Produtos <ChevronDown size={16} />
                </button>
                <AnimatePresence>
                  {isProductsMenuOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full mt-2 w-56 rounded-2xl bg-white shadow-xl ring-1 ring-black/5 p-2"
                    >
                      <Link to="/" className="block px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-slate-50">REVO ERP</Link>
                      <Link to="/revo-fluxo" className="block px-3 py-2 rounded-xl text-sm text-slate-700 hover:bg-slate-50">REVO Fluxo</Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {navLinks.map((link) => (
                <button
                  key={link.name}
                  onClick={() => handleLinkClick(link.href)}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
                >
                  {link.name}
                </button>
              ))}
            </nav>
            <div className="hidden md:block">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleLinkClick('#pricing')}
                  className="px-4 py-2 rounded-full text-sm font-semibold text-gray-800 hover:bg-gray-100 transition-colors"
                >
                  Começar
                </button>
                <button
                  onClick={onLoginClick}
                  className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 transition-colors"
                >
                  Entrar
                </button>
              </div>
            </div>
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none"
              >
                <span className="sr-only">Abrir menu</span>
                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="fixed top-16 left-0 right-0 z-30 bg-white/95 backdrop-blur-xl shadow-xl ring-1 ring-black/5 md:hidden"
          >
            <div className="px-4 pt-3 pb-4 space-y-2">
              <div className="px-3 py-2">
                <h3 className="text-xs font-semibold text-slate-500 tracking-wide">Produtos</h3>
                <div className="mt-2 space-y-1">
                  <Link to="/" className="block px-3 py-2 rounded-xl text-base font-medium text-slate-800 hover:bg-slate-50">REVO ERP</Link>
                  <Link to="/revo-fluxo" className="block px-3 py-2 rounded-xl text-base font-medium text-slate-800 hover:bg-slate-50">REVO Fluxo</Link>
                </div>
              </div>
              {navLinks.map((link) => (
                <button
                  key={link.name}
                  onClick={() => handleLinkClick(link.href)}
                  className="w-full text-left block px-3 py-2 rounded-xl text-base font-medium text-slate-800 hover:bg-slate-50"
                >
                  {link.name}
                </button>
              ))}
              <div className="pt-3 mt-2 border-t border-slate-200">
                <button
                  onClick={() => {
                    handleLinkClick('#pricing');
                    setIsMenuOpen(false);
                  }}
                  className="block w-full text-center px-6 py-2.5 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700"
                >
                  Começar
                </button>
                <button
                  onClick={() => {
                    onLoginClick();
                    setIsMenuOpen(false);
                  }}
                  className="mt-2 block w-full text-center px-6 py-2.5 rounded-full bg-slate-100 text-slate-900 font-semibold hover:bg-slate-200"
                >
                  Entrar
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Header;
