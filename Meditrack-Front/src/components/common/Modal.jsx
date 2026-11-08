import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const Modal = ({
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = 'max-w-md',
  spacing = 'space-y-5',
  titleClassName = 'text-base font-extrabold text-slate-900 font-noto-serif',
}) => {
  const titleId = useId();
  const panelRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Keyboard and screen-reader users land inside the dialog when it opens, and go back to
  // where they were when it closes.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();
    return () => { if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus(); };
  }, []);

  // The panel never grows past 90% of the viewport height. By default the whole panel scrolls.
  // With a `footer`, the title and the footer stay in place and only the content between them
  // scrolls, so the footer's buttons are always reachable however long the content is.
  const pinned = footer !== undefined;

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-[1000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div ref={panelRef} tabIndex={-1} className={`bg-white rounded-2xl w-full ${maxWidth} p-6 shadow-2xl ${spacing} max-h-[90vh] focus:outline-none ${pinned ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        <div className="flex items-center justify-between gap-3 border-b pb-3 shrink-0">
          <div className="min-w-0">
            <h3 id={titleId} className={titleClassName}>{title}</h3>
            {subtitle}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        {pinned ? (
          <>
            {/* The one scrolling area. It can take focus so the keyboard can scroll it. */}
            <div tabIndex={0} role="group" aria-labelledby={titleId} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mr-2 pr-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#115e54]/30 rounded-lg">
              {children}
            </div>
            <div className="shrink-0">{footer}</div>
          </>
        ) : children}
      </div>
    </div>
  );
};

export default Modal;
