import React from 'react';

// Shared look for every factory form's design/mockup URL input so the "Pick"
// button lines up the same way everywhere. `min-w-0` on the input is what keeps
// the pair from overflowing its grid cell on narrow columns.
const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';

interface DesignUrlFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPick: () => void;
  placeholder?: string;
  className?: string;
}

const DesignUrlField: React.FC<DesignUrlFieldProps> = ({ label, value, onChange, onPick, placeholder, className }) => (
  <div className={className}>
    <label className={labelCls}>{label}</label>
    <div className="flex gap-1">
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} min-w-0 flex-1`}
      />
      <button
        type="button"
        onClick={onPick}
        className="flex-none px-2.5 py-2 text-xs font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
        title="Pick a file from Products"
      >
        Pick
      </button>
    </div>
  </div>
);

export default DesignUrlField;
