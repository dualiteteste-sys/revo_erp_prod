import React from 'react';
import { motion } from 'framer-motion';
import { SettingsMenuItem } from '../../config/settingsMenuConfig';

interface SettingsSidebarProps {
  menu: SettingsMenuItem[];
  activeItem: string;
  setActiveItem: (item: string) => void;
}

const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ menu, activeItem, setActiveItem }) => {
  return (
    <aside className="w-64 p-4 flex-shrink-0">
      <nav className="space-y-2">
        {menu.map((item) => (
          <button
            key={item.name}
            onClick={() => setActiveItem(item.name)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg text-left transition-colors relative ${
              activeItem === item.name ? 'text-blue-700 font-semibold' : 'text-gray-600 hover:bg-white/20'
            }`}
          >
            {activeItem === item.name && (
              <motion.div
                layoutId="settings-active-item"
                className="absolute inset-0 bg-blue-100/80 rounded-lg z-0"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-3">
              <item.icon size={18} />
              {item.name}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
};

export default SettingsSidebar;
