import React, { useState, useEffect, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface DecimalInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    value: number;
    onChange: (value: number) => void;
    precision?: number;
    label?: string;
    className?: string;
}

const DecimalInput = forwardRef<HTMLInputElement, DecimalInputProps>(
    ({ value, onChange, precision = 2, label, className, ...props }, ref) => {
        const [displayValue, setDisplayValue] = useState('');

        useEffect(() => {
            if (value === undefined || value === null) {
                setDisplayValue(formatValue(0));
            } else {
                setDisplayValue(formatValue(value));
            }
        }, [value, precision]);

        const formatValue = (val: number) => {
            return val.toLocaleString('pt-BR', {
                minimumFractionDigits: precision,
                maximumFractionDigits: precision,
            });
        };

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            // Get only digits
            const digits = e.target.value.replace(/\D/g, '');

            // Handle empty
            if (!digits) {
                onChange(0);
                return;
            }

            // Convert to number based on precision
            const numberValue = parseInt(digits, 10) / Math.pow(10, precision);

            onChange(numberValue);
        };

        return (
            <div className={cn("flex flex-col gap-1.5", className)}>
                {label && (
                    <label className="text-sm font-medium text-gray-700">
                        {label}
                    </label>
                )}
                <input
                    {...props}
                    ref={ref}
                    type="text"
                    inputMode="numeric"
                    value={displayValue}
                    onChange={handleChange}
                    className={cn(
                        "flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-right ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                        props.className // Allow overriding classes if passed directly
                    )}
                />
            </div>
        );
    }
);

DecimalInput.displayName = 'DecimalInput';

export default DecimalInput;
