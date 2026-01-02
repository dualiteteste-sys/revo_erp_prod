import React from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RoadmapButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="gap-2" title="Abrir Roadmap (primeiro uso)">
      <Sparkles size={16} className="text-indigo-600" />
      Roadmap
    </Button>
  );
}

