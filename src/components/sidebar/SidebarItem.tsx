import React from 'react';
import { Lock } from 'lucide-react';
import { MenuItem } from '../../config/menuConfig';
import { useHasPermission } from '@/hooks/useHasPermission';
import { isPlainLeftClick } from '@/components/ui/links/isPlainLeftClick';

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
  const href = item.href && item.href !== '#' ? item.href : null;

  return (
    <li>
      {isDisabled || !href ? (
        <div
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors duration-200 text-left ${
            isActive ? 'bg-blue-600 text-white font-medium' : 'text-gray-400 cursor-not-allowed opacity-70'
          }`}
        >
          <Icon size={18} />
          <span>{item.name}</span>
          {isLocked && <Lock size={14} className="ml-auto text-gray-400" />}
        </div>
      ) : (
        <a
          href={href}
          onClick={(e) => {
            if (!isPlainLeftClick(e)) return;
            e.preventDefault();
            onClick(href);
          }}
          className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors duration-200 text-left ${
            isActive ? 'bg-blue-600 text-white font-medium' : 'text-gray-600 hover:bg-blue-500/20'
          }`}
        >
          <Icon size={18} />
          <span>{item.name}</span>
        </a>
      )}
    </li>
  );
};

export default SidebarItem;
