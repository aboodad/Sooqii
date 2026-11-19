'use client';
import { useState } from 'react';
import { Megaphone, Search } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatNumber, formatPrice } from '@/lib/format';
import { AD_STATUS } from '@/lib/status';
import { errorMessage, cn } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Modal, Skeleton } from '@/components/ui/misc';

export default function MerchantAds() {
  const sb = getSupabase();
  const { store, can } = useMerchant();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(''); const [product, setProduct] = useState<{ id: string; name: string } | null>(null);
  const [pkg, setPkg] = useState<number | null>(null); const [busy, setBusy] = useState(false);
  const ads = useQuery(async () => {
    if (!store) return [];
    return ((await sb.from('ad_campaigns').select('id,status,starts_at,ends_at,impressions,clicks,note,created_at, products(name), ad_packages(name,price)').eq('store_id', store.id).order('created_at', { ascending: false })).data ?? []) as unknown as
      { id: string; status: string; starts_at: string | null; ends_at: string | null; impressions: number; clicks: number; note: string | null; created_at: string; products: { name: string } | null; ad_packages: { name: string; price: number } | null }[];
  }, [store?.id]);
  const pkgs = useQuery(async () => ((await sb.from('ad_packages').select('id,name,placement,days,price').eq('is_active', true).order('price')).data ?? []) as { id: number; name: string; placement: string; days: number; price: number }[]);
  const found = useQuery(async () => {
    if (!store || q.trim().length < 2) return [];
    const { data } = await sb.rpc('search_products', { p_q: q, p_store: store.slug, p_limit: 8 });
    return (data?.items ?? []) as { id: string; name: string }[];
  }, [q, store?.slug]);

  async function submit() {
    if (!store || !product || !pkg) return;
    setBusy(true);
    const { error } = await sb.rpc('merchant_request_ad', { p_store: store.id, p_product: product.id, p_package: pkg });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success('أُرسل الطلب للإدارة'); setOpen(false); setProduct(null); setPkg(null); ads.reload();
  }
  if (!can('products')) return <p className="card p-6 text-ink-soft">لا تملك صلاحية إدارة الإعلانات.</p>;
  return (
    <div>
      <PageHeader title="الإعلانات الممولة" subtitle="روّج منتجاتك في واجهة سوقي ونتائج البحث. تُسجّل الرسوم على حسابك بعد موافقة الإدارة."
        actions={<Button onClick={() => setOpen(true)}><Megaphone className="h-4 w-4" /> طلب إعلان</Button>} />
      {ads.loading ? <Skeleton className="h-48" /> : (
        <Table head={['المنتج', 'الباقة', 'الفترة', 'ظهور', 'نقرات', 'الحالة']} empty={!ads.data?.length}>
          {ads.data?.map((a) => (
            <tr key={a.id}><Td className="font-semibold">{a.products?.name}</Td><Td>{a.ad_packages?.name}<span className="block text-xs text-ink-muted">{formatPrice(a.ad_packages?.price)}</span></Td>
              <Td className="text-xs">{a.starts_at ? `${formatDate(a.starts_at)} ← ${formatDate(a.ends_at!)}` : '—'}</Td><Td>{formatNumber(a.impressions)}</Td><Td>{formatNumber(a.clicks)}</Td>
              <Td><StatusBadge map={AD_STATUS} value={a.status} />{a.note && <span className="block text-[11px] text-ink-muted">{a.note}</span>}</Td></tr>
          ))}
        </Table>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="طلب إعلان ممول">
        <div className="space-y-3">
          <Field label="المنتج">
            {product ? <div className="flex items-center justify-between rounded-xl bg-brand-50 p-3 text-sm"><b>{product.name}</b><button className="text-xs underline" onClick={() => setProduct(null)}>تغيير</button></div> : (
              <>
                <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" /><Input className="pr-9" placeholder="ابحث في منتجات متجرك" value={q} onChange={(e) => setQ(e.target.value)} /></div>
                <div className="mt-2 space-y-1">{found.data?.map((p) => <button key={p.id} onClick={() => setProduct(p)} className="block w-full rounded-lg p-2 text-right text-sm hover:bg-mist">{p.name}</button>)}</div>
              </>
            )}
          </Field>
          <Field label="الباقة">
            <div className="grid gap-2">{pkgs.data?.map((p) => (
              <button key={p.id} onClick={() => setPkg(p.id)} className={cn('flex justify-between rounded-xl p-3 text-sm ring-2', pkg === p.id ? 'bg-brand-50 ring-brand-500' : 'ring-slate-200')}>
                <span>{p.name} · {p.days} يوم</span><b>{formatPrice(p.price)}</b></button>
            ))}</div>
          </Field>
          <Button className="w-full" disabled={!product || !pkg} loading={busy} onClick={submit}>إرسال الطلب</Button>
        </div>
      </Modal>
    </div>
  );
}
