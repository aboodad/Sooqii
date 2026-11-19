'use client';
import { useState } from 'react';
import { TicketPercent, X } from 'lucide-react';

export function CouponInput({ value, message, valid, onApply }: { value: string | null; message?: string; valid?: boolean; onApply: (code: string | null) => void }) {
  const [code, setCode] = useState(value ?? '');
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <TicketPercent className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input className="input pr-9 uppercase" dir="ltr" placeholder="كود الخصم" maxLength={24} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} />
        </div>
        {value ? (
          <button onClick={() => { setCode(''); onApply(null); }} className="grid w-11 place-items-center rounded-xl bg-slate-100" aria-label="إزالة"><X className="h-4 w-4" /></button>
        ) : (
          <button onClick={() => code && onApply(code)} className="rounded-xl bg-ink px-4 text-sm font-semibold text-white">تطبيق</button>
        )}
      </div>
      {value && message && <p className={`mt-1.5 text-xs ${valid ? 'text-emerald-600' : 'text-red-600'}`}>{message}</p>}
    </div>
  );
}
