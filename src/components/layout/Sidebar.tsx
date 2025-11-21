import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import GlassCard from '../ui/GlassCard';
import { menuConfig, MenuItem } from '../../config/menuConfig';
import SidebarGroup from '../sidebar/SidebarGroup';
import FloatingSubmenu from '../sidebar/FloatingSubmenu';
import SidebarSwitch from '../sidebar/SidebarSwitch';
import CompanySwitcher from '../sidebar/CompanySwitcher';
import { useAuth } from '../../contexts/AuthProvider';
import RevoLogo from '../landing/RevoLogo';

const sidebarVariants = {
  expanded: { width: 320, transition: { type: 'spring', stiffness: 300, damping: 30 } },
  collapsed: { width: 128, transition: { type: 'spring', stiffness: 300, damping: 30 } }
};

interface SidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (isCollapsed: boolean) => void;
  onOpenSettings: () => void;
  onOpenCreateCompanyModal: () => void;
  activeItem: string;
  setActiveItem: (name: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isCollapsed, 
  setIsCollapsed, 
  onOpenSettings, 
  onOpenCreateCompanyModal,
  activeItem,
  setActiveItem
}) => {
  const [activeSubmenu, setActiveSubmenu] = useState<{ item: MenuItem; position: { top: number; left: number; } } | null>(null);
  const [isHoveringSubmenu, setIsHoveringSubmenu] = useState(false);
  const timerRef = useRef<number | null>(null);
  const { signOut } = useAuth();

  const findParentGroup = (itemName: string) => {
    const parent = menuConfig.find(group => group.children?.some(child => child.name === itemName));
    return parent ? parent.name : null;
  };

  const [openGroup, setOpenGroup] = useState<string | null>(() => findParentGroup(activeItem));

  const handleSetActiveItem = (itemName: string) => {
    setActiveItem(itemName);
    const parentName = findParentGroup(itemName);
    setOpenGroup(parentName);
  };

  const handleSetOpenGroup = (groupName: string | null) => {
    setOpenGroup(currentOpenGroup => (currentOpenGroup === groupName ? null : groupName));
  };
  
  const handleMouseEnterItem = (e: React.MouseEvent, item: MenuItem) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (item.children) {
      const rect = e.currentTarget.getBoundingClientRect();
      setActiveSubmenu({
        item,
        position: {
          top: rect.top,
          left: rect.right,
        },
      });
    } else {
      setActiveSubmenu(null);
    }
  };

  const handleMouseLeaveItem = () => {
    timerRef.current = window.setTimeout(() => {
      if (!isHoveringSubmenu) {
        setActiveSubmenu(null);
      }
    }, 100);
  };

  const handleSubmenuEnter = () => {
    setIsHoveringSubmenu(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleSubmenuLeave = () => {
    setIsHoveringSubmenu(false);
    setActiveSubmenu(null);
  };

  const handleCollapsedClick = (e: React.MouseEvent, item: MenuItem) => {
    if (item.name === 'Configurações') {
      onOpenSettings();
      return;
    }
    if (item.name === 'Sair') {
      signOut();
      return;
    }
    if (!item.children) {
      setActiveItem(item.name);
      setActiveSubmenu(null);
    }
  };

  return (
    <motion.aside
      variants={sidebarVariants}
      initial={false}
      animate={isCollapsed ? 'collapsed' : 'expanded'}
      className="h-full relative z-20"
    >
      <GlassCard className="h-full flex flex-col p-4">
        {/* HEADER */}
        <div className={`h-[88px] flex-shrink-0 flex items-center ${isCollapsed ? 'justify-center' : 'px-0'}`}>
          <RevoLogo className="h-8 w-auto text-gray-800" />
        </div>
        <div className="px-0 py-4 border-y border-white/20">
          <CompanySwitcher isCollapsed={isCollapsed} onOpenCreateCompanyModal={onOpenCreateCompanyModal} />
        </div>


        {/* NAVIGATION */}
        <nav className="flex-1 relative overflow-y-auto scrollbar-styled -mr-4 pr-4 pt-4">
          <AnimatePresence mode="wait">
            {isCollapsed ? (
              <motion.ul
                key="collapsed-nav"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 pt-4 flex flex-col items-center"
              >
                {menuConfig.map((item) => (
                  <li 
                    key={item.name} 
                    className="relative" 
                    onMouseEnter={(e) => handleMouseEnterItem(e, item)}
                    onMouseLeave={handleMouseLeaveItem}
                  >
                    <motion.div
                      className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg cursor-pointer transition-all duration-200 hover:brightness-110 bg-gradient-to-br ${item.gradient}`}
                      onClick={(e) => handleCollapsedClick(e, item)}
                      whileHover={{ scale: 1.1, y: -2 }}
                    >
                      <item.icon size={24} className="text-white" />
                    </motion.div>
                  </li>
                ))}
              </motion.ul>
            ) : (
              <motion.ul
                key="expanded-nav"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                {menuConfig.map((item) => (
                  <SidebarGroup
                    key={item.name}
                    item={item}
                    activeItem={activeItem}
                    setActiveItem={handleSetActiveItem}
                    isOpen={openGroup === item.name}
                    setOpenGroup={handleSetOpenGroup}
                    onOpenSettings={onOpenSettings}
                  />
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </nav>
        
        {/* FOOTER */}
        <div className="flex-shrink-0 pt-4 mt-4 border-t border-white/20 flex items-center justify-center">
            <SidebarSwitch 
                isChecked={!isCollapsed} 
                onToggle={() => {
                    setIsCollapsed(!isCollapsed);
                    setActiveSubmenu(null);
                }}
            />
            <AnimatePresence>
                {!isCollapsed && (
                    <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto', marginLeft: '12px' }}
                        exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                        transition={{ duration: 0.2 }}
                        className="text-sm text-slate-600 whitespace-nowrap overflow-hidden"
                    >
                        Recolher Menu
                    </motion.span>
                )}
            </AnimatePresence>
        </div>
      </GlassCard>

      <AnimatePresence>
        {activeSubmenu && isCollapsed && (
          <FloatingSubmenu 
            item={activeSubmenu.item} 
            position={activeSubmenu.position}
            onMouseEnter={handleSubmenuEnter}
            onMouseLeave={handleSubmenuLeave}
          />
        )}
      </AnimatePresence>
    </motion.aside>
  );
};

export default Sidebar;
