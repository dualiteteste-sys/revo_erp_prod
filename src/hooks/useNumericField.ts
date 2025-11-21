import { useState, useEffect, useCallback } from 'react';

/**
 * A custom hook to manage numeric inputs that use a comma for the decimal separator
 * and formats the value as a Brazilian currency string (e.g., "1.234,56").
 *
 * It handles the conversion between the string representation (for the input)
 * and the numeric value (for the form state).
 *
 * @param initialValue The initial numeric value.
 * @param onChange A callback function to update the parent component's state with the new numeric value.
 * @returns An object with `value` (string) and `onChange` (handler) to be spread onto an <Input /> component.
 */
export const useNumericField = (
  initialValue: number | null | undefined,
  onChange: (value: number | null) => void
) => {
  const format = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return '';
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const parseToNumber = (value: string): number | null => {
    if (value.trim() === '') return null;
    const numericString = value.replace(/\./g, '').replace(',', '.');
    const numericValue = parseFloat(numericString);
    return isNaN(numericValue) ? null : numericValue;
  };
  
  const [stringValue, setStringValue] = useState<string>(() => format(initialValue));

  useEffect(() => {
    // This effect updates the displayed value if the initial value from the parent component changes,
    // for example, when a different item is loaded into the form.
    if (parseToNumber(stringValue) !== initialValue) {
        setStringValue(format(initialValue));
    }
  }, [initialValue]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    
    // 1. Get only the digits from the input
    const digits = rawValue.replace(/\D/g, '');
    
    if (digits === '') {
      setStringValue('');
      onChange(null);
      return;
    }

    // 2. Convert the digits to a number (as cents)
    const numberValue = parseInt(digits, 10);
    
    // 3. Format it back to a currency string
    const formattedValue = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
    }).format(numberValue / 100);

    setStringValue(formattedValue);
    onChange(numberValue / 100);
  }, [onChange]);

  return {
    value: stringValue,
    onChange: handleChange,
  };
};
