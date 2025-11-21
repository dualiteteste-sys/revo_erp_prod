import React from 'react';
import { MenuItem } from '../../config/menuConfig';

interface SidebarItemProps {
  item: MenuItem;
  isActive: boolean;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ item, isActive, onClick }) => {
  const Icon = item.icon;
  return (
    <li>
      <a
        href={item.href}
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
        className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors duration-200 ${
          isActive
            ? 'bg-blue-600 text-white font-medium'
            : 'text-gray-600 hover:bg-blue-500/20'
        }`}
      >
        <Icon size={18} />
        <span>{item.name}</span>
      </a>
    </li>
  );
};

export default SidebarItem;
