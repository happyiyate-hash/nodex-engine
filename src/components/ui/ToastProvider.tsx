import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'warning' | 'info' | 'loading';
export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
}
interface ToastItem extends ToastOptions { id: string; }
interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
  updateToast: (id: string, options: ToastOptions) => void;
  dismissToast: (id: string) => void;
}
const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { icon: React.ElementType; iconClass: string; border: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-emerald-300', border: 'border-emerald-300/20' },
  error: { icon: AlertCircle, iconClass: 'text-rose-300', border: 'border-rose-300/20' },
  warning: { icon: TriangleAlert, iconClass: 'text-amber-200', border: 'border-amber-200/20' },
  info: { icon: Info, iconClass: 'text-sky-200', border: 'border-sky-200/20' },
  loading: { icon: LoaderCircle, iconClass: 'text-white/80 animate-spin', border: 'border-white/15' },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const sequence = useRef(0);

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const dismissToast = useCallback((id: string) => {
    clearTimer(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, [clearTimer]);

  const scheduleDismiss = useCallback((id: string, duration: number) => {
    clearTimer(id);
    if (duration > 0) timers.current.set(id, setTimeout(() => dismissToast(id), duration));
  }, [clearTimer, dismissToast]);

  const showToast = useCallback((options: ToastOptions) => {
    const id = `nodex-toast-${++sequence.current}`;
    const tone = options.tone || 'info';
    setToasts((current) => [...current.slice(-2), { ...options, tone, id }]);
    scheduleDismiss(id, options.duration ?? (tone === 'error' ? 6500 : tone === 'loading' ? 0 : 3800));
    return id;
  }, [scheduleDismiss]);

  const updateToast = useCallback((id: string, options: ToastOptions) => {
    const tone = options.tone || 'info';
    setToasts((current) => current.map((toast) => toast.id === id ? { ...toast, ...options, tone } : toast));
    scheduleDismiss(id, options.duration ?? (tone === 'error' ? 6500 : tone === 'loading' ? 0 : 3800));
  }, [scheduleDismiss]);

  useEffect(() => () => {
    timers.current.forEach(clearTimeout);
    timers.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, updateToast, dismissToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex flex-col items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.7rem)]" aria-label="Notifications">
        {toasts.map((toast) => {
          const tone = toast.tone || 'info';
          const style = toneStyles[tone];
          const Icon = style.icon;
          return (
            <div key={toast.id} role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'}
              className={`nodex-toast pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border ${style.border} bg-[#141517]/[.97] p-3.5 text-white shadow-[0_18px_55px_rgba(0,0,0,.62)] backdrop-blur-2xl`}>
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.045]">
                <Icon className={`h-[18px] w-[18px] ${style.iconClass}`} strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="block text-[12px] font-semibold leading-snug text-white/95">{toast.title}</span>
                {toast.description && <span className="mt-1 block text-[10px] leading-relaxed text-white/55">{toast.description}</span>}
                {tone === 'loading' && <span className="nodex-toast-progress mt-2 block h-[2px] w-full overflow-hidden rounded-full bg-white/10"><span className="block h-full w-2/5 rounded-full bg-white/75" /></span>}
              </span>
              <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/35 transition-colors hover:bg-white/[0.07] hover:text-white/80">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};
