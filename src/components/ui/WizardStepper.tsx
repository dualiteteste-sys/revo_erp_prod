import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type WizardStep = {
  label: string;
};

type Props = {
  steps: WizardStep[];
  activeIndex: number;
  maxCompletedIndex?: number;
  className?: string;
};

export default function WizardStepper({ steps, activeIndex, maxCompletedIndex = -1, className }: Props) {
  return (
    <div className={cn('flex items-center text-sm font-medium text-gray-500', className)} aria-label="Wizard steps">
      {steps.map((step, index) => {
        const isActive = index === activeIndex;
        const isCompleted = index <= maxCompletedIndex;
        const circleClass = isActive
          ? 'border-blue-600 bg-blue-50 text-blue-600'
          : isCompleted
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-gray-300 bg-white text-gray-600';

        return (
          <React.Fragment key={`${index}:${step.label}`}>
            <div className={cn('flex items-center gap-2 shrink-0', isActive && 'text-blue-600', isCompleted && !isActive && 'text-blue-700')}>
              <span className={cn('w-8 h-8 rounded-full flex items-center justify-center border shrink-0', circleClass)}>
                {isCompleted && !isActive ? <Check size={16} /> : index + 1}
              </span>
              {step.label}
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'w-12 h-px mx-3 shrink-0',
                  isCompleted ? 'bg-blue-300/70' : 'bg-gray-300/80',
                )}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
