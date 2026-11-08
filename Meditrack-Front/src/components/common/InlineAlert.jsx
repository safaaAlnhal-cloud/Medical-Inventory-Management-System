import React from 'react';

const TONES = {
  error: 'bg-red-50 text-red-600 border border-red-100',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
};

// Message box shown inside a page or form (validation errors, save results).
const InlineAlert = ({ tone = 'error', children }) => (
  <div role={tone === 'error' ? 'alert' : 'status'} className={`p-3 rounded-xl text-xs font-bold ${TONES[tone]}`}>
    {children}
  </div>
);

export default InlineAlert;
