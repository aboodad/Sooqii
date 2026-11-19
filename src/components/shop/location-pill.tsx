'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { getSupabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/** «التوصيل إلى»: مدينة العنوان الافتراضي للمستخدم، أو تغطية المنصة للزائر */
export function LocationPill({ className }: { className?: string }) {
  const { user } = useSession();
  const [place, setPlace] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setPlace(null); return; }
    let alive = true;
    getSupabase().from('addresses').select('district, cities(name_ar)').eq('is_default', true).limit(1).maybeSingle()
      .then(({ data }: { data: { district: string | null; cities: { name_ar: string } | null } | null }) => {
        if (!alive || !data) return;
        setPlace([data.cities?.name_ar, data.district].filter(Boolean).join('، ') || null);
      });
    return () => { alive = false; };
  }, [user]);

  return (
    <Link href={user ? '/account/addresses' : '/auth/login?next=/account/addresses'}
      className={cn('flex h-12 shrink-0 items-center gap-2.5 rounded-2xl bg-mist px-3.5 text-right transition hover:bg-brand-50', className)}>
      <MapPin className="h-5 w-5 text-brand-500" />
      <span className="leading-tight">
        <span className="block text-[11px] text-ink-muted">التوصيل إلى</span>
        <span className="flex items-center gap-1 text-sm font-medium text-ink">
          <span className="max-w-[9rem] truncate">{place ?? (user ? 'أضف عنوانك' : 'كل محافظات اليمن')}</span>
          <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
        </span>
      </span>
    </Link>
  );
}
