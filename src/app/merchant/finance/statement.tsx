'use client';
import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { downloadCsv } from '@/lib/csv';
import { formatDate, formatPrice } from '@/lib/format';
import { CHARGE_KIND } from '@/lib/status';
import { Table, Td } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';

type S = { rows: { at: string; type: string; ref: string | null; gross: number; commission: number; amount: number; settled: boolean; prepaid?: boolean }[];
  summary: { pending_net: number; pending_charges: number; paid_total: number; subscription: { plan: string; ends_at: string } | null } };

const label = (t: string) => (t === 'sale' ? 'مبيعات' : t === 'payout' ? 'تحويل مستحقات' : `رسوم ${CHARGE_KIND[t.replace('charge_', '')] ?? ''}`);

/** كشف حساب التاجر: المبيعات والرسوم والتحويلات مع تصدير CSV */
export function Statement({ storeId }: { storeId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const { data } = useQuery(async () => {
    const { data, error } = await getSupabase().rpc('merchant_statement', { p_store: storeId, p_from: from, p_to: to });
    if (error) throw error;
    return data as S;
  }, [storeId, from, to]);
  if (!data) return null;
  const s = data.summary;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <h2 className="flex flex-1 items-center gap-2 text-lg font-bold"><FileSpreadsheet className="h-5 w-5 text-brand-600" /> كشف الحساب</h2>
        <Input type="date" className="h-10 w-40" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="h-10 w-40" value={to} max={today} onChange={(e) => setTo(e.target.value)} />
        <Button variant="outline" onClick={() => downloadCsv(`statement-${from}-${to}.csv`, [['التاريخ', 'البيان', 'المرجع', 'المبيعات', 'العمولة', 'المبلغ', 'الحالة'],
          ...data.rows.map((r) => [r.at?.slice(0, 10), label(r.type), r.ref, r.gross, r.commission, r.amount, r.settled ? 'مُسوّى' : 'معلّق'])])}><Download className="h-4 w-4" /> CSV</Button>
      </div>
      <div className="mb-3 grid gap-3 text-sm sm:grid-cols-4">
        <div className="card p-3">صافي غير مُسوّى<b className="block text-base">{formatPrice(s.pending_net)}</b></div>
        <div className="card p-3">رسوم ستُخصم<b className="block text-base text-accent-600">{formatPrice(s.pending_charges)}</b></div>
        <div className="card p-3">إجمالي المحوَّل<b className="block text-base">{formatPrice(s.paid_total)}</b></div>
        <div className="card p-3">الباقة<b className="block text-base">{s.subscription ? `${s.subscription.plan} حتى ${formatDate(s.subscription.ends_at)}` : 'بدون'}</b></div>
      </div>
      <Table head={['التاريخ', 'البيان', 'المرجع', 'المبلغ', 'الحالة']} empty={!data.rows.length}>
        {data.rows.map((r, i) => (
          <tr key={i}><Td className="text-xs">{r.at ? formatDate(r.at) : '—'}</Td><Td>{label(r.type)}{r.prepaid ? ' (مدفوعة)' : ''}</Td><Td dir="ltr" className="text-xs">{r.ref ?? '—'}</Td>
            <Td className={r.amount < 0 ? 'font-bold text-red-600' : 'font-bold'}>{formatPrice(r.amount)}</Td><Td className="text-xs">{r.settled ? 'مُسوّى' : 'معلّق'}</Td></tr>
        ))}
      </Table>
    </div>
  );
}
