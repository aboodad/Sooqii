'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Sparkles, Trash2, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { productSchema, firstError } from '@/lib/validation';
import { errorMessage } from '@/lib/utils';
import { formatPrice } from '@/lib/format';
import type { ProductCardData } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ImageUploader } from './image-uploader';

type Variant = { id?: string; name: string; sku: string; barcode: string; price: string; compare_at_price: string; stock: string; existing?: boolean };
const blankVariant = (): Variant => ({ name: 'افتراضي', sku: '', barcode: '', price: '', compare_at_price: '', stock: '0' });

export function ProductForm({ productId }: { productId?: string }) {
  const sb = getSupabase();
  const router = useRouter();
  const { store } = useMerchant();
  const [mode, setMode] = useState<'pick' | 'new' | 'attach'>(productId ? 'new' : 'pick');
  const [owned, setOwned] = useState(true);
  const [cats, setCats] = useState<{ id: number; name_ar: string; parent_id: number | null }[]>([]);
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([]);
  const [f, setF] = useState({ name: '', description: '', category_id: '', brand_id: '' });
  const [images, setImages] = useState<string[]>([]);
  const [specs, setSpecs] = useState<{ k: string; v: string }[]>([{ k: '', v: '' }]);
  const [variants, setVariants] = useState<Variant[]>([blankVariant()]);
  const [attachId, setAttachId] = useState<string | null>(productId ?? null);
  const [q, setQ] = useState(''); const [found, setFound] = useState<ProductCardData[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sb.from('categories').select('id,name_ar,parent_id').eq('is_active', true).order('sort').then(({ data }) => setCats(data ?? []));
    sb.from('brands').select('id,name').eq('is_active', true).order('name').then(({ data }) => setBrands(data ?? []));
  }, [sb]);

  // تحميل منتج موجود (تعديل أو إضافة عرض على منتج قائم)
  useEffect(() => {
    if (!attachId || !store) return;
    (async () => {
      const { data: p } = await sb.from('products').select('id,name,description,category_id,brand_id,specs,proposed_by_store_id, product_images(url,sort), product_variants(id,name,sku,barcode,is_active)').eq('id', attachId).single();
      if (!p) return;
      const isOwned = p.proposed_by_store_id === store.id;
      setOwned(isOwned);
      setF({ name: p.name, description: p.description ?? '', category_id: String(p.category_id), brand_id: p.brand_id ? String(p.brand_id) : '' });
      setImages([...(p.product_images as { url: string; sort: number }[])].sort((a, b) => a.sort - b.sort).map((i) => i.url));
      const sp = Object.entries((p.specs ?? {}) as Record<string, string>).map(([k, v]) => ({ k, v: String(v) }));
      setSpecs(sp.length ? sp : [{ k: '', v: '' }]);
      const { data: offers } = await sb.from('seller_offers').select('variant_id,price,compare_at_price, inventory_levels(qty_on_hand)').eq('store_id', store.id);
      setVariants((p.product_variants as { id: string; name: string; sku: string; barcode: string | null; is_active: boolean }[]).filter((v) => v.is_active).map((v) => {
        const o = offers?.find((x) => x.variant_id === v.id) as { price: number; compare_at_price: number | null; inventory_levels: { qty_on_hand: number } | null } | undefined;
        return { id: v.id, name: v.name, sku: v.sku, barcode: v.barcode ?? '', price: o ? String(o.price) : '', compare_at_price: o?.compare_at_price ? String(o.compare_at_price) : '', stock: String(o?.inventory_levels?.qty_on_hand ?? 0), existing: !!o };
      }));
    })();
  }, [attachId, store, sb]);

  async function searchExisting() {
    if (q.trim().length < 2) return;
    const { data } = await sb.rpc('search_products', { p_q: q, p_limit: 8 });
    setFound((data?.items ?? []) as ProductCardData[]);
  }

  async function save() {
    if (!store) return;
    const payloadVariants = variants.filter((v) => v.price || !v.id).map((v) => ({
      id: v.id, name: v.name || 'افتراضي', sku: v.sku, barcode: v.barcode || undefined,
      price: v.price, compare_at_price: v.compare_at_price || undefined, stock: v.stock || '0',
    }));
    const parsed = productSchema.safeParse({ ...f, brand_id: f.brand_id || undefined, description: f.description || undefined, variants: payloadVariants });
    if (!parsed.success) return toast.error(firstError(parsed));
    const specsObj = Object.fromEntries(specs.filter((s) => s.k.trim() && s.v.trim()).slice(0, 30).map((s) => [s.k.trim().slice(0, 60), s.v.trim().slice(0, 200)]));
    setSaving(true);
    const { data, error } = await sb.rpc('merchant_save_product', {
      p_store: store.id,
      p_data: { ...parsed.data, product_id: attachId ?? undefined, specs: specsObj, images: owned ? images : undefined,
        variants: parsed.data.variants.map((v) => ({ ...v, compare_at_price: v.compare_at_price && v.compare_at_price > v.price ? v.compare_at_price : null })) },
    });
    setSaving(false);
    if (error) return toast.error(errorMessage(error));
    toast.success(owned && !productId ? 'تم الحفظ وأُرسل المنتج للمراجعة' : 'تم الحفظ');
    router.push('/merchant/products');
    return data;
  }

  if (mode === 'pick') {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold"><Link2 className="h-5 w-5 text-brand-600" /> المنتج موجود في سوقي؟</h2>
          <p className="mb-4 text-sm text-ink-soft">ابحث بالاسم وأضف عرضك عليه مباشرة (بدون مراجعة).</p>
          <div className="flex gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchExisting()} placeholder="اسم المنتج" /><Button variant="outline" onClick={searchExisting}><Search className="h-4 w-4" /></Button></div>
          <div className="mt-3 space-y-2">
            {found.map((p) => (
              <button key={p.id} onClick={() => { setAttachId(p.id); setMode('attach'); }} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-2 text-right hover:bg-brand-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.image && <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover" />}
                <span className="flex-1 text-sm font-semibold">{p.name}</span><span className="text-xs text-ink-muted">{formatPrice(p.price)}</span>
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setMode('new')} className="card group flex flex-col items-center justify-center gap-3 p-6 text-center transition hover:-translate-y-1 hover:shadow-lift">
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-accent-400 to-accent-600 text-white shadow-glow-orange transition-transform group-hover:rotate-6"><Sparkles className="h-8 w-8" /></span>
          <span className="text-lg font-bold">منتج جديد كليًا</span>
          <span className="text-sm text-ink-soft">أنشئ منتجًا جديدًا — يظهر للعملاء بعد مراجعة الإدارة.</span>
        </button>
      </div>
    );
  }

  const top = cats.filter((c) => !c.parent_id);
  return (
    <div className="space-y-5">
      {!owned && <p className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-800 ring-1 ring-sky-100">تضيف عرضك على منتج قائم: يمكنك تحديد السعر والمخزون فقط، بيانات المنتج تديرها المنصة.</p>}
      <section className="card space-y-4 p-6">
        <h2 className="font-bold">1. معلومات المنتج</h2>
        <Field label="اسم المنتج"><Input disabled={!owned} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="التصنيف">
            <Select disabled={!owned} value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
              <option value="">اختر</option>
              {top.map((c) => (
                <optgroup key={c.id} label={c.name_ar}>
                  <option value={c.id}>{c.name_ar} (عام)</option>
                  {cats.filter((x) => x.parent_id === c.id).map((x) => <option key={x.id} value={x.id}>{x.name_ar}</option>)}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="العلامة التجارية (اختياري)"><Select disabled={!owned} value={f.brand_id} onChange={(e) => setF({ ...f, brand_id: e.target.value })}><option value="">بدون</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        </div>
        <Field label="الوصف"><Textarea disabled={!owned} rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={8000} /></Field>
      </section>

      {owned && store && (
        <section className="card space-y-4 p-6">
          <h2 className="font-bold">2. الصور والمواصفات</h2>
          <ImageUploader storeId={store.id} value={images} onChange={setImages} />
          <div className="space-y-2">
            <p className="label">المواصفات</p>
            {specs.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder="الخاصية (مثل: اللون)" value={s.k} onChange={(e) => setSpecs(specs.map((x, k) => (k === i ? { ...x, k: e.target.value } : x)))} />
                <Input placeholder="القيمة" value={s.v} onChange={(e) => setSpecs(specs.map((x, k) => (k === i ? { ...x, v: e.target.value } : x)))} />
                <button onClick={() => setSpecs(specs.filter((_, k) => k !== i))} className="rounded-xl px-3 text-red-500 hover:bg-red-50" aria-label="حذف"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setSpecs([...specs, { k: '', v: '' }])}><Plus className="h-4 w-4" /> خاصية</Button>
          </div>
        </section>
      )}

      <section className="card space-y-3 p-6">
        <h2 className="font-bold">{owned ? '3' : '2'}. المتغيرات والسعر والمخزون</h2>
        <div className="space-y-3">
          {variants.map((v, i) => (
            <div key={i} className="grid gap-2 rounded-2xl bg-slate-50 p-3 sm:grid-cols-6">
              <Field label="الاسم"><Input disabled={!owned && !!v.id} value={v.name} onChange={(e) => setVariants(variants.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} /></Field>
              <Field label="SKU"><Input dir="ltr" disabled={!!v.id} value={v.sku} onChange={(e) => setVariants(variants.map((x, k) => (k === i ? { ...x, sku: e.target.value.toUpperCase() } : x)))} /></Field>
              <Field label="السعر (ر.ي)"><Input inputMode="numeric" value={v.price} onChange={(e) => setVariants(variants.map((x, k) => (k === i ? { ...x, price: e.target.value.replace(/[^\d.]/g, '') } : x)))} /></Field>
              <Field label="السعر قبل الخصم"><Input inputMode="numeric" value={v.compare_at_price} onChange={(e) => setVariants(variants.map((x, k) => (k === i ? { ...x, compare_at_price: e.target.value.replace(/[^\d.]/g, '') } : x)))} /></Field>
              <Field label="المخزون" hint={v.existing ? 'عدّله من صفحة المخزون' : undefined}><Input inputMode="numeric" disabled={v.existing} value={v.stock} onChange={(e) => setVariants(variants.map((x, k) => (k === i ? { ...x, stock: e.target.value.replace(/\D/g, '') } : x)))} /></Field>
              <div className="flex items-end">{!v.id && variants.length > 1 && <Button variant="danger" size="sm" onClick={() => setVariants(variants.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></Button>}</div>
            </div>
          ))}
        </div>
        {owned && <Button size="sm" variant="soft" onClick={() => setVariants([...variants, { ...blankVariant(), name: '' }])}><Plus className="h-4 w-4" /> متغير (لون/مقاس)</Button>}
      </section>

      <div className="flex gap-3">
        <Button size="lg" loading={saving} onClick={save}>حفظ المنتج</Button>
        <Button size="lg" variant="outline" onClick={() => router.back()}>إلغاء</Button>
      </div>
    </div>
  );
}
