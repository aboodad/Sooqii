'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { useSession } from '@/hooks/use-session';
import { couponSchema, firstError } from '@/lib/validation';
import { formatPrice } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { Table, Td } from './widgets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/misc';

/** إدارة الكوبونات — للمتجر (issuer=store) أو للمنصة (issuer=platform) */
export function CouponManager({ storeId }: { storeId?: string }) {
  const sb = getSupabase();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: '', type: 'percent', value: '', min_cart_value: '0', max_discount: '', usage_limit: '', per_user_limit: '1' });
  const { data, reload } = useQuery(async () => {
    const base = sb.from('coupons').select('*');
    const q = storeId ? base.eq('store_id', storeId) : base.eq('issuer', 'platform');
    return (await q.order('created_at', { ascending: false })).data ?? [];
  }, [storeId]);

  async function create() {
    const parsed = couponSchema.safeParse({ ...f, max_discount: f.max_discount || undefined, usage_limit: f.usage_limit || undefined });
    if (!parsed.success) return toast.error(firstError(parsed));
    if (parsed.data.type === 'percent' && parsed.data.value > 90) return toast.error('النسبة القصوى 90%');
    const { error } = await sb.from('coupons').insert({ ...parsed.data, issuer: storeId ? 'store' : 'platform', store_id: storeId ?? null, created_by: user!.id });
    if (error) return toast.error(error.code === '23505' ? 'الرمز مستخدم مسبقًا' : errorMessage(error));
    toast.success('تم إنشاء الكوبون'); setOpen(false); reload();
  }
  async function toggle(id: string, active: boolean) {
    const { error } = await sb.from('coupons').update({ is_active: active }).eq('id', id);
    if (error) toast.error(errorMessage(error)); else reload();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold">الكوبونات</h2><Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> كوبون</Button></div>
      <Table head={['الرمز', 'القيمة', 'الحد الأدنى', 'الاستخدام', 'الحالة', '']} empty={!data?.length}>
        {data?.map((c) => (
          <tr key={c.id}>
            <Td><code className="rounded-lg bg-brand-50 px-2 py-1 font-bold text-brand-700" dir="ltr">{c.code}</code></Td>
            <Td>{c.type === 'percent' ? `${c.value}%` : formatPrice(c.value)}{c.max_discount ? ` (حتى ${formatPrice(c.max_discount)})` : ''}</Td>
            <Td>{formatPrice(c.min_cart_value)}</Td>
            <Td>{c.used_count}{c.usage_limit ? ` / ${c.usage_limit}` : ''}</Td>
            <Td><Badge tone={c.is_active ? 'green' : 'gray'} dot>{c.is_active ? 'فعّال' : 'متوقف'}</Badge></Td>
            <Td><Button size="sm" variant="ghost" onClick={() => toggle(c.id, !c.is_active)}>{c.is_active ? 'إيقاف' : 'تفعيل'}</Button></Td>
          </tr>
        ))}
      </Table>
      <Modal open={open} onClose={() => setOpen(false)} title="كوبون جديد">
        <div className="grid grid-cols-2 gap-3">
          <Field label="الرمز" className="col-span-2"><Input dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="SAVE10" /></Field>
          <Field label="النوع"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت</option></Select></Field>
          <Field label="القيمة"><Input inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
          <Field label="الحد الأدنى للسلة"><Input inputMode="numeric" value={f.min_cart_value} onChange={(e) => setF({ ...f, min_cart_value: e.target.value })} /></Field>
          <Field label="أقصى خصم"><Input inputMode="numeric" value={f.max_discount} onChange={(e) => setF({ ...f, max_discount: e.target.value })} /></Field>
          <Field label="عدد الاستخدامات الكلي"><Input inputMode="numeric" value={f.usage_limit} onChange={(e) => setF({ ...f, usage_limit: e.target.value })} /></Field>
          <Field label="لكل مستخدم"><Input inputMode="numeric" value={f.per_user_limit} onChange={(e) => setF({ ...f, per_user_limit: e.target.value })} /></Field>
        </div>
        <Button className="mt-4 w-full" onClick={create}>إنشاء</Button>
      </Modal>
    </div>
  );
}
