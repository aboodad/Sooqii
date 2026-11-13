'use client';
/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { CalendarClock, Eye, Film, ImagePlus, Lock, Send, Sparkles, Trash2, X } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatNumber, timeAgo } from '@/lib/format';
import { STORY_HOURS } from '@/lib/stories';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/field';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { StoryAvatar } from '@/components/stories/story-avatar';

type Center = {
  active: boolean; starts_at: string | null; ends_at: string | null;
  history: { starts_at: string; ends_at: string; days: number; cancelled_at: string | null }[];
  stories: { id: string; media_url: string; media_path: string | null; media_type: 'image' | 'video'; caption: string | null;
    views: number; created_at: string; expires_at: string; live: boolean; product: { slug: string; name: string } | null }[];
};
type Draft = { file: File; url: string; type: 'image' | 'video'; ext: string; duration: number };

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_VIDEO = 20 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 30;

/** التحقق من النوع الفعلي للملف عبر التوقيع وليس الامتداد */
async function sniff(file: File): Promise<{ type: 'image' | 'video'; ext: string } | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image', ext: 'jpg' };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: 'image', ext: 'png' };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return { type: 'image', ext: 'webp' };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { type: 'video', ext: 'webm' };
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand.startsWith('avi') || brand.startsWith('hei')) return null; // صور AVIF/HEIC غير مدعومة هنا
    return { type: 'video', ext: 'mp4' };
  }
  return null;
}

function videoDuration(url: string) {
  return new Promise<number>((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => resolve(v.duration || 0);
    v.onerror = () => resolve(0);
    v.src = url;
  });
}

