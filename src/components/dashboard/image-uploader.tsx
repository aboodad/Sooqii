'use client';
import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '@/lib/validation';

/** التحقق من النوع الفعلي للملف عبر التوقيع (magic bytes) وليس الامتداد فقط */
async function sniff(file: File): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'webp';
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return 'avif';
  return null;
}

export function ImageUploader({ storeId, bucket = 'product-images', value, onChange, max = 8 }: {
  storeId: string; bucket?: 'product-images' | 'store-assets'; value: string[]; onChange: (urls: string[]) => void; max?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const sb = getSupabase();
    const urls = [...value];
    for (const file of Array.from(files).slice(0, max - urls.length)) {
      if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) { toast.error(`${file.name}: صورة JPG/PNG/WebP حتى 5MB فقط`); continue; }
      const ext = await sniff(file);
      if (!ext) { toast.error(`${file.name}: محتوى الملف ليس صورة صالحة`); continue; }
      const path = `${storeId}/${crypto.randomUUID()}.${ext}`; // اسم عشوائي داخل مجلد المتجر
      const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
      if (error) { toast.error('فشل رفع الصورة'); continue; }
      urls.push(sb.storage.from(bucket).getPublicUrl(path).data.publicUrl);
    }
    onChange(urls);
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="flex flex-wrap gap-3">
      {value.map((u, i) => (
        <div key={u} className="group relative h-24 w-24 overflow-hidden rounded-2xl ring-1 ring-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt="" className="h-full w-full object-cover" />
          {i === 0 && <span className="absolute bottom-1 right-1 rounded-md bg-brand-500 px-1.5 text-[10px] font-bold text-white">رئيسية</span>}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== u))} className="absolute left-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-red-600 opacity-0 shadow transition group-hover:opacity-100" aria-label="حذف"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      {value.length < max && (
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className="grid h-24 w-24 place-items-center rounded-2xl border-2 border-dashed border-slate-300 text-ink-muted transition hover:border-brand-400 hover:text-brand-600">
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus className="h-6 w-6" />إضافة</span>}
        </button>
      )}
      <input ref={input} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden onChange={(e) => upload(e.target.files)} />
    </div>
  );
}
