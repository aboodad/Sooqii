'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatNumber, formatPrice } from '@/lib/format';
import { AD_STATUS } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td, Tabs } from '@/components/dashboard/widgets';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Modal, Skeleton } from '@/components/ui/misc';

type Ad = { id: string; status: string; placement: string; starts_at: string | null; ends_at: string | null; impressions: number; clicks: number; created_at: string; note: string | null;
  stores: { name: string } | null; products: { name: string; slug: string } | null; ad_packages: { name: string; price: number; days: number } | null };

export default function AdsAdmin() {
  const sb = getSupabase();
  const [tab, setTab] = useState('requested');
  const [rev, setRev] = useState<Ad | null>(null);
  const [note, setNote] = useState(''); const [prepaid, setPrepaid] = useState(false); const [busy, setBusy] = useState(false);
  const { data, loading, reload } = useQuery(async () => {
    let q = sb.from('ad_campaigns').select('id,status,placement,starts_at,ends_at,impressions,clicks,created_at,note, stores(name), products(name,slug), ad_packages(name,price,days)');
    if (tab !== 'all') q = q.eq('status', tab);
    return ((await q.order('created_at', { ascending: false }).limit(200)).data ?? []) as unknown as Ad[];
  }, [tab]);

  async function review(approve: boolean) {
    if (!rev) return;
    setBusy(true);
    const { error } = await sb.rpc('admin_review_ad', { p_id: rev.id, p_approve: approve, p_prepaid: prepaid, p_note: note || null });
    setBusy(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(approve ? 'تم التفعيل وتسجيل الرسوم على المتجر' : 'تم الرفض'); setRev(null); setNote(''); reload();
  }

  return (
    <div>
      <PageHeader title="الإعلانات الممولة" subtitle="يطلب التاجر ترويج منتج، وعند الموافقة تُسجّل الرسوم على حسابه (مدفوعة مسبقًا أو تُخصم من التسوية) ويظهر المنتج بوسم «ممول»." />
      <Tabs value={tab} onChange={setTab} tabs={[{ v: 'requested', l: 'بانتظار المراجعة' }, { v: 'active', l: 'نشطة' }, { v: 'ended', l: 'منتهية' }, { v: 'rejected', l: 'مرفوضة' }, { v: 'all', l: 'الكل' }]} />
      {loading ? <Skeleton className="h-64" /> : (
        <Table head={['المنتج', 'المتجر', 'الباقة', 'الفترة', 'ظهور / نقرات', 'الحالة', '']} empty={!data?.length}>
          {data?.map((a) => (
            <tr key={a.id}>
              <Td className="font-semibold">{a.products?.name}</Td><Td>{a.stores?.name}</Td>
              <Td>{a.ad_packages?.name}<span className="block text-xs text-ink-muted">{formatPrice(a.ad_packages?.price)}</span></Td>
              <Td className="text-xs">{a.starts_at ? `${formatDate(a.starts_at)} ← ${formatDate(a.ends_at!)}` : formatDate(a.created_at)}</Td>
              <Td>{formatNumber(a.impressions)} / {formatNumber(a.clicks)}{a.impressions > 0 && <span className="block text-xs text-ink-muted">CTR {(a.clicks / a.impressions * 100).toFixed(1)}%</span>}</Td>
              <Td><StatusBadge map={AD_STATUS} value={a.status} /></Td>
              <Td>{a.status === 'requested' && <Button size="sm" onClick={() => setRev(a)}>مراجعة</Button>}</Td>
            </tr>
          ))}
        </Table>
      )}
      <Modal open={!!rev} onClose={() => setRev(null)} title="مراجعة طلب الإعلان">
        <p className="text-sm"><b>{rev?.products?.name}</b> — {rev?.stores?.name}</p>
        <p className="mb-3 text-sm text-ink-soft">{rev?.ad_packages?.name} · {formatPrice(rev?.ad_packages?.price)} · {rev?.ad_packages?.days} يوم</p>
        <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={prepaid} onChange={(e) => setPrepaid(e.target.checked)} /> دفع التاجر الرسوم مسبقًا (لا تُخصم من التسوية)</label>
        <Input placeholder="ملاحظة (اختياري)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button loading={busy} onClick={() => review(true)}>موافقة وتفعيل</Button>
          <Button variant="danger" loading={busy} onClick={() => review(false)}>رفض</Button>
        </div>
      </Modal>
    </div>
  );
}
