import React from 'react';
import { motion } from 'framer-motion';
import { MenuItem } from '../../config/menuConfig';

interface FloatingSubmenuProps {
  item: MenuItem;
  position: { top: number; left: number };
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const FloatingSubmenu: React.FC<FloatingSubmenuProps> = ({ item, position, onMouseEnter, onMouseLeave }) => {
  if (!item.children) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, x: -10 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95, x: -10 }}
      transition={{ duration: 0.2 }}
      className="fixed z-20 bg-glass-100/80 backdrop-blur-lg border border-white/20 rounded-xl shadow-lg p-2 w-60"
      style={{ top: position.top, left: position.left }}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <ul className="space-y-1">
        {item.children.map((child) => (
          <li key={child.name}>
            <a href={child.href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-blue-100/80 transition-colors">
              <child.icon size={16} />
              <span>{child.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </motion.div>
  );
};

export default FloatingSubmenu;
