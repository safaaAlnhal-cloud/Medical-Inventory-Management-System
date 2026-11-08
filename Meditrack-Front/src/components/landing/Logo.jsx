import React from 'react';
import { BriefcaseMedical } from 'lucide-react';

const Logo = ({ className = '', tone = 'dark' }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
      <BriefcaseMedical className="size-5" strokeWidth={2.5} />
    </span>
    <span
      className={`font-display text-xl font-semibold ${
        tone === 'light' ? 'text-primary-foreground' : 'text-foreground'
      }`}
    >
      MediTrack
    </span>
  </span>
);

export default Logo;
