import React from 'react';
import { Eye, Pencil, Trash } from 'lucide-react';

// The icons of the action buttons in table rows (view details, edit, delete / cancel), drawn the
// same way everywhere. The button around each icon sets its size and gray colour.

export const ACTION_ICON_CLASS = 'w-4 h-4';
// Gray icon on a row action button, darker on hover; the button keeps its own padding and shape.
export const ACTION_BUTTON_TONE = 'text-slate-500 hover:text-slate-700 hover:bg-slate-100';

// View details: the eye icon the tables have always used.
export const ViewIcon = ({ className = ACTION_ICON_CLASS }) => (
  <Eye aria-hidden="true" className={className} />
);

// A solid pencil: the body is filled with the icon colour.
export const EditIcon = ({ className = ACTION_ICON_CLASS }) => (
  <Pencil aria-hidden="true" fill="currentColor" strokeWidth={1.75} className={className} />
);

// A solid trash can: the can is filled with the icon colour, the lid stays a line.
export const DeleteIcon = ({ className = ACTION_ICON_CLASS }) => (
  <Trash aria-hidden="true" fill="currentColor" strokeWidth={1.75} className={className} />
);
