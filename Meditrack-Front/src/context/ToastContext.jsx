import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const ToastContext = createContext(null);
const TOAST_DURATION_MS = 4000;

const TOAST_STYLES = {
  success: { className: 'border-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  error: { className: 'border-red-200 text-red-600', Icon: AlertCircle },
};

// Short success / error messages shown in the corner after an action (replaces alert()).
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const show = useCallback((type, message) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { id, type, message }]);
    window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
  }, [dismiss]);

  const value = useMemo(() => ({
    showSuccess: (message) => show('success', message),
    showError: (message) => show('error', message),
  }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[1100] flex flex-col items-end gap-2 pointer-events-none" aria-live="polite">
        {toasts.map((toast) => {
          const { className, Icon } = TOAST_STYLES[toast.type];
          return (
            <div key={toast.id} role="status" className={`pointer-events-auto max-w-sm bg-white border rounded-xl shadow-lg px-4 py-3 text-xs font-bold flex items-center gap-2 ${className}`}>
              <Icon className="w-4 h-4 shrink-0" />
              <span>{toast.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
};
