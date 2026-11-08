import React from 'react';

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-600',
  red: 'bg-red-50 text-red-600',
};

// `icon` is passed as a rendered element, e.g. icon={<Package className="w-4 h-4" />}
const StatCard = ({ label, value, hint, icon, tone = 'emerald' }) => (
  <div className="card-hover bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between min-h-[130px] sm:min-h-[145px]">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${TONES[tone]}`}>{icon}</div>
    </div>
    <div>
      <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-noto-serif my-1">{value}</h3>
      <span className="text-[11px] text-slate-400 font-semibold">{hint}</span>
    </div>
  </div>
);

export default StatCard;
