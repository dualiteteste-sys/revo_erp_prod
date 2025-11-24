import React from 'react';
import { DatabaseBackup, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SeedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  onSeed: () => Promise<void>;
  isSeeding: boolean;
  label?: string;
  loadingLabel?: string;
}

export const SeedButton: React.FC<SeedButtonProps> = ({ 
  onSeed, 
  isSeeding, 
  label = "Popular Dados", 
  loadingLabel = "Gerando...",
  className,
  disabled,
  ...props 
}) => {
  return (
    <button
      onClick={onSeed}
      disabled={isSeeding || disabled}
      className={cn(
        "flex items-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
      title="Gerar dados fictícios para teste (verifica dependências automaticamente)"
      {...props}
    >
      {isSeeding ? (
        <Loader2 className="animate-spin" size={20} />
      ) : (
        <DatabaseBackup size={20} />
      )}
      <span>{isSeeding ? loadingLabel : label}</span>
    </button>
  );
};
