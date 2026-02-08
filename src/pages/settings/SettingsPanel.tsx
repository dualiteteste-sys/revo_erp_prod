import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import SettingsHeader from '../../components/settings/SettingsHeader';
import SettingsSidebar from '../../components/settings/SettingsSidebar';
import SettingsContent from '../../components/settings/SettingsContent';
import { settingsMenuConfig } from '../../config/settingsMenuConfig';

interface SettingsPanelProps {
  onClose: () => void;
  canClose?: boolean;
  initialTab?: string;
  initialItem?: string;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onClose,
  canClose = true,
  initialTab = settingsMenuConfig[0].name,
  initialItem = settingsMenuConfig[0].menu[0].name
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [activeItem, setActiveItem] = useState(initialItem);

  const currentMenu = settingsMenuConfig.find(tab => tab.name === activeTab)?.menu || [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={{ duration: 0.3 }}
        className="bg-glass-200 border border-white/20 rounded-3xl shadow-2xl w-full h-full max-w-[96vw] max-h-[95vh] flex flex-col relative"
        onClick={(e) => e.stopPropagation()}
      >
        {canClose && (
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 z-50">
            <X size={24} />
          </button>
        )}

        <SettingsHeader activeTab={activeTab} setActiveTab={setActiveTab} />

        <div className="flex-1 flex overflow-hidden">
          <SettingsSidebar menu={currentMenu} activeItem={activeItem} setActiveItem={setActiveItem} />
          <SettingsContent activeItem={activeItem} />
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SettingsPanel;
