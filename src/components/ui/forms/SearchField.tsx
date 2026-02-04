import React from 'react';
import { Search } from 'lucide-react';
import Input from './Input';

type SearchFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'label' | 'size'> & {
  className?: string;
};

export default function SearchField({ className, ...props }: SearchFieldProps) {
  return (
    <Input
      label={null}
      type="text"
      className={className}
      startAdornment={<Search size={18} />}
      {...props}
    />
  );
}
