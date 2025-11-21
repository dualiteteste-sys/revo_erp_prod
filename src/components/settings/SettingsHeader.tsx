import React from 'react';
import { motion } from 'framer-motion';
import { settingsMenuConfig } from '../../config/settingsMenuConfig';

interface SettingsHeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const SettingsHeader: React.FC<SettingsHeaderProps> = ({ activeTab, setActiveTab }) => {
  return (
    <header className="flex-shrink-0 p-4 border-b border-white/20">
      <div className="flex items-center space-x-2">
        {settingsMenuConfig.map((tab) => (
          <button
            key={tab.name}
            onClick={() => setActiveTab(tab.name)}
            className={`relative px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.name ? 'text-gray-800' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {activeTab === tab.name && (
              <motion.div
                layoutId="settings-active-tab"
                className="absolute inset-0 bg-white/60 rounded-lg z-0"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            )}
            <span className="relative z-10">{tab.name}</span>
          </button>
        ))}
      </div>
    </header>
  );
};

export default SettingsHeader;
