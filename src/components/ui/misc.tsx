'use client';
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPrice } from '@/lib/format';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function Rating({ value, count, size = 'sm' }: { value: number; count?: number; size?: 'sm' | 'md' }) {
  const s = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5';
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-soft">
      <span className="inline-flex" aria-label={`تقييم ${value} من 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={cn(s, i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200')} />
        ))}
      </span>
      {count !== undefined && <span>({count})</span>}
    </span>
  );
}

export function Price({ value, original, className, big }: { value: number; original?: number | null; className?: string; big?: boolean }) {
  return (
    <span className={cn('inline-flex flex-wrap items-baseline gap-x-2', className)}>
      <span className={cn('font-extrabold text-ink', big ? 'text-3xl' : 'text-base')}>{formatPrice(value)}</span>
      {original ? <span className={cn('text-ink-muted line-through', big ? 'text-base' : 'text-xs')}>{formatPrice(original)}</span> : null}
    </span>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: React.ReactNode; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="relative mb-5">
        <div className="absolute inset-0 animate-pulse rounded-full bg-brand-200/50 blur-2xl" />
        <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow [&>svg]:h-9 [&>svg]:w-9">
          {icon}
        </div>
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="mt-1 max-w-sm text-sm text-ink-soft">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog" aria-modal="true" aria-label={title}
            className={cn('relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-6 shadow-lift sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
            initial={{ y: 40, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">{title}</h3>
              <button onClick={onClose} className="rounded-xl p-2 text-ink-muted hover:bg-slate-100" aria-label="إغلاق"><X className="h-5 w-5" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function IconTile({ children, color = '#0EA5A8', className }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn('relative inline-grid place-items-center rounded-2xl text-white [&>svg]:h-5 [&>svg]:w-5', className ?? 'h-11 w-11')}
      style={{
        background: `linear-gradient(145deg, ${color}EE, ${color} 55%, ${color}CC)`,
        boxShadow: `0 8px 20px -6px ${color}99, inset 0 1px 0 rgba(255,255,255,.35), inset 0 -2px 0 rgba(0,0,0,.12)`,
      }}
    >
      <span className="pointer-events-none absolute inset-x-1.5 top-1 h-1/3 rounded-xl bg-white/25 blur-[2px]" />
      {children}
    </span>
  );
}
