'use client';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDay, formatNumber } from '@/lib/format';

export function StatCard({ label, value, icon, color = '#0EA5A8', hint, index = 0 }: {
  label: string; value: string | number; icon: React.ReactNode; color?: string; hint?: string; index?: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
      className="card group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full opacity-15 blur-xl transition-transform duration-500 group-hover:scale-150" style={{ background: color }} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-sm text-ink-soft">{label}</p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
        </div>
        <span className="grid h-12 w-12 place-items-center rounded-2xl text-white [&>svg]:h-6 [&>svg]:w-6"
          style={{ background: `linear-gradient(145deg, ${color}EE, ${color})`, boxShadow: `0 10px 24px -8px ${color}AA, inset 0 1px 0 rgba(255,255,255,.35)` }}>
          {icon}
        </span>
      </div>
    </motion.div>
  );
}

/** مخطط أعمدة SVG خفيف بلا مكتبات */
export function BarChart({ data, valueKey, label, color = '#0EA5A8', format = formatNumber }: {
  data: Record<string, number | string>[]; valueKey: string; label: string; color?: string; format?: (n: number) => string;
}) {
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...values, 1);
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between"><h3 className="font-bold">{label}</h3><span className="text-sm text-ink-muted">آخر 14 يومًا</span></div>
      <div className="flex h-44 items-end gap-1.5" dir="ltr">
        {data.map((d, i) => {
          const v = values[i];
          return (
            <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
              <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100">{format(v)}</span>
              <motion.div initial={{ height: 0 }} animate={{ height: `${Math.max((v / max) * 100, 2)}%` }} transition={{ delay: i * 0.03, type: 'spring', damping: 20 }}
                className="w-full rounded-t-lg transition group-hover:brightness-110" style={{ background: `linear-gradient(to top, ${color}99, ${color})` }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-ink-muted" dir="ltr">
        <span>{data[0] ? formatDay(String(data[0].day)) : ''}</span><span>{data.at(-1) ? formatDay(String(data.at(-1)!.day)) : ''}</span>
      </div>
    </div>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-right text-xs font-semibold text-ink-soft">
            <tr>{head.map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{children}</tbody>
        </table>
      </div>
      {empty && <p className="p-10 text-center text-sm text-ink-muted">لا توجد بيانات</p>}
    </div>
  );
}
export const Td = ({ children, className, dir }: { children: React.ReactNode; className?: string; dir?: 'ltr' | 'rtl' }) => <td dir={dir} className={cn('px-4 py-3 align-middle', className)}>{children}</td>;

export function Tabs({ tabs, value, onChange }: { tabs: { v: string; l: string; n?: number }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="scrollbar-none mb-4 flex gap-1.5 overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.v} onClick={() => onChange(t.v)}
          className={cn('flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition', value === t.v ? 'bg-ink text-white' : 'bg-white text-ink-soft ring-1 ring-slate-200 hover:ring-brand-300')}>
          {t.l}{t.n !== undefined && <span className={cn('rounded-full px-1.5 text-[10px]', value === t.v ? 'bg-white/20' : 'bg-slate-100')}>{t.n}</span>}
        </button>
      ))}
    </div>
  );
}
