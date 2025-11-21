import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
  error?: string;
}

const Input: React.FC<InputProps> = ({ label, name, className, startAdornment, endAdornment, error, ...props }) => {
  const errorClasses = error
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500';

  const startPadding = startAdornment ? 'pl-12' : 'pl-3';
  const endPadding = endAdornment ? 'pr-12' : 'pr-3';

  return (
    <div className={className}>
      {label && <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <div className="relative">
        {startAdornment && (
          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
            <span className="text-gray-400 sm:text-sm">{startAdornment}</span>
          </div>
        )}
        <input
          id={name}
          name={name}
          {...props}
          className={`w-full p-3 bg-white/80 border rounded-lg transition shadow-sm ${errorClasses} ${startPadding} ${endPadding}`}
        />
        {endAdornment && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <span className="text-gray-500 sm:text-sm">{endAdornment}</span>
          </div>
        )}
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
};

export default Input;
