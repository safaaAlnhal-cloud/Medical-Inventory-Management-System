import React from 'react';

// Page title, subtitle and optional action buttons on the right.
const PageHeader = ({ title, subtitle, actions, bold = false }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
    <div>
      <h2 className={`text-xl sm:text-2xl ${bold ? 'font-bold' : 'font-extrabold'} text-slate-900 font-noto-serif`}>{title}</h2>
      <p className="text-xs sm:text-sm text-slate-500 font-semibold mt-0.5">{subtitle}</p>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">{actions}</div>}
  </div>
);

export default PageHeader;
