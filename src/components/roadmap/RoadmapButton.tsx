import React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRoadmap } from '@/contexts/RoadmapProvider';
import type { RoadmapGroupKey } from '@/components/roadmap/types';

type Props = {
  onClick?: () => void;
  contextKey?: RoadmapGroupKey;
  label?: string;
  title?: string;
};

export default function RoadmapButton({ onClick, contextKey, label = 'Roadmap', title = 'Abrir assistente (primeiro uso)' }: Props) {
  const { openRoadmap } = useRoadmap();
  const handleClick = onClick ?? (() => openRoadmap(contextKey));
  return (
    <Button variant="outline" size="sm" onClick={handleClick} className="gap-2" title={title}>
      <Sparkles size={16} className="text-indigo-600" />
      {label}
    </Button>
  );
}
