'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const SORTS = [
  { v: 'relevance', l: 'الأكثر صلة' }, { v: 'newest', l: 'الأحدث' }, { v: 'trending', l: 'الرائج' },
  { v: 'price_asc', l: 'السعر: الأقل' }, { v: 'price_desc', l: 'السعر: الأعلى' }, { v: 'rating', l: 'الأعلى تقييمًا' }, { v: 'discount', l: 'أكبر خصم' },
];

export function Filters({ total }: { total: number }) {
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [min, setMin] = useState(sp.get('min') ?? ''); const [max, setMax] = useState(sp.get('max') ?? '');

  function update(patch: Record<string, string | null>) {
    const p = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    p.delete('page');
    router.push(`${path}?${p.toString()}`, { scroll: false });
  }
  const sort = sp.get('sort') ?? (sp.get('q') ? 'relevance' : 'newest');

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="ml-auto text-sm text-ink-soft"><b className="text-ink">{total}</b> منتج</p>
        <button onClick={() => setOpen((v) => !v)} className={cn('flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold ring-1 transition', open ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-white ring-slate-200')}>
          <SlidersHorizontal className="h-4 w-4" /> تصفية
        </button>
        <div className="scrollbar-none flex max-w-full gap-1.5 overflow-x-auto">
          {SORTS.filter((s) => s.v !== 'relevance' || sp.get('q')).map((s) => (
            <button key={s.v} onClick={() => update({ sort: s.v })}
              className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition', sort === s.v ? 'bg-ink text-white' : 'bg-white text-ink-soft ring-1 ring-slate-200 hover:ring-brand-300')}>
              {s.l}
            </button>
          ))}
        </div>
      </div>
      {open && (
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <div><label className="label">أقل سعر</label><input className="input w-32" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} /></div>
          <div><label className="label">أعلى سعر</label><input className="input w-32" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} /></div>
          <label className="flex h-11 items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={sp.get('stock') === '1'} onChange={(e) => update({ stock: e.target.checked ? '1' : null })} /> المتوفر فقط
          </label>
          <button onClick={() => update({ min: min || null, max: max || null })} className="h-11 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-white">تطبيق</button>
          {(sp.get('min') || sp.get('max') || sp.get('stock')) && (
            <button onClick={() => { setMin(''); setMax(''); update({ min: null, max: null, stock: null }); }} className="flex h-11 items-center gap-1 text-sm text-red-600"><X className="h-4 w-4" /> مسح</button>
          )}
        </div>
      )}
    </div>
  );
}
