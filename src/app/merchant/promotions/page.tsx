'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatPrice } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { CouponManager } from '@/components/dashboard/coupon-manager';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/misc';

export default function Promotions() {
  const sb = getSupabase();
  const { store, can } = useMerchant();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: 'خصم', offer_id: '', type: 'percent', value: '', ends_at: '' });
  const discounts = useQuery(async () => {
    if (!store) return [];
    return (await sb.from('merchant_discounts').select('*, seller_offers(product_variants(products(name)))').eq('store_id', store.id).order('created_at', { ascending: false })).data ?? [];
  }, [store?.id]);
  const offers = useQuery(async () => {
    if (!store) return [];
    return ((await sb.from('seller_offers').select('id, product_variants(name, products(name))').eq('store_id', store.id).in('status', ['active', 'out_of_stock'])).data ?? []) as unknown as { id: string; product_variants: { name: string; products: { name: string } } }[];
  }, [store?.id]);

  async function create() {
    const value = Number(f.value);
    if (!(value > 0) || (f.type === 'percent' && value > 90)) return toast.error('قيمة غير صالحة (النسبة حتى 90%)');
    const { error } = await sb.from('merchant_discounts').insert({ store_id: store!.id, offer_id: f.offer_id || null, title: f.title.slice(0, 80), type: f.type, value, ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null });
    if (error) return toast.error(errorMessage(error));
    toast.success('تم إنشاء الخصم'); setOpen(false); discounts.reload();
  }
  if (!can('pricing')) return <p className="card p-6 text-ink-soft">لا تملك صلاحية إدارة الأسعار والخصومات.</p>;

  return (
    <div className="space-y-8">
      <PageHeader title="الخصومات والكوبونات" subtitle="خصم المتجر يغيّر السعر مباشرة؛ الكوبون رمز يُدخله العميل. لا يُجمع خصمان للمتجر على المنتج نفسه." />
      <div className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="text-lg font-bold">خصومات المتجر</h2><Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> خصم</Button></div>
        <Table head={['العنوان', 'النطاق', 'القيمة', 'ينتهي', 'الحالة', '']} empty={!discounts.data?.length}>
          {discounts.data?.map((d) => (
            <tr key={d.id}>
              <Td className="font-semibold">{d.title}</Td>
              <Td>{d.offer_id ? (d.seller_offers as { product_variants: { products: { name: string } } } | null)?.product_variants?.products?.name : 'كل منتجات المتجر'}</Td>
              <Td>{d.type === 'percent' ? `${d.value}%` : formatPrice(d.value)}</Td>
              <Td className="text-xs">{d.ends_at ? formatDate(d.ends_at) : 'مفتوح'}</Td>
              <Td><Badge tone={d.is_active ? 'green' : 'gray'} dot>{d.is_active ? 'فعّال' : 'متوقف'}</Badge></Td>
              <Td><Button size="sm" variant="ghost" onClick={async () => { await sb.from('merchant_discounts').update({ is_active: !d.is_active }).eq('id', d.id); discounts.reload(); }}>{d.is_active ? 'إيقاف' : 'تفعيل'}</Button></Td>
            </tr>
          ))}
        </Table>
      </div>
      {store && <CouponManager storeId={store.id} />}
      <Modal open={open} onClose={() => setOpen(false)} title="خصم جديد">
        <div className="space-y-3">
          <Field label="العنوان"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="ينطبق على"><Select value={f.offer_id} onChange={(e) => setF({ ...f, offer_id: e.target.value })}><option value="">كل منتجات المتجر</option>{offers.data?.map((o) => <option key={o.id} value={o.id}>{o.product_variants.products.name}{o.product_variants.name !== 'افتراضي' ? ` — ${o.product_variants.name}` : ''}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="النوع"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت</option></Select></Field>
            <Field label="القيمة"><Input inputMode="numeric" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></Field>
          </div>
          <Field label="تاريخ الانتهاء (اختياري)"><Input type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></Field>
          <Button className="w-full" onClick={create}>إنشاء الخصم</Button>
        </div>
      </Modal>
    </div>
  );
}
