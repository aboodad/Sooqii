'use client';
import { Minus, Plus, Trash2 } from 'lucide-react';

export function QtyStepper({ qty, max = 99, onChange, disabled }: { qty: number; max?: number; onChange: (q: number) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex items-center rounded-xl bg-slate-100 p-0.5">
      <button disabled={disabled || qty >= max} onClick={() => onChange(qty + 1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white disabled:opacity-40" aria-label="زيادة"><Plus className="h-3.5 w-3.5" /></button>
      <span className="w-8 text-center text-sm font-bold">{qty}</span>
      <button disabled={disabled} onClick={() => onChange(qty - 1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white" aria-label={qty === 1 ? 'حذف' : 'إنقاص'}>
        {qty === 1 ? <Trash2 className="h-3.5 w-3.5 text-red-500" /> : <Minus className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
