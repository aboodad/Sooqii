'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatPrice } from '@/lib/format';
import { SETTLEMENT_STATUS } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/misc';

export default function AdminFinance() {
  const sb = getSupabase();
  const [pay, setPay] = useState<string | null>(null); const [ref, setRef] = useState('');
  const cands = useQuery(async () => { const { data, error } = await sb.rpc('admin_settlement_candidates'); if (error) throw error; return data as { store_id: string; name: string; orders: number; gross: number; commission: number; net: number }[]; });
  const sets = useQuery(async () => ((await sb.from('settlements').select('*, stores(name)').order('created_at', { ascending: false }).limit(100)).data ?? []) as unknown as { id: string; status: string; gross: number; commission: number; net: number; bank_ref: string | null; created_at: string; stores: { name: string } }[]);

  async function generate(store: string) {
    const { error } = await sb.rpc('admin_generate_settlement', { p_store: store });
    if (error) return toast.error(errorMessage(error));
    toast.success('أُنشئت مسودة التسوية'); cands.reload(); sets.reload();
  }
  async function setStatus(id: string, status: string, bank?: string) {
    const { error } = await sb.rpc('admin_set_settlement_status', { p_id: id, p_status: status, p_ref: bank ?? null });
    if (error) return toast.error(errorMessage(error));
    toast.success('تم'); setPay(null); setRef(''); sets.reload(); cands.reload();
  }
  if (cands.error) return <p className="card p-6 text-red-600">{cands.error}</p>;
  return (
    <div className="space-y-8">
      <PageHeader title="المالية والتسويات" subtitle="الدفع ≠ التسوية ≠ التحويل: تُنشأ التسوية للطلبات المسلّمة بعد مهلة الإرجاع، ثم تُعتمد، ثم يُسجَّل التحويل البنكي." />
      <div>
        <h2 className="mb-3 text-lg font-bold">مستحقات مؤهلة للتسوية</h2>
        <Table head={['المتجر', 'الطلبات', 'المبيعات', 'العمولة', 'صافي التاجر', '']} empty={!cands.data?.length}>
          {cands.data?.map((c) => (
            <tr key={c.store_id}><Td className="font-bold">{c.name}</Td><Td>{c.orders}</Td><Td>{formatPrice(c.gross)}</Td><Td>{formatPrice(c.commission)}</Td><Td className="font-bold text-brand-700">{formatPrice(c.net)}</Td><Td><Button size="sm" onClick={() => generate(c.store_id)}>إنشاء تسوية</Button></Td></tr>
          ))}
        </Table>
      </div>
      <div>
        <h2 className="mb-3 text-lg font-bold">التسويات</h2>
        <Table head={['المتجر', 'التاريخ', 'الصافي', 'العمولة', 'الحالة', 'المرجع', '']} empty={!sets.data?.length}>
          {sets.data?.map((s) => (
            <tr key={s.id}>
              <Td className="font-semibold">{s.stores?.name}</Td><Td className="text-xs">{formatDate(s.created_at)}</Td><Td className="font-bold">{formatPrice(s.net)}</Td><Td>{formatPrice(s.commission)}</Td>
              <Td><StatusBadge map={SETTLEMENT_STATUS} value={s.status} /></Td><Td dir="ltr" className="text-xs">{s.bank_ref ?? '—'}</Td>
              <Td><div className="flex gap-1">
                {s.status === 'draft' && <Button size="sm" onClick={() => setStatus(s.id, 'approved')}>اعتماد</Button>}
                {s.status === 'approved' && <Button size="sm" variant="accent" onClick={() => setPay(s.id)}>تسجيل التحويل</Button>}
                {['draft', 'approved'].includes(s.status) && <Button size="sm" variant="ghost" onClick={() => setStatus(s.id, 'cancelled')}>إلغاء</Button>}
              </div></Td>
            </tr>
          ))}
        </Table>
      </div>
      <Modal open={!!pay} onClose={() => setPay(null)} title="تسجيل التحويل البنكي">
        <Input dir="ltr" placeholder="مرجع التحويل" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} />
        <Button className="mt-4 w-full" disabled={!ref.trim()} onClick={() => pay && setStatus(pay, 'paid', ref)}>تأكيد الدفع</Button>
      </Modal>
    </div>
  );
}
