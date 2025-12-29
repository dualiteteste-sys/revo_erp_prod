import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import SettingsHeader from '@/components/settings/SettingsHeader';
import SettingsSidebar from '@/components/settings/SettingsSidebar';
import SettingsContent from '@/components/settings/SettingsContent';
import { settingsMenuConfig } from '@/config/settingsMenuConfig';

function findActiveFromPath(pathname: string): { tabName: string; itemName: string } {
  for (const tab of settingsMenuConfig) {
    for (const item of tab.menu) {
      if (!item.href) continue;
      if (pathname === item.href) return { tabName: tab.name, itemName: item.name };
    }
  }
  return { tabName: settingsMenuConfig[0]?.name ?? 'Geral', itemName: settingsMenuConfig[0]?.menu?.[0]?.name ?? 'Empresa' };
}

export default function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const initial = useMemo(() => findActiveFromPath(location.pathname), [location.pathname]);
  const [activeTab, setActiveTab] = useState<string>(initial.tabName);
  const [activeItem, setActiveItem] = useState<string>(initial.itemName);

  useEffect(() => {
    const next = findActiveFromPath(location.pathname);
    setActiveTab(next.tabName);
    setActiveItem(next.itemName);
  }, [location.pathname]);

  const currentMenu = useMemo(() => {
    return settingsMenuConfig.find((tab) => tab.name === activeTab)?.menu ?? [];
  }, [activeTab]);

  const handleTabChange = (tabName: string) => {
    setActiveTab(tabName);
    const first = settingsMenuConfig.find((t) => t.name === tabName)?.menu?.[0];
    if (first?.href) navigate(first.href);
  };

  const handleItemChange = (itemName: string) => {
    const item = currentMenu.find((m) => m.name === itemName);
    setActiveItem(itemName);
    if (item?.href) navigate(item.href);
  };

  return (
    <div className="h-full flex flex-col bg-white/40 rounded-2xl overflow-hidden">
      <SettingsHeader activeTab={activeTab} setActiveTab={handleTabChange} />
      <div className="flex-1 flex overflow-hidden">
        <SettingsSidebar menu={currentMenu} activeItem={activeItem} setActiveItem={handleItemChange} />
        <SettingsContent activeItem={activeItem} />
      </div>
    </div>
  );
}

