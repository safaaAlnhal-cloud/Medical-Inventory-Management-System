import React from 'react';
import { CalendarDays } from 'lucide-react';

const ACTION_BASE = 'inline-flex items-center gap-2 rounded-full pl-3 pr-2 py-2 text-xs font-bold transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-brand';
const ACTION_VARIANTS = {
  light: { button: 'bg-white text-brand hover:bg-mint-soft shadow-sm', count: 'bg-danger-soft text-out-of-stock-text' },
  dark: { button: 'bg-brand/60 text-white border border-white/20 hover:bg-brand/80', count: 'bg-white/15 text-white' },
};

// The dark green welcome banner at the top of both dashboards: today's date and the greeting.
//   actions: optional pill buttons shown on the right,
//            [{ key, label, Icon, iconClass, count, onClick, ariaLabel, variant: 'light' | 'dark' }]
//            `count` is shown beside the label when it is a number.
const DashboardHero = ({ title, subtitle, actions = [] }) => {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-brand to-forest text-white p-6 sm:p-8 shadow-sm">
      <span aria-hidden="true" className="absolute -right-16 -top-20 w-64 h-64 rounded-full bg-white/5" />
      <span aria-hidden="true" className="absolute right-24 -bottom-24 w-48 h-48 rounded-full bg-white/5" />
      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div>
          <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-mint">
            <CalendarDays aria-hidden="true" className="w-3.5 h-3.5" />
            {today}
          </span>
          <h2 className="text-xl sm:text-2xl font-bold font-noto-serif mt-2">{title}</h2>
          <p className="text-xs sm:text-sm text-white/80 font-semibold mt-1">{subtitle}</p>
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2.5">
            {actions.map(({ key, label, Icon, iconClass = '', count, onClick, ariaLabel, variant = 'light' }) => {
              const styles = ACTION_VARIANTS[variant] ?? ACTION_VARIANTS.light;
              return (
                <button key={key} type="button" onClick={onClick} aria-label={ariaLabel} className={`${ACTION_BASE} ${styles.button}`}>
                  <Icon aria-hidden="true" className={`w-4 h-4 shrink-0 ${iconClass}`} />
                  <span>{label}</span>
                  {typeof count === 'number' && (
                    <span className={`min-w-6 px-2 py-0.5 rounded-full text-[11px] font-extrabold text-center tabular-nums ${styles.count}`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default DashboardHero;
