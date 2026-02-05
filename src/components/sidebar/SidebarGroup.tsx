import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { MenuItem } from '../../config/menuConfig';
import SidebarItem from './SidebarItem';
import { useAuth } from '../../contexts/AuthProvider';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';

interface SidebarGroupProps {
  item: MenuItem;
  activeItem: string;
  setActiveItem: (href: string) => void;
  isOpen: boolean;
  setOpenGroup: (name: string | null) => void;
  onOpenSettings: () => void;
}

const SidebarGroup: React.FC<SidebarGroupProps> = ({ item, activeItem, setActiveItem, isOpen, setOpenGroup, onOpenSettings }) => {
  const { signOut } = useAuth();
  const isGroupActive = item.children?.some(child => child.href === activeItem) ?? false;
  const isDirectlyActive = activeItem === item.href && !item.children;
  const href = item.href && item.href !== '#' ? item.href : null;

  const handleGroupClick = () => {
    if (item.name === 'Configurações') {
      onOpenSettings();
      return;
    }
    if (item.name === 'Sair') {
      signOut();
      return;
    }
    
    if (item.children) {
      setOpenGroup(item.name);
    } else {
      if (item.href && item.href !== '#') setActiveItem(item.href);
      setOpenGroup(null);
    }
  };

  return (
    <li>
      {item.children || item.name === 'Sair' || !href ? (
        <button
          onClick={handleGroupClick}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-200 text-left ${
            isDirectlyActive
              ? 'bg-blue-600 text-white font-medium'
              : isGroupActive
              ? 'bg-blue-200/85 text-blue-700 font-semibold'
              : 'text-gray-700 hover:bg-white/20'
          }`}
        >
          <item.icon size={20} className="flex-shrink-0" />
          <span className="flex-1">{item.name}</span>
          {item.children && (
            <motion.div animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.2 }}>
              <ChevronDown size={16} />
            </motion.div>
          )}
        </button>
      ) : (
        <a
          href={href}
          onClick={(e) => {
            if (!isPlainLeftClick(e)) return;
            e.preventDefault();
            if (item.name === 'Configurações') {
              onOpenSettings();
              return;
            }
            setActiveItem(href);
            setOpenGroup(null);
          }}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-200 text-left ${
            isDirectlyActive ? 'bg-blue-600 text-white font-medium' : 'text-gray-700 hover:bg-white/20'
          }`}
        >
          <item.icon size={20} className="flex-shrink-0" />
          <span className="flex-1">{item.name}</span>
        </a>
      )}
      <AnimatePresence>
        {isOpen && item.children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden pt-2"
          >
            <ul className="flex flex-col gap-1 pl-7">
              {item.children.map((child) => (
                <SidebarItem
                  key={child.name}
                  item={child}
                  isActive={activeItem === child.href}
                  onClick={(href) => setActiveItem(href)}
                />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
};

export default SidebarGroup;
