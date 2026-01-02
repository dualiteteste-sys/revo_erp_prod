import React from 'react';
import { Lock } from 'lucide-react';
import { MenuItem } from '../../config/menuConfig';
import { useHasPermission } from '@/hooks/useHasPermission';

interface SidebarItemProps {
  item: MenuItem;
  isActive: boolean;
  onClick: (href: string) => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ item, isActive, onClick }) => {
  const Icon = item.icon;
  const permission = item.permission;
  const permQuery = useHasPermission(permission?.domain ?? '', permission?.action ?? '');
  const isLocked = !!permission && !permQuery.isLoading && !permQuery.data;
  const isDisabled = !!permission && (permQuery.isLoading || isLocked);

  return (
    <li>
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => {
          if (isDisabled) return;
          if (item.href && item.href !== '#') onClick(item.href);
        }}
        className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors duration-200 text-left ${
          isDisabled
            ? 'text-gray-400 cursor-not-allowed opacity-70'
            : isActive
            ? 'bg-blue-600 text-white font-medium'
            : 'text-gray-600 hover:bg-blue-500/20'
        }`}
      >
        <Icon size={18} />
        <span>{item.name}</span>
        {isLocked && <Lock size={14} className="ml-auto text-gray-400" />}
      </button>
    </li>
  );
};

export default SidebarItem;
