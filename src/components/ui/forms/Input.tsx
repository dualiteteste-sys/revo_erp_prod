import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import DatePicker from '@/components/ui/DatePicker';

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

interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  label?: React.ReactNode;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  helperText?: React.ReactNode;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      name,
      className,
      startAdornment,
      endAdornment,
      helperText,
      error,
      size,
      state: stateProp,
      ...inputProps
    },
    ref,
  ) => {
    const startPadding = startAdornment ? 'pl-12' : 'pl-3';
    const endPadding = endAdornment ? 'pr-12' : 'pr-3';
    const state = error ? 'error' : (stateProp ?? 'default');

    const isDate = inputProps.type === 'date';
    const valueStr = typeof inputProps.value === 'string' ? inputProps.value : '';
    const dateValue = React.useMemo(() => {
      if (!isDate) return null;
      const s = (valueStr || '').slice(0, 10);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) return null;
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (!y || !mo || !d) return null;
      return new Date(y, mo - 1, d);
    }, [isDate, valueStr]);

    const handleDateChange = React.useCallback(
      (date: Date | null) => {
        const next =
          date
            ? `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
                date.getDate(),
              ).padStart(2, '0')}`
            : '';

        const syntheticEvent = {
          target: { value: next, name },
          currentTarget: { value: next, name },
        } as unknown as React.ChangeEvent<HTMLInputElement>;

        inputProps.onChange?.(syntheticEvent);
      },
      [name, inputProps.onChange],
    );

    return (
      <div className={className}>
        {label ? (
          <label htmlFor={name} className="mb-1 block text-sm font-medium text-gray-700">
            {label}
          </label>
        ) : null}
        <div className="relative">
          {isDate ? (
            <>
              <input ref={ref} id={name} name={name} type="hidden" value={valueStr} />
              <DatePicker
                value={dateValue}
                onChange={handleDateChange}
                placeholder={inputProps.placeholder || 'Selecione uma data'}
                disabled={inputProps.disabled}
                required={inputProps.required}
                className="w-full"
                triggerClassName={cn(
                  inputVariants({ size: size ?? 'default', state }),
                  startPadding,
                  endPadding,
                  className,
                )}
              />
            </>
          ) : (
            <>
              {startAdornment && (
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <span className="text-gray-400 sm:text-sm">{startAdornment}</span>
                </div>
              )}
              <input
                ref={ref}
                id={name}
                name={name}
                {...inputProps}
                aria-invalid={!!error}
                className={cn(
                  inputVariants({ size: size ?? 'default', state }),
                  startPadding,
                  endPadding,
                  className,
                )}
              />
              {endAdornment && (
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <span className="text-gray-500 sm:text-sm">{endAdornment}</span>
                </div>
              )}
            </>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
        {!error && helperText && <p className="mt-1 text-xs text-gray-500">{helperText}</p>}
      </div>
    );
});

Input.displayName = 'Input';

export default Input;
