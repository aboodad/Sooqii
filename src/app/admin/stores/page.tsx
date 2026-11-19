'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate } from '@/lib/format';
import { STORE_STATUS } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td, Tabs } from '@/components/dashboard/widgets';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal, Skeleton } from '@/components/ui/misc';
import { Field, Input, Textarea } from '@/components/ui/field';

type S = { id: string; name: string; slug: string; status: string; commission_rate: number; is_featured: boolean; phone: string | null; created_at: string; description: string | null; profiles: { full_name: string } | null; cities: { name_ar: string } | null };

export default function AdminStores() {
  const sb = getSupabase();
  const [tab, setTab] = useState('pending');
  const [act, setAct] = useState<{ s: S; status: string } | null>(null);
  const [reason, setReason] = useState(''); const [commission, setCommission] = useState('');
  const { data, loading, reload } = useQuery(async () => (await sb.from('stores').select('id,name,slug,status,commission_rate,is_featured,phone,created_at,description, profiles!stores_owner_id_fkey(full_name), cities(name_ar)').order('created_at', { ascending: false })).data as unknown as S[] ?? []);

  async function apply(s: S, status: string, opts: { reason?: string; commission?: number; featured?: boolean } = {}) {
    const { error } = await sb.rpc('admin_set_store_status', { p_store: s.id, p_status: status, p_reason: opts.reason ?? null, p_commission: opts.commission ?? null, p_featured: opts.featured ?? null });
    if (error) return toast.error(errorMessage(error));
    toast.success('تم التحديث'); setAct(null); setReason(''); reload();
  }
  const rows = (data ?? []).filter((s) => s.status === tab);
  const n = (st: string) => (data ?? []).filter((s) => s.status === st).length;

  return (
    <div>
      <PageHeader title="المتاجر" subtitle="اعتماد طلبات الانضمام وضبط العمولة والتعليق" />
      <Tabs value={tab} onChange={setTab} tabs={['pending', 'active', 'suspended', 'rejected', 'closed'].map((v) => ({ v, l: STORE_STATUS[v].label, n: n(v) }))} />
      {loading ? <Skeleton className="h-64" /> : (
        <Table head={['المتجر', 'المالك', 'المدينة', 'العمولة', 'تاريخ الطلب', 'الحالة', 'الإجراءات']} empty={!rows.length}>
          {rows.map((s) => (
            <tr key={s.id}>
              <Td><p className="font-bold">{s.name} {s.is_featured && <Star className="inline h-3.5 w-3.5 fill-amber-400 text-amber-400" />}</p><p className="text-xs text-ink-muted" dir="ltr">/{s.slug} · {s.phone}</p>{s.description && <p className="mt-1 line-clamp-1 max-w-xs text-xs text-ink-soft">{s.description}</p>}</Td>
              <Td>{s.profiles?.full_name}</Td><Td>{s.cities?.name_ar}</Td><Td>{s.commission_rate}%</Td>
              <Td className="text-xs">{formatDate(s.created_at)}</Td><Td><StatusBadge map={STORE_STATUS} value={s.status} /></Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {s.status !== 'active' && <Button size="sm" onClick={() => { setCommission(String(s.commission_rate)); setAct({ s, status: 'active' }); }}>اعتماد</Button>}
                  {s.status === 'pending' && <Button size="sm" variant="danger" onClick={() => setAct({ s, status: 'rejected' })}>رفض</Button>}
                  {s.status === 'active' && <>
                    <Button size="sm" variant="outline" onClick={() => { setCommission(String(s.commission_rate)); setAct({ s, status: 'active' }); }}>العمولة</Button>
                    <Button size="sm" variant="ghost" onClick={() => apply(s, 'active', { featured: !s.is_featured })}>{s.is_featured ? 'إلغاء التمييز' : 'تمييز'}</Button>
                    <Button size="sm" variant="danger" onClick={() => setAct({ s, status: 'suspended' })}>تعليق</Button>
                  </>}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!act} onClose={() => setAct(null)} title={act?.status === 'active' ? 'اعتماد المتجر / العمولة' : act?.status === 'rejected' ? 'رفض المتجر' : 'تعليق المتجر'}>
        {act?.status === 'active' ? (
          <Field label="نسبة العمولة %"><Input inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} /></Field>
        ) : <Field label="السبب (يظهر لصاحب المتجر)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
        <Button className="mt-4 w-full" variant={act?.status === 'active' ? 'primary' : 'danger'}
          onClick={() => act && apply(act.s, act.status, act.status === 'active' ? { commission: Math.min(50, Math.max(0, Number(commission))) } : { reason })}>تأكيد</Button>
      </Modal>
    </div>
  );
}
