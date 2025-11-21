import React from 'react';
import { motion } from 'framer-motion';

interface SidebarSwitchProps {
  isChecked: boolean;
  onToggle: () => void;
}

const SidebarSwitch: React.FC<SidebarSwitchProps> = ({ isChecked, onToggle }) => {
  return (
    <div 
      className={`flex items-center w-12 h-7 rounded-full p-1 cursor-pointer transition-colors ${isChecked ? 'bg-blue-600 justify-end' : 'bg-gray-300 justify-start'}`}
      onClick={onToggle}
    >
      <motion.div
        className="w-5 h-5 bg-white rounded-full shadow-md"
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      />
    </div>
  );
};

export default SidebarSwitch;
