import { ChevronDown } from 'lucide-react';
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const selectVariants = cva(
  'w-full bg-white/80 border rounded-lg transition shadow-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-60 disabled:cursor-not-allowed appearance-none',
  {
    variants: {
      uiSize: {
        default: 'h-11 px-3 pr-10',
        sm: 'h-10 px-3 pr-10 text-sm',
      },
    },
    defaultVariants: {
      uiSize: 'default',
    },
  },
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement>, VariantProps<typeof selectVariants> {
  label?: React.ReactNode;
  children: React.ReactNode;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, name, children, className, uiSize, ...props }, ref) => (
    <div className={className}>
      {label != null ? <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label> : null}
      <div className="relative">
        <select
          id={name}
          name={name}
          ref={ref}
          {...props}
          className={cn(selectVariants({ uiSize: uiSize ?? 'default' }), className)}
        >
          {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
          <ChevronDown size={20} />
        </div>
      </div>
    </div>
  ),
);

Select.displayName = 'Select';

export default Select;
