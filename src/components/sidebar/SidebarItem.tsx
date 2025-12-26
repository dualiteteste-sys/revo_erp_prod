import React from 'react';
import { MenuItem } from '../../config/menuConfig';

interface SidebarItemProps {
  item: MenuItem;
  isActive: boolean;
  onClick: (href: string) => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ item, isActive, onClick }) => {
  const Icon = item.icon;
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (item.href && item.href !== '#') onClick(item.href);
        }}
        className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors duration-200 text-left ${
          isActive ? 'bg-blue-600 text-white font-medium' : 'text-gray-600 hover:bg-blue-500/20'
        }`}
      >
        <Icon size={18} />
        <span>{item.name}</span>
      </button>
    </li>
  );
};

export default SidebarItem;
