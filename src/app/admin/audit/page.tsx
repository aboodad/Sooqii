'use client';
import { useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/misc';

type L = { id: number; actor_id: string | null; action: string; entity: string; entity_id: string | null; old_data: unknown; new_data: unknown; created_at: string };
export default function Audit() {
  const sb = getSupabase();
  const [entity, setEntity] = useState('');
  const [view, setView] = useState<L | null>(null);
  const { data } = useQuery(async () => {
    let q = sb.from('audit_logs').select('*');
    if (entity) q = q.eq('entity', entity);
    return ((await q.order('created_at', { ascending: false }).limit(150)).data ?? []) as L[];
  }, [entity]);
  return (
    <div>
      <PageHeader title="سجل التدقيق" subtitle="سجل إضافة فقط لكل تغيير حساس: الأسعار، الأدوار، العمولات، المتاجر، الكوبونات" />
      <select className="input mb-4 w-auto" value={entity} onChange={(e) => setEntity(e.target.value)}>
        <option value="">كل الكيانات</option>
        {['stores', 'seller_offers', 'user_roles', 'coupons', 'products', 'settlements', 'store_members', 'merchant_discounts', 'app_settings', 'profiles', 'categories', 'shipping_rates'].map((e) => <option key={e}>{e}</option>)}
      </select>
      <Table head={['الوقت', 'الإجراء', 'الكيان', 'المعرّف', 'المنفّذ', '']} empty={!data?.length}>
        {data?.map((l) => (
          <tr key={l.id}>
            <Td className="text-xs">{formatDate(l.created_at)}</Td><Td><Badge tone={l.action === 'delete' ? 'red' : l.action === 'insert' ? 'green' : 'blue'}>{l.action}</Badge></Td>
            <Td>{l.entity}</Td><Td dir="ltr" className="font-mono text-[11px]">{l.entity_id?.slice(0, 8)}</Td><Td dir="ltr" className="font-mono text-[11px]">{l.actor_id?.slice(0, 8) ?? 'system'}</Td>
            <Td><button className="text-xs font-semibold text-brand-600" onClick={() => setView(l)}>التفاصيل</button></Td>
          </tr>
        ))}
      </Table>
      <Modal open={!!view} onClose={() => setView(null)} title="تفاصيل التغيير" wide>
        <div className="grid gap-3 md:grid-cols-2" dir="ltr">
          <pre className="max-h-96 overflow-auto rounded-xl bg-red-50 p-3 text-[11px]">{JSON.stringify(view?.old_data, null, 2)}</pre>
          <pre className="max-h-96 overflow-auto rounded-xl bg-emerald-50 p-3 text-[11px]">{JSON.stringify(view?.new_data, null, 2)}</pre>
        </div>
      </Modal>
    </div>
  );
}
