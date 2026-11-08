import React from 'react';

// Shared look for text inputs and selects inside modal forms.
export const inputClassName = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:border-[#115e54]';

// The message for one field, shown under its input. Renders nothing without a message.
export const FieldError = ({ message }) => (message ? (
  <span role="alert" className="block mt-1 text-[11px] font-bold text-red-600 normal-case">{message}</span>
) : null);

const FormField = ({ label, error, children }) => (
  <label className="block space-y-1">
    <span className="block text-[11px] font-bold text-slate-500 uppercase">{label}</span>
    {children}
    <FieldError message={error} />
  </label>
);

export default FormField;
