'use client';
import { useState, useEffect, createContext, useContext, useCallback, ReactNode } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

type ToastType = 'success' | 'error';
type ToastFn   = (message: string, type?: ToastType) => void;

interface ToastItem { id: number; message: string; type: ToastType }

const ToastContext = createContext<ToastFn | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback<ToastFn>((message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{ position:'fixed', bottom:24, right:24, display:'flex', flexDirection:'column', gap:10, zIndex:9998 }}>
        {toasts.map((t) => (
          <div key={t.id} className="animate-slide-up" style={{
            background:'var(--bg-elevated)', border:`1px solid ${t.type==='error'?'rgba(239,68,68,0.3)':'rgba(34,197,94,0.3)'}`,
            borderRadius:8, padding:'12px 16px', display:'flex', alignItems:'center', gap:10,
            minWidth:260, boxShadow:'0 8px 32px rgba(0,0,0,0.4)',
          }}>
            {t.type === 'error'
              ? <XCircle size={16} color="#f87171" />
              : <CheckCircle size={16} color="#4ade80" />}
            <span style={{ fontSize:13, color:'var(--text-primary)', fontFamily:'DM Mono, monospace' }}>{t.message}</span>
            <button
              onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', marginLeft:'auto', display:'flex' }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}