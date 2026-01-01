import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'w-full bg-white/80 border rounded-lg transition shadow-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:opacity-60 disabled:cursor-not-allowed',
  {
    variants: {
      size: {
        default: 'h-11 px-3',
        sm: 'h-10 px-3 text-sm',
      },
      state: {
        default: 'border-input',
        error: 'border-destructive focus-visible:ring-destructive',
      },
    },
    defaultVariants: {
      size: 'default',
      state: 'default',
    },
  },
);

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement>, VariantProps<typeof inputVariants> {
  label?: React.ReactNode;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  helperText?: React.ReactNode;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, name, className, startAdornment, endAdornment, helperText, error, ...props }, ref) => {
  const startPadding = startAdornment ? 'pl-12' : 'pl-3';
  const endPadding = endAdornment ? 'pr-12' : 'pr-3';
  const state = error ? 'error' : 'default';

  return (
    <div className={className}>
      {label ? <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label> : null}
      <div className="relative">
        {startAdornment && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
            <span className="text-gray-400 sm:text-sm">{startAdornment}</span>
          </div>
        )}
        <input
          ref={ref}
          id={name}
          name={name}
          {...props}
          aria-invalid={!!error}
          className={cn(
            inputVariants({ size: props.size ?? 'default', state }),
            startPadding,
            endPadding,
            props.className,
          )}
        />
        {endAdornment && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <span className="text-gray-500 sm:text-sm">{endAdornment}</span>
          </div>
        )}
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      {!error && helperText && <p className="text-gray-500 text-xs mt-1">{helperText}</p>}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
