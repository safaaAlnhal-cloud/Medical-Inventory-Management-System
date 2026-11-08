// src/components/common/SearchBar.jsx

import React from 'react';
import { Search } from 'lucide-react';

const SearchBar = ({
  value,
  onChange,
  placeholder = 'Search...',
  disabled = false,
}) => {
  return (
    <div className="relative w-full">
      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
        <Search className="w-4 h-4" />
      </span>

      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={disabled}
        className="
          w-full
          pl-9
          pr-3
          py-2.5
          bg-white
          border
          border-slate-200
          rounded-xl
          text-xs
          font-semibold
          text-slate-700
          placeholder:text-slate-400
          focus:outline-none
          focus:ring-2
          focus:ring-[#115e54]/20
          focus:border-[#115e54]
          transition
          font-['Nunito',sans-serif]
          disabled:opacity-60
          disabled:cursor-not-allowed
        "
      />
    </div>
  );
};

export default SearchBar;