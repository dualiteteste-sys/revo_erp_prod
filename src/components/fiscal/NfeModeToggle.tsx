import React from 'react';

const STORAGE_KEY = 'revo:nfe_mode';

export type NfeMode = 'simples' | 'avancado';

export function getNfeMode(): NfeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'avancado') return 'avancado';
  } catch { /* ignore */ }
  return 'simples';
}

export function setNfeMode(mode: NfeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch { /* ignore */ }
}

type Props = {
  mode: NfeMode;
  onChange: (mode: NfeMode) => void;
};

const NfeModeToggle: React.FC<Props> = ({ mode, onChange }) => {
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
      <button
        type="button"
        className={`px-3 py-1.5 rounded-md font-medium transition-all ${
          mode === 'simples'
            ? 'bg-white text-blue-700 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
        onClick={() => onChange('simples')}
      >
        Simples
      </button>
      <button
        type="button"
        className={`px-3 py-1.5 rounded-md font-medium transition-all ${
          mode === 'avancado'
            ? 'bg-white text-blue-700 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
        onClick={() => onChange('avancado')}
      >
        Avançado
      </button>
    </div>
  );
};

export default NfeModeToggle;
