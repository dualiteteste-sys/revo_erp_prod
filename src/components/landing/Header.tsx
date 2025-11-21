import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown } from 'lucide-react';
import RevoLogo from './RevoLogo';

const navLinks = [
  { name: 'Recursos', href: '#features' },
  { name: 'FAQ', href: '#faq' },
];

interface HeaderProps {
  onLoginClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onLoginClick }) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isProductsMenuOpen, setIsProductsMenuOpen] = useState(false);
  const navigate = useNavigate();

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
          isScrolled ? 'bg-white/80 backdrop-blur-lg shadow-md' : 'bg-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex-shrink-0">
              <Link to="/" aria-label="REVO ERP Home">
                <RevoLogo className="h-8 w-auto text-gray-900" />
              </Link>
            </div>
            <nav className="hidden md:flex items-center space-x-8">
              <div className="relative" onMouseEnter={() => setIsProductsMenuOpen(true)} onMouseLeave={() => setIsProductsMenuOpen(false)}>
                <button className="flex items-center gap-1 font-medium text-gray-600 hover:text-blue-600 transition-colors">
                  Produtos <ChevronDown size={16} />
                </button>
                <AnimatePresence>
                  {isProductsMenuOpen && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full mt-2 w-48 bg-white rounded-md shadow-lg py-1"
                    >
                      <Link to="/" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">REVO ERP</Link>
                      <Link to="/revo-send" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">REVO Send</Link>
                      <Link to="/revo-fluxo" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">REVO Fluxo</Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {navLinks.map((link) => (
                <button
                  key={link.name}
                  onClick={() => handleLinkClick(link.href)}
                  className="font-medium text-gray-600 hover:text-blue-600 transition-colors"
                >
                  {link.name}
                </button>
              ))}
            </nav>
            <div className="hidden md:block">
              <button
                onClick={onLoginClick}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Login
              </button>
            </div>
            <div className="md:hidden">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none"
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
            className="fixed top-20 left-0 right-0 z-30 bg-white shadow-lg md:hidden"
          >
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              <div className="px-3 py-2">
                <h3 className="text-sm font-semibold text-gray-500">Produtos</h3>
                <div className="mt-1 space-y-1">
                  <Link to="/" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">REVO ERP</Link>
                  <Link to="/revo-send" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">REVO Send</Link>
                  <Link to="/revo-fluxo" className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-50">REVO Fluxo</Link>
                </div>
              </div>
              {navLinks.map((link) => (
                <button
                  key={link.name}
                  onClick={() => handleLinkClick(link.href)}
                  className="w-full text-left block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-blue-600 hover:bg-gray-50"
                >
                  {link.name}
                </button>
              ))}
              <div className="pt-4 mt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    onLoginClick();
                    setIsMenuOpen(false);
                  }}
                  className="block w-full text-center px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-sm hover:bg-blue-700"
                >
                  Login
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
