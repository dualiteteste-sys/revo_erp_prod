import React, { useMemo } from 'react';
import { renderBarcodeSvg } from '@/lib/barcode/renderSvg';

type Props = {
  value: string;
  type: 'CODE128' | 'EAN13';
  className?: string;
};

export default function BarcodePreview({ value, type, className }: Props) {
  const svg = useMemo(() => {
    if (!value) return null;
    return renderBarcodeSvg({ value, type, width: 420, height: 120, margin: 10 });
  }, [type, value]);

  if (!svg) return null;

  return (
    <div className={className}>
      <div className="p-3 rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <div className="min-w-[420px]" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
      <div className="mt-2 text-xs text-gray-600 font-mono break-all">{value}</div>
    </div>
  );
}

