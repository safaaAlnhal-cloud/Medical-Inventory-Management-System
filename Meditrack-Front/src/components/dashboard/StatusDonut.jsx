import React from 'react';
import { formatNumber } from '../../utils/formatters';

// The ring's radius gives it a circumference of 100, so a segment's length is its percentage.
const RADIUS = 15.9155;
// The gap between two segments and the shortest arc still drawn, in percent of the ring.
const SEGMENT_GAP = 1.5;
const MIN_ARC = 0.5;

// A donut of counts that add up to a whole.
//   segments: [{ key, label, value, stroke, dot }]  `stroke` / `dot` are Tailwind classes
//   centerLabel: the caption under the total in the middle
const StatusDonut = ({ segments, centerLabel, loading = false }) => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const percent = (value) => (total ? (value / total) * 100 : 0);
  const summary = segments.map((segment) => `${segment.label}: ${formatNumber(segment.value)}`).join(', ');

  // Each arc starts where the previous one ended; 25 moves the start to the top of the ring.
  const arcs = segments.reduce((drawn, segment) => {
    if (segment.value <= 0) return drawn;
    const start = drawn.reduce((sum, arc) => sum + arc.length, 0);
    return [...drawn, { ...segment, length: percent(segment.value), start }];
  }, []);
  // A small gap separates neighbouring segments; a single full ring has none. Each arc is drawn
  // slightly shorter and centred in its share, so the proportions stay true.
  const gap = arcs.length > 1 ? SEGMENT_GAP : 0;
  const drawnLength = (arc) => Math.max(arc.length - gap, MIN_ARC);

  return (
    <div className="flex flex-col sm:flex-row lg:flex-col items-center gap-6">
      <div className="relative w-40 h-40 shrink-0">
        <svg viewBox="0 0 36 36" role="img" aria-label={total ? summary : 'No items to show'} className="w-full h-full">
          <circle cx="18" cy="18" r={RADIUS} fill="none" strokeWidth="3.6" className="stroke-donut-track" />
          {arcs.map((arc) => (
            <circle key={arc.key} cx="18" cy="18" r={RADIUS} fill="none" strokeWidth="3.6" strokeDasharray={`${drawnLength(arc)} ${100 - drawnLength(arc)}`} strokeDashoffset={25 - arc.start - (arc.length - drawnLength(arc)) / 2} className={`${arc.stroke} transition-all duration-500`}>
              <title>{`${arc.label}: ${formatNumber(arc.value)}`}</title>
            </circle>
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-extrabold text-ink font-noto-serif leading-none">{loading ? '…' : formatNumber(total)}</span>
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider mt-1">{centerLabel}</span>
        </div>
      </div>

      <ul className="w-full space-y-2.5">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2.5 text-xs font-bold">
            <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${segment.dot}`} />
            <span className="text-muted flex-1">{segment.label}</span>
            <span className="text-ink">{formatNumber(segment.value)}</span>
            <span className="text-muted font-semibold w-10 text-right">{Math.round(percent(segment.value))}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default StatusDonut;
