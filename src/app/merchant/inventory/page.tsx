'use client';
import { useState } from 'react';
import { History, Save } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { formatDate } from '@/lib/format';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Modal, Skeleton } from '@/components/ui/misc';

const REASON: Record<string, string> = { initial: 'رصيد أولي', restock: 'إعادة تخزين', adjustment: 'تعديل', order_commit: 'بيع', order_cancel: 'إلغاء طلب', return_restock: 'مرتجع', damage: 'تالف' };
type Row = { id: string; status: string; inventory_levels: { qty_on_hand: number; qty_reserved: number; qty_available: number; low_stock_threshold: number } | null; product_variants: { name: string; sku: string; products: { name: string } } };

export default function Inventory() {
  const sb = getSupabase();
  const { store, can } = useMerchant();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [hist, setHist] = useState<string | null>(null);
  const { data, loading, reload } = useQuery(async () => {
    if (!store) return [];
    const { data } = await sb.from('seller_offers').select('id,status, inventory_levels(qty_on_hand,qty_reserved,qty_available,low_stock_threshold), product_variants(name,sku, products(name))').eq('store_id', store.id).neq('status', 'archived');
    return ((data ?? []) as unknown as Row[]).sort((a, b) => (a.inventory_levels?.qty_available ?? 0) - (b.inventory_levels?.qty_available ?? 0));
  }, [store?.id]);
  const movements = useQuery(async () => {
    if (!hist) return [];
    const { data } = await sb.from('inventory_movements').select('id,delta_on_hand,reason,note,created_at').eq('offer_id', hist).order('created_at', { ascending: false }).limit(50);
    return data ?? [];
  }, [hist]);

  async function save(id: string) {
    const v = Number(edits[id]);
    if (!Number.isInteger(v) || v < 0) return toast.error('كمية غير صالحة');
    const { error } = await sb.rpc('merchant_adjust_stock', { p_offer: id, p_qty: v, p_note: null });
    if (error) return toast.error(errorMessage(error));
    toast.success('تم تحديث المخزون — سيُبلَّغ المنتظرون تلقائيًا عند عودة التوفر');
    setEdits(({ [id]: _, ...rest }) => rest); reload();
  }

  return (
    <div>
      <PageHeader title="المخزون" subtitle="الكمية المتاحة = الموجود − المحجوز. كل تغيير يُسجَّل في سجل الحركات." />
      {loading ? <Skeleton className="h-64" /> : (
        <Table head={['المنتج', 'SKU', 'الموجود', 'المحجوز', 'المتاح', 'تعديل الكمية', '']} empty={!data?.length}>
          {data?.map((r) => {
            const l = r.inventory_levels;
            const low = (l?.qty_available ?? 0) <= (l?.low_stock_threshold ?? 3);
            return (
              <tr key={r.id} className={low ? 'bg-orange-50/40' : ''}>
                <Td><p className="font-semibold">{r.product_variants.products.name}</p>{r.product_variants.name !== 'افتراضي' && <p className="text-xs text-ink-muted">{r.product_variants.name}</p>}</Td>
                <Td className="font-mono text-xs">{r.product_variants.sku}</Td>
                <Td>{l?.qty_on_hand ?? 0}</Td>
                <Td>{l?.qty_reserved ?? 0}</Td>
                <Td><span className={low ? 'font-bold text-orange-600' : 'font-bold text-emerald-600'}>{l?.qty_available ?? 0}</span></Td>
                <Td>
                  {can('inventory') && (
                    <div className="flex gap-1">
                      <input className="input h-9 w-24 py-1" inputMode="numeric" placeholder={String(l?.qty_on_hand ?? 0)} value={edits[r.id] ?? ''} onChange={(e) => setEdits({ ...edits, [r.id]: e.target.value.replace(/\D/g, '') })} />
                      {edits[r.id] !== undefined && edits[r.id] !== '' && <Button size="sm" onClick={() => save(r.id)}><Save className="h-4 w-4" /></Button>}
                    </div>
                  )}
                </Td>
                <Td><button onClick={() => setHist(r.id)} className="rounded-lg p-2 text-ink-muted hover:bg-slate-100" aria-label="السجل"><History className="h-4 w-4" /></button></Td>
              </tr>
            );
          })}
        </Table>
      )}
      <Modal open={!!hist} onClose={() => setHist(null)} title="سجل حركات المخزون">
        <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
          {movements.data?.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2 text-sm">
              <span>{REASON[m.reason] ?? m.reason}{m.note ? ` — ${m.note}` : ''}</span>
              <span className="flex items-center gap-3"><b className={m.delta_on_hand >= 0 ? 'text-emerald-600' : 'text-red-600'} dir="ltr">{m.delta_on_hand > 0 ? '+' : ''}{m.delta_on_hand}</b><span className="text-xs text-ink-muted">{formatDate(m.created_at)}</span></span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
