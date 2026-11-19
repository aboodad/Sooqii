'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { StoryGroup } from '@/lib/types';
import { getSupabase } from '@/lib/supabase/client';
import { useSession } from '@/hooks/use-session';
import { markSeenLocal, readSeen } from '@/lib/stories';
import { StoryAvatar } from './story-avatar';

// العارض يُحمَّل عند أول فتح فقط لتخفيف الصفحة الرئيسية
const StoryViewer = dynamic(() => import('./story-viewer').then((m) => m.StoryViewer), { ssr: false });

/** شريط حالات المتاجر: كل المتاجر التي لديها اشتراك استوري ساري */
export function StoryBar() {
  const { user, loading: sessionLoading } = useSession();
  const [groups, setGroups] = useState<StoryGroup[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const reported = useRef(new Set<string>());
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sessionLoading) return;
    let alive = true;
    getSupabase().rpc('get_story_feed').then(({ data, error }) => {
      if (!alive) return;
      if (error) { setGroups([]); return; }
      let list = (data as StoryGroup[]) ?? [];
      if (!user) {
        // للزائر: حالة المشاهدة من الجهاز
        const seen = readSeen();
        list = list.map((g) => {
          const stories = g.stories.map((s) => ({ ...s, seen: seen.has(s.id) }));
          return { ...g, stories, all_seen: stories.every((s) => s.seen) };
        });
        list.sort((a, b) => Number(a.all_seen) - Number(b.all_seen));
      }
      setGroups(list);
    });
    return () => { alive = false; };
  }, [user, sessionLoading]);

  const onSeen = useCallback((id: string) => {
    if (reported.current.has(id)) return;
    reported.current.add(id);
    // الزائر: لا نعدّ المشاهدة مرتين من نفس الجهاز
    const already = !user && readSeen().has(id);
    if (!user) markSeenLocal(id);
    if (!already) getSupabase().rpc('record_story_view', { p_story: id }).then(() => {});
    setGroups((gs) => gs?.map((g) => {
      if (!g.stories.some((s) => s.id === id)) return g;
      const stories = g.stories.map((s) => (s.id === id ? { ...s, seen: true } : s));
      return { ...g, stories, all_seen: stories.every((s) => s.seen) };
    }) ?? gs);
  }, [user]);

  const onClose = useCallback(() => setOpen(null), []);

  if (groups && groups.length === 0) return null;

  const scroll = (d: number) => scroller.current?.scrollBy({ left: d * 360, behavior: 'smooth' });

  return (
    <section aria-label="حالات المتاجر">
      <div className="mb-3 flex items-end justify-between md:mb-4">
        <div>
          <h2 className="text-lg font-semibold md:text-2xl">حالات المتاجر</h2>
          <p className="mt-0.5 text-xs text-ink-soft md:text-sm">عروض وجديد المتاجر على سوقي</p>
        </div>
        <div className="hidden gap-2 md:flex">
          <button onClick={() => scroll(1)} className="grid h-10 w-10 place-items-center rounded-2xl border border-line bg-white text-ink-soft hover:text-ink" aria-label="السابق"><ChevronRight className="h-5 w-5" /></button>
          <button onClick={() => scroll(-1)} className="grid h-10 w-10 place-items-center rounded-2xl border border-line bg-white text-ink-soft hover:text-ink" aria-label="التالي"><ChevronLeft className="h-5 w-5" /></button>
        </div>
      </div>
      <div ref={scroller} className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 md:mx-0 md:gap-6 md:px-0">
        {groups === null
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex w-[72px] shrink-0 flex-col items-center gap-2 md:w-[92px]">
                <span className="skeleton h-[72px] w-[72px] rounded-full md:h-[92px] md:w-[92px]" />
                <span className="skeleton h-3 w-14" />
              </div>
            ))
          : groups.map((g, i) => (
              <button key={g.store.id} onClick={() => setOpen(i)}
                className="group flex w-[72px] shrink-0 flex-col items-center gap-1.5 md:w-[92px]" aria-label={`حالات ${g.store.name}`}>
                <StoryAvatar store={g.store} seen={g.all_seen} size="fluid"
                  className="h-[72px] w-[72px] transition-transform duration-200 group-hover:scale-105 group-active:scale-95 md:h-[92px] md:w-[92px]" />
                <span className={`w-full truncate text-center text-[11px] md:text-[13px] ${g.all_seen ? 'text-ink-muted' : 'font-medium text-ink'}`}>{g.store.name}</span>
              </button>
            ))}
      </div>
      {open !== null && groups && <StoryViewer groups={groups} startGroup={open} onClose={onClose} onSeen={onSeen} />}
    </section>
  );
}
