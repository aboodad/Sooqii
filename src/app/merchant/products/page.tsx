'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Archive, Eye, EyeOff, Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { formatPrice } from '@/lib/format';
import { OFFER_STATUS, PRODUCT_STATUS } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';

type Row = { id: string; price: number; compare_at_price: number | null; status: string;
  inventory_levels: { qty_available: number } | null;
  product_variants: { name: string; sku: string; products: { id: string; name: string; slug: string; status: string; rejection_reason: string | null; product_images: { url: string; sort: number }[] } } };

export default function MerchantProducts() {
  const sb = getSupabase();
  const { store, can } = useMerchant();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<{ id: string; price: string } | null>(null);
  const { data, loading, reload } = useQuery(async () => {
    if (!store) return [];
    const { data } = await sb.from('seller_offers')
      .select('id,price,compare_at_price,status, inventory_levels(qty_available), product_variants(name,sku, products(id,name,slug,status,rejection_reason, product_images(url,sort)))')
      .eq('store_id', store.id).neq('status', 'archived').order('created_at', { ascending: false });
    return (data ?? []) as unknown as Row[];
  }, [store?.id]);

  async function update(offer: string, patch: { p_price?: number; p_status?: string }) {
    const { error } = await sb.rpc('merchant_update_offer', { p_offer: offer, p_price: patch.p_price ?? null, p_compare: null, p_status: patch.p_status ?? null });
    if (error) return toast.error(errorMessage(error));
    toast.success('تم التحديث'); setEditing(null); reload();
  }

  const rows = (data ?? []).filter((r) => !q || r.product_variants.products.name.includes(q) || r.product_variants.sku.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <PageHeader title="المنتجات" subtitle="عروض متجرك: السعر والحالة لكل متغير" actions={can('products') && <><Link href="/merchant/products/import"><Button variant="outline">استيراد CSV</Button></Link><Link href="/merchant/products/new"><Button><Plus className="h-4 w-4" /> منتج جديد</Button></Link></>} />
      <div className="relative mb-4 max-w-sm"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" /><input className="input pr-9" placeholder="بحث بالاسم أو SKU" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {loading ? <Skeleton className="h-64" /> : (
        <Table head={['المنتج', 'SKU', 'السعر', 'المتاح', 'حالة العرض', 'المراجعة', '']} empty={!rows.length}>
          {rows.map((r) => {
            const p = r.product_variants.products;
            const img = [...p.product_images].sort((a, b) => a.sort - b.sort)[0]?.url;
            return (
              <tr key={r.id} className="hover:bg-slate-50/60">
                <Td>
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {img && <img src={img} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div><p className="line-clamp-1 font-semibold">{p.name}</p>{r.product_variants.name !== 'افتراضي' && <p className="text-xs text-ink-muted">{r.product_variants.name}</p>}</div>
                  </div>
                </Td>
                <Td className="font-mono text-xs" >{r.product_variants.sku}</Td>
                <Td>
                  {editing?.id === r.id ? (
                    <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const v = Number(editing.price); if (v > 0) update(r.id, { p_price: v }); }}>
                      <input className="input h-9 w-28 py-1" inputMode="numeric" autoFocus value={editing.price} onChange={(e) => setEditing({ id: r.id, price: e.target.value.replace(/[^\d.]/g, '') })} />
                      <Button size="sm">حفظ</Button>
                    </form>
                  ) : (
                    <button disabled={!can('pricing')} onClick={() => setEditing({ id: r.id, price: String(r.price) })} className="font-semibold hover:text-brand-600">{formatPrice(r.price)}</button>
                  )}
                </Td>
                <Td><span className={(r.inventory_levels?.qty_available ?? 0) <= 3 ? 'font-bold text-orange-600' : ''}>{r.inventory_levels?.qty_available ?? 0}</span></Td>
                <Td><StatusBadge map={OFFER_STATUS} value={r.status} /></Td>
                <Td>
                  <StatusBadge map={PRODUCT_STATUS} value={p.status} />
                  {p.rejection_reason && p.status === 'rejected' && <p className="mt-1 max-w-[160px] text-xs text-red-600">{p.rejection_reason}</p>}
                </Td>
                <Td>
                  <div className="flex gap-1">
                    {can('products') && <Link href={`/merchant/products/${p.id}`} className="rounded-lg p-2 text-ink-muted hover:bg-slate-100" aria-label="تعديل"><Pencil className="h-4 w-4" /></Link>}
                    {can('products') && (r.status === 'hidden'
                      ? <button onClick={() => update(r.id, { p_status: 'active' })} className="rounded-lg p-2 text-ink-muted hover:bg-slate-100" aria-label="إظهار"><Eye className="h-4 w-4" /></button>
                      : <button onClick={() => update(r.id, { p_status: 'hidden' })} className="rounded-lg p-2 text-ink-muted hover:bg-slate-100" aria-label="إخفاء"><EyeOff className="h-4 w-4" /></button>)}
                    {can('products') && <button onClick={() => confirm('أرشفة هذا العرض؟ يبقى في الطلبات السابقة.') && update(r.id, { p_status: 'archived' })} className="rounded-lg p-2 text-ink-muted hover:bg-red-50 hover:text-red-600" aria-label="أرشفة"><Archive className="h-4 w-4" /></button>}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}
