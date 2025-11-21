import React from 'react';

interface ToggleProps {
  label: string;
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}

const Toggle: React.FC<ToggleProps> = ({ label, name, checked, onChange, description }) => (
  <div className="flex items-center gap-3">
    <button
      type="button"
      id={name}
      onClick={() => onChange(!checked)}
      className={`${
        checked ? 'bg-blue-600' : 'bg-gray-200'
      } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
      role="switch"
      aria-checked={checked}
    >
      <span
        aria-hidden="true"
        className={`${
          checked ? 'translate-x-5' : 'translate-x-0'
        } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
      />
    </button>
    <div>
        <label htmlFor={name} className="text-sm font-medium text-gray-700 cursor-pointer">{label}</label>
        {description && <p className="text-xs text-gray-500 mt-1">{description}</p>}
    </div>
  </div>
);

export default Toggle;