export default function MerchantStories() {
  const sb = getSupabase();
  const { store, can } = useMerchant();
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [caption, setCaption] = useState('');
  const [product, setProduct] = useState('');
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);

  const { data, loading, reload } = useQuery(async () => {
    if (!store) return null;
    const { data, error } = await sb.rpc('merchant_story_center', { p_store: store.id });
    if (error) throw error;
    return data as Center;
  }, [store?.id]);

  const { data: products } = useQuery(async () => {
    if (!store) return [];
    const { data } = await sb.from('seller_offers').select('product_variants(products(id,name,status))')
      .eq('store_id', store.id).neq('status', 'archived').limit(300);
    const map = new Map<string, string>();
    for (const r of (data ?? []) as unknown as { product_variants: { products: { id: string; name: string; status: string } | null } | null }[]) {
      const p = r.product_variants?.products;
      if (p && p.status === 'active') map.set(p.id, p.name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [store?.id]);

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (input.current) input.current.value = '';
    if (!file) return;
    const kind = await sniff(file);
    if (!kind) return toast.error('الملف ليس صورة (JPG/PNG/WebP) أو فيديو (MP4/WebM) صالحًا');
    if (kind.type === 'image' && file.size > MAX_IMAGE) return toast.error('حجم الصورة يجب ألا يتجاوز 5MB');
    if (kind.type === 'video' && file.size > MAX_VIDEO) return toast.error('حجم الفيديو يجب ألا يتجاوز 20MB');
    const url = URL.createObjectURL(file);
    let duration = 5;
    if (kind.type === 'video') {
      duration = await videoDuration(url);
      if (!duration || duration > MAX_VIDEO_SECONDS + 0.5) { URL.revokeObjectURL(url); return toast.error('مدة الفيديو يجب ألا تتجاوز 30 ثانية'); }
    }
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft({ file, url, type: kind.type, ext: kind.ext, duration });
  }

  function clearDraft() {
    if (draft) URL.revokeObjectURL(draft.url);
    setDraft(null); setCaption(''); setProduct(''); setHours(24);
  }

  async function publish() {
    if (!store || !draft) return;
    setBusy(true);
    const path = `${store.id}/${crypto.randomUUID()}.${draft.ext}`;
    const contentType = draft.type === 'image' ? draft.file.type || `image/${draft.ext === 'jpg' ? 'jpeg' : draft.ext}` : `video/${draft.ext}`;
    const up = await sb.storage.from('stories').upload(path, draft.file, { contentType, upsert: false, cacheControl: '86400' });
    if (up.error) { setBusy(false); return toast.error('تعذر رفع الملف، تأكد أن اشتراك الاستوري ساري'); }
    const url = sb.storage.from('stories').getPublicUrl(path).data.publicUrl;
    const { error } = await sb.rpc('merchant_add_story', {
      p_store: store.id, p_media_url: url, p_media_path: path, p_media_type: draft.type,
      p_caption: caption.trim() || null, p_product: product || null, p_hours: hours,
      p_duration_ms: Math.round(draft.duration * 1000),
    });
    if (error) {
      await sb.storage.from('stories').remove([path]);
      setBusy(false);
      return toast.error(errorMessage(error));
    }
    setBusy(false);
    toast.success('نُشرت الحالة وتظهر الآن في الرئيسية');
    clearDraft();
    reload();
  }

  async function remove(id: string) {
    if (!confirmDelete()) return;
    const { data: path, error } = await sb.rpc('merchant_delete_story', { p_story: id });
    if (error) return toast.error(errorMessage(error));
    if (path) await sb.storage.from('stories').remove([path as string]);
    toast.success('حُذفت الحالة');
    reload();
  }

  if (!store) return null;
  if (!can('stories')) return <EmptyState icon={<Lock />} title="لا تملك صلاحية الاستوري" text="اطلب من مالك المتجر منحك صلاحية «الاستوري»." />;

  const live = data?.stories.filter((s) => s.live) ?? [];
  const past = data?.stories.filter((s) => !s.live) ?? [];
  const daysLeft = data?.ends_at ? Math.max(0, Math.ceil((new Date(data.ends_at).getTime() - Date.now()) / 86400000)) : 0;

  return (
    <div>
      <PageHeader title="الاستوري" subtitle="انشر عروضك وجديدك كحالات تظهر لكل زوار سوقي في الصفحة الرئيسية" />
      {loading && !data ? <Skeleton className="h-64" /> : (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            {/* حالة الاشتراك */}
            {data?.active ? (
              <div className="tile flex flex-wrap items-center gap-4 p-5">
                <StoryAvatar store={{ id: store.id, name: store.name, logo_url: store.logo_url }} size={64} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><h2 className="font-semibold">الاستوري مفعّل لمتجرك</h2><Badge tone="green" dot>ساري</Badge></div>
                  <p className="mt-1 text-sm text-ink-soft">ينتهي الاشتراك في {formatDate(data.ends_at!)}. متبقٍ {formatNumber(daysLeft)} يوم.</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-mist">
                    <div className="h-full rounded-full bg-gradient-to-l from-brand-500 to-accent-500" style={{ width: `${Math.min(100, (daysLeft / 30) * 100)}%` }} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="tile flex flex-wrap items-center gap-4 border-dashed p-6">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-50 text-accent-600"><Lock className="h-6 w-6" /></span>
                <div className="flex-1">
                  <h2 className="font-semibold">الاستوري غير مفعّل لمتجرك</h2>
                  <p className="mt-1 text-sm leading-6 text-ink-soft">يُفعَّل باشتراك شهري من إدارة سوقي. بعد التفعيل تظهر حالات متجرك لكل زوار المنصة في أعلى الصفحة الرئيسية لمدة 30 يومًا.</p>
                </div>
              </div>
            )}

            {/* الحالات النشطة */}
            <section>
              <h3 className="mb-3 font-semibold">الحالات المنشورة الآن <span className="text-sm font-normal text-ink-muted">({live.length}/15)</span></h3>
              {live.length === 0 ? (
                <div className="tile p-8 text-center text-sm text-ink-soft">لا توجد حالات منشورة حاليًا.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {live.map((s) => <StoryCard key={s.id} s={s} onDelete={() => remove(s.id)} />)}
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section>
                <h3 className="mb-3 font-semibold">انتهت خلال آخر 7 أيام</h3>
                <div className="grid grid-cols-3 gap-3 opacity-70 sm:grid-cols-4 lg:grid-cols-6">
                  {past.map((s) => <StoryCard key={s.id} s={s} small onDelete={() => remove(s.id)} />)}
                </div>
              </section>
            )}

            {!!data?.history.length && (
              <section>
                <h3 className="mb-3 font-semibold">سجل الاشتراكات</h3>
                <div className="tile divide-y divide-line">
                  {data.history.map((h, i) => (
                    <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <span className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-ink-muted" />{formatDate(h.starts_at)} — {formatDate(h.ends_at)}</span>
                      <span className="flex items-center gap-2 text-ink-soft">{h.days} يوم {h.cancelled_at && <Badge tone="red">أُوقف</Badge>}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* إنشاء حالة */}
          <aside className="tile h-fit p-5 xl:sticky xl:top-24">
            <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-5 w-5 text-accent-500" /> حالة جديدة</h3>
            {!data?.active ? (
              <p className="mt-3 text-sm text-ink-soft">يمكنك النشر بعد تفعيل الاشتراك من الإدارة.</p>
            ) : (
              <>
                <div className="relative mx-auto mt-4 aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-[26px] bg-ink ring-[6px] ring-ink">
                  {draft ? (
                    <>
                      {draft.type === 'image'
                        ? <img src={draft.url} alt="" className="h-full w-full object-cover" />
                        : <video src={draft.url} className="h-full w-full object-cover" autoPlay muted loop playsInline />}
                      {caption && <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-10 text-xs leading-5 text-white">{caption}</p>}
                      <button onClick={clearDraft} className="absolute left-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white" aria-label="إزالة"><X className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <button onClick={() => input.current?.click()} className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/80 transition hover:text-white">
                      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10"><ImagePlus className="h-7 w-7" /></span>
                      <span className="text-sm font-medium">اختر صورة أو فيديو</span>
                      <span className="px-6 text-center text-[11px] leading-5 text-white/50">صورة حتى 5MB، أو فيديو MP4 حتى 30 ثانية و20MB. الأفضل بمقاس عمودي 9:16</span>
                    </button>
                  )}
                </div>
                <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(e) => pick(e.target.files)} />
                <div className="mt-4 space-y-3">
                  <Field label={`النص (${caption.length}/200)`}>
                    <Textarea rows={2} maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="مثال: خصم 20% على السماعات حتى نهاية الأسبوع" />
                  </Field>
                  <Field label="ربط بمنتج (اختياري)" hint="يظهر زر «تسوّق المنتج» أسفل الحالة">
                    <Select value={product} onChange={(e) => setProduct(e.target.value)}>
                      <option value="">بدون، زر «زيارة المتجر»</option>
                      {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </Field>
                  <Field label="مدة الظهور">
                    <div className="grid grid-cols-3 gap-2">
                      {STORY_HOURS.map((h) => (
                        <button key={h.v} type="button" onClick={() => setHours(h.v)}
                          className={`h-10 rounded-xl border text-sm transition ${hours === h.v ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-soft hover:border-brand-300'}`}>{h.l}</button>
                      ))}
                    </div>
                  </Field>
                  <Button className="w-full" size="lg" onClick={publish} loading={busy} disabled={!draft}>
                    {draft?.type === 'video' ? <Film className="h-5 w-5" /> : <Send className="h-5 w-5" />} نشر الحالة
                  </Button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function StoryCard({ s, onDelete, small }: { s: Center['stories'][number]; onDelete: () => void; small?: boolean }) {
  const left = new Date(s.expires_at).getTime() - Date.now();
  const hoursLeft = Math.max(0, Math.ceil(left / 3600000));
  return (
    <div className="group relative aspect-[9/16] overflow-hidden rounded-2xl bg-ink">
      {s.media_type === 'image'
        ? <img src={s.media_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        : <video src={s.media_url} className="h-full w-full object-cover" muted playsInline preload="metadata" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/30" />
      <div className="absolute inset-x-2 top-2 flex items-center justify-between text-[11px] text-white">
        <span className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5"><Eye className="h-3 w-3" />{formatNumber(s.views)}</span>
        {s.media_type === 'video' && <Film className="h-4 w-4" />}
      </div>
      {!small && (
        <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
          {s.caption && <p className="line-clamp-2 text-xs leading-5">{s.caption}</p>}
          <p className="mt-1 text-[10px] text-white/70">{s.live ? `تنتهي خلال ${hoursLeft} س` : `نُشرت ${timeAgo(s.created_at)}`}</p>
        </div>
      )}
      <button onClick={onDelete} className="absolute left-2 top-9 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-red-600 shadow transition md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100" aria-label="حذف الحالة">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function confirmDelete() {
  return window.confirm('حذف هذه الحالة نهائيًا؟');
}
