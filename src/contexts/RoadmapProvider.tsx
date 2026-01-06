import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import RoadmapWizardModal from '@/components/roadmap/RoadmapWizardModal';
import type { RoadmapGroupKey } from '@/components/roadmap/types';

type RoadmapContextValue = {
  openRoadmap: (key?: RoadmapGroupKey) => void;
};

const RoadmapContext = createContext<RoadmapContextValue | null>(null);

export function RoadmapProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialKey, setInitialKey] = useState<RoadmapGroupKey | null>(null);

  const openRoadmap = useCallback((key?: RoadmapGroupKey) => {
    setInitialKey(key ?? null);
    setIsOpen(true);
  }, []);

  const value = useMemo<RoadmapContextValue>(() => ({ openRoadmap }), [openRoadmap]);

  return (
    <RoadmapContext.Provider value={value}>
      {children}
      <RoadmapWizardModal
        isOpen={isOpen}
        initialKey={initialKey}
        onClose={() => {
          setIsOpen(false);
          setInitialKey(null);
        }}
      />
    </RoadmapContext.Provider>
  );
}

export function useRoadmap(): RoadmapContextValue {
  const ctx = useContext(RoadmapContext);
  return (
    ctx ?? {
      openRoadmap: () => {
        // no-op (permite render isolado em testes/rotas legadas sem quebrar)
      },
    }
  );
}
