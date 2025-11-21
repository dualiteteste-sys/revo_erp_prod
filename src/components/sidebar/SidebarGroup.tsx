import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { MenuItem } from '../../config/menuConfig';
import SidebarItem from './SidebarItem';
import { useAuth } from '../../contexts/AuthProvider';

interface SidebarGroupProps {
  item: MenuItem;
  activeItem: string;
  setActiveItem: (name: string) => void;
  isOpen: boolean;
  setOpenGroup: (name: string | null) => void;
  onOpenSettings: () => void;
}

const SidebarGroup: React.FC<SidebarGroupProps> = ({ item, activeItem, setActiveItem, isOpen, setOpenGroup, onOpenSettings }) => {
  const { signOut } = useAuth();
  const isGroupActive = item.children?.some(child => child.name === activeItem) ?? false;
  const isDirectlyActive = activeItem === item.name && !item.children;

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
      setActiveItem(item.name);
      setOpenGroup(null);
    }
  };

  return (
    <li>
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
                  isActive={activeItem === child.name}
                  onClick={() => setActiveItem(child.name)}
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
