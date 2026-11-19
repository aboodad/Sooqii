'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { useSession } from '@/hooks/use-session';
import { timeAgo } from '@/lib/format';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { cn, safeNext } from '@/lib/utils';

export default function NotificationsPage() {
  const sb = getSupabase();
  const { refresh } = useSession();
  const { data, loading } = useQuery(async () => {
    const { data } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
    return data ?? [];
  });
  useEffect(() => { if (data?.some((n) => !n.read_at)) sb.rpc('mark_notifications_read', { p_ids: null }).then(() => refresh()); }, [data, sb, refresh]);
  if (loading) return <Skeleton className="h-64" />;
  if (!data?.length) return <div className="card"><EmptyState icon={<Bell />} title="لا توجد إشعارات" /></div>;
  return (
    <div className="space-y-2">
      <h1 className="mb-2 text-xl font-semibold md:text-2xl">الإشعارات</h1>
      {data.map((n) => (
        <Link key={n.id} href={safeNext(n.link, '/account')} className={cn('card flex items-start gap-3 p-4 transition hover:shadow-lift', !n.read_at && 'ring-2 ring-brand-200')}>
          <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', n.read_at ? 'bg-slate-200' : 'bg-accent-500')} />
          <div className="flex-1"><p className="font-semibold">{n.title}</p>{n.body && <p className="text-sm text-ink-soft">{n.body}</p>}</div>
          <span className="text-xs text-ink-muted">{timeAgo(n.created_at)}</span>
        </Link>
      ))}
    </div>
  );
}
