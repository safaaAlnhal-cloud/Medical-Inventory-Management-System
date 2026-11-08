import React from 'react';
import { ArrowUpRight } from 'lucide-react';

// One colour per meaning across both dashboards (the tokens are defined in index.css):
// brand for neutral figures, forest for healthy stock and value, amber for warnings,
// expired for expired stock, sage for transactions.
// `bar` is the card's top accent, `icon` the icon tile's background and icon colour.
const TONES = {
  brand: { icon: 'bg-mint-soft text-brand', bar: 'bg-brand' },
  forest: { icon: 'bg-mint-soft text-forest', bar: 'bg-forest' },
  amber: { icon: 'bg-low-stock-soft text-low-stock-accent', bar: 'bg-low-stock-accent' },
  expired: { icon: 'bg-expired-soft text-expired', bar: 'bg-expired' },
  sage: { icon: 'bg-sage-soft text-muted', bar: 'bg-sage' },
};

const StatTile = ({ stat, loading, dense }) => {
  const tone = TONES[stat.tone] ?? TONES.brand;
  const Tag = stat.onClick ? 'button' : 'div';
  const interactive = stat.onClick
    ? { type: 'button', onClick: stat.onClick, 'aria-label': `${stat.label}: ${stat.value}. ${stat.actionLabel ?? 'Open'}` }
    : {};

  return (
    <Tag
      {...interactive}
      className={`card-hover group relative overflow-hidden bg-white ${dense ? 'p-5 xl:p-4 2xl:p-5' : 'p-5'} rounded-2xl border border-card-border shadow-sm text-left flex flex-col gap-4 min-w-0 ${stat.onClick ? 'cursor-pointer hover:border-mint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40' : ''} ${stat.className ?? ''}`}
    >
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${tone.bar}`} />
      <div className="flex items-center justify-between gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone.icon}`}>{stat.icon}</span>
        {stat.onClick && <ArrowUpRight aria-hidden="true" className="w-4 h-4 text-mint group-hover:text-brand transition-colors" />}
      </div>
      <div className="min-w-0">
        <span className="block text-[11px] font-bold text-muted uppercase tracking-wider">{stat.label}</span>
        {loading ? (
          <span aria-hidden="true" className="block h-8 w-20 my-1.5 rounded-lg bg-sage-soft animate-pulse" />
        ) : (
          <span title={String(stat.value)} className={`block ${dense ? 'text-2xl xl:text-[22px] 2xl:text-[26px]' : 'text-2xl sm:text-[28px]'} leading-tight font-extrabold text-ink font-noto-serif my-1 truncate`}>{stat.value}</span>
        )}
        <span className="block text-[11px] text-muted font-semibold leading-snug">{stat.hint}</span>
      </div>
    </Tag>
  );
};

// The summary cards at the top of a dashboard. Each dashboard passes the cards its role needs:
//   stats: [{ key, label, value, hint, icon, tone, onClick, actionLabel, className }]
//          `value` is already formatted; `onClick` makes the card a shortcut to the related page.
//   columns: the grid's column classes.
//   dense:   slightly smaller padding and figures on mid-size desktops, for five cards in a row.
const DashboardStats = ({ stats, loading = false, columns = 'sm:grid-cols-2 xl:grid-cols-4', dense = false }) => (
  <div className={`grid grid-cols-1 gap-4 sm:gap-5 ${columns}`}>
    {stats.map((stat) => <StatTile key={stat.key} stat={stat} loading={loading} dense={dense} />)}
  </div>
);

export default DashboardStats;
