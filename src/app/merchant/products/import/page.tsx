'use client';
import { useState } from 'react';
import { Download, FileUp, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { downloadCsv, parseCsv } from '@/lib/csv';
import { productSchema, firstError } from '@/lib/validation';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td } from '@/components/dashboard/widgets';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const COLS = ['name', 'category_slug', 'description', 'variant_name', 'sku', 'price', 'compare_at_price', 'stock'];
type Item = { name: string; payload: Record<string, unknown> | null; error: string | null; result?: 'ok' | string };

/** استيراد منتجات من CSV: كل صف = متغير؛ الصفوف بنفس الاسم تُجمع في منتج واحد. تُرسل للمراجعة كأي منتج جديد. */
export default function ImportProducts() {
  const sb = getSupabase();
  const { store, can } = useMerchant();
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const cats = useQuery(async () => ((await sb.from('categories').select('id,slug,name_ar').eq('is_active', true)).data ?? []) as { id: number; slug: string; name_ar: string }[]);

  function onFile(f: File) {
    if (f.size > 2_000_000) return toast.error('الملف كبير جدًا (الحد 2MB)');
    f.text().then((txt) => {
      const rows = parseCsv(txt);
      const head = rows.shift()?.map((h) => h.trim().toLowerCase()) ?? [];
      if (!COLS.every((c) => head.includes(c))) return toast.error(`الأعمدة المطلوبة: ${COLS.join(', ')}`);
      const ix = (c: string) => head.indexOf(c);
      const groups = new Map<string, string[][]>();
      rows.slice(0, 1000).forEach((r) => { const n = (r[ix('name')] ?? '').trim(); if (n) groups.set(n, [...(groups.get(n) ?? []), r]); });
      const out: Item[] = [];
      groups.forEach((rs, name) => {
        const cat = cats.data?.find((c) => c.slug === (rs[0][ix('category_slug')] ?? '').trim() || c.name_ar === (rs[0][ix('category_slug')] ?? '').trim());
        const data = {
          name, description: (rs[0][ix('description')] ?? '').trim() || undefined, category_id: cat?.id,
          variants: rs.map((r) => ({
            name: (r[ix('variant_name')] ?? '').trim() || 'افتراضي', sku: (r[ix('sku')] ?? '').trim(),
            price: r[ix('price')], compare_at_price: (r[ix('compare_at_price')] ?? '').trim() || undefined, stock: (r[ix('stock')] ?? '0').trim() || '0',
          })),
        };
        const p = productSchema.safeParse(data);
        out.push({ name, payload: p.success ? { ...p.data, variants: p.data.variants.map((v) => ({ ...v, compare_at_price: v.compare_at_price && v.compare_at_price > v.price ? v.compare_at_price : null })) } : null,
          error: !cat ? 'تصنيف غير معروف' : p.success ? null : firstError(p) });
      });
      setItems(out.slice(0, 200));
    });
  }

  async function run() {
    if (!store) return;
    setRunning(true);
    const next = [...items];
    for (let i = 0; i < next.length; i++) {
      if (!next[i].payload || next[i].error || next[i].result === 'ok') continue;
      const { error } = await sb.rpc('merchant_save_product', { p_store: store.id, p_data: next[i].payload });
      next[i] = { ...next[i], result: error ? errorMessage(error) : 'ok' };
      setItems([...next]);
    }
    setRunning(false);
    toast.success('انتهى الاستيراد');
  }

  if (!can('products')) return <p className="card p-6 text-ink-soft">لا تملك صلاحية إدارة المنتجات.</p>;
  const valid = items.filter((i) => !i.error).length;
  return (
    <div className="space-y-5">
      <PageHeader title="استيراد المنتجات (CSV)" subtitle="حتى 200 منتج في المرة. المنتجات الجديدة تُراجع من الإدارة قبل الظهور. الصور تُضاف لاحقًا من صفحة كل منتج."
        actions={<Button variant="outline" onClick={() => downloadCsv('sawqy-products-template.csv', [COLS, ['قميص قطن', cats.data?.[0]?.slug ?? 'fashion', 'قميص قطني مريح', 'مقاس M', 'SHIRT-M', '4500', '5000', '20'], ['قميص قطن', cats.data?.[0]?.slug ?? 'fashion', '', 'مقاس L', 'SHIRT-L', '4500', '', '15']])}><Download className="h-4 w-4" /> تنزيل القالب</Button>} />
      <label className="card flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed border-slate-300 p-10 text-center hover:border-brand-400">
        <FileUp className="h-8 w-8 text-brand-600" /><b>اختر ملف CSV</b><span className="text-xs text-ink-muted">ترميز UTF-8 · الأعمدة: {COLS.join(' , ')}</span>
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      {items.length > 0 && (
        <>
          <div className="flex items-center justify-between"><p className="text-sm">{items.length} منتج · {valid} صالح</p>
            <Button loading={running} disabled={!valid} onClick={run}><Upload className="h-4 w-4" /> استيراد {valid} منتج</Button></div>
          <Table head={['المنتج', 'المتغيرات', 'الحالة']}>
            {items.map((i) => (
              <tr key={i.name}><Td className="font-semibold">{i.name}</Td><Td>{(i.payload?.variants as unknown[] | undefined)?.length ?? '—'}</Td>
                <Td>{i.result === 'ok' ? <Badge tone="green">تم</Badge> : i.result ? <span className="text-xs text-red-600">{i.result}</span> : i.error ? <span className="text-xs text-red-600">{i.error}</span> : <Badge tone="blue">جاهز</Badge>}</Td></tr>
            ))}
          </Table>
        </>
      )}
    </div>
  );
}
