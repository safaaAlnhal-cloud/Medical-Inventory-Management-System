import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// A password input with an eye button on its right that shows what was typed, as text, until
// pressed again. Every other prop (value, onChange, autoComplete, required...) goes to the input
// itself, and `className` is the input's own style: the right padding keeps long passwords
// from running under the button.
const PasswordInput = ({ className = '', ...inputProps }) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input {...inputProps} type={shown ? 'text' : 'password'} className={`${className} pr-10`} />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        title={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-[#0e6255] transition cursor-pointer"
      >
        {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

export default PasswordInput;
