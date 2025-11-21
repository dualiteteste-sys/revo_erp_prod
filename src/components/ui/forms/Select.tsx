import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  children: React.ReactNode;
}

const Select: React.FC<SelectProps> = ({ label, name, children, className, ...props }) => (
  <div className={className}>
    {label && <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
    <div className="relative">
      <select
        id={name}
        name={name}
        {...props}
        className="w-full p-3 pr-10 bg-white/80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm appearance-none"
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
        <ChevronDown size={20} />
      </div>
    </div>
  </div>
);

export default Select;
