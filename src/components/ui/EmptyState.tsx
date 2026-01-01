import React from 'react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  hint?: string;
  actions?: React.ReactNode;
  className?: string;
};

export default function EmptyState({ icon, title, description, hint, actions, className }: EmptyStateProps) {
  return (
    <div className={cn('h-96 flex flex-col items-center justify-center text-center text-gray-600 p-6', className)}>
      {icon ? (
        <div className="mb-4 rounded-2xl bg-blue-50 text-blue-700 border border-blue-100 p-4">{icon}</div>
      ) : null}
      <p className="font-semibold text-lg text-gray-800">{title}</p>
      {description ? <p className="text-sm mt-1 max-w-md">{description}</p> : null}
      {hint ? <p className="text-sm mt-2 text-gray-500">{hint}</p> : null}
      {actions ? <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">{actions}</div> : null}
    </div>
  );
}

