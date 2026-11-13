'use client';
/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Pause, Play, ShoppingBag, Store, Volume2, VolumeX, X } from 'lucide-react';
import type { StoryGroup } from '@/lib/types';
import { timeAgo } from '@/lib/format';
import { StoryAvatar } from './story-avatar';

type Props = {
  groups: StoryGroup[];
  startGroup: number;
  onClose: () => void;
  onSeen: (storyId: string) => void;
};

/**
 * عارض الحالات بملء الشاشة بأسلوب إنستغرام:
 * - أشرطة تقدم أعلى الشاشة وانتقال تلقائي
 * - لمسة يسار = التالي، يمين = السابق (اتجاه عربي)، الضغط المطوّل = إيقاف مؤقت
 * - السحب للأسفل أو زر الرجوع في الجوال أو Esc للإغلاق
 */
export function StoryViewer({ groups, startGroup, onClose, onSeen }: Props) {
  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(() => firstUnseen(groups[startGroup]));
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [mounted, setMounted] = useState(false);

  const group = groups[gi];
  const story = group?.stories[si];
  const videoRef = useRef<HTMLVideoElement>(null);
  const elapsed = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const pushed = useRef(false);

  // ---------- التنقل ----------
  const close = useCallback(() => {
    if (pushed.current) { pushed.current = false; history.back(); } else onClose();
  }, [onClose]);

  const next = useCallback(() => {
    if (!group) return;
    if (si < group.stories.length - 1) { setSi(si + 1); return; }
    if (gi < groups.length - 1) { setDir(1); setGi(gi + 1); setSi(firstUnseen(groups[gi + 1])); return; }
    close();
  }, [group, si, gi, groups, close]);

  const prev = useCallback(() => {
    if (si > 0) { setSi(si - 1); return; }
    if (gi > 0) { setDir(-1); setGi(gi - 1); setSi(0); return; }
    elapsed.current = 0; setProgress(0);
  }, [si, gi]);

  const nextGroup = useCallback(() => {
    if (gi < groups.length - 1) { setDir(1); setGi(gi + 1); setSi(firstUnseen(groups[gi + 1])); } else close();
  }, [gi, groups, close]);
  const prevGroup = useCallback(() => { if (gi > 0) { setDir(-1); setGi(gi - 1); setSi(0); } }, [gi]);

  // ---------- دورة الحياة ----------
  useEffect(() => {
    setMounted(true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // زر الرجوع في الجوال يغلق العارض بدل مغادرة الصفحة
    history.pushState({ sawqyStory: true }, '');
    pushed.current = true;
    const onPop = () => { pushed.current = false; onClose(); };
    window.addEventListener('popstate', onPop);
    return () => { document.body.style.overflow = prevOverflow; window.removeEventListener('popstate', onPop); };
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') next();
      else if (e.key === 'ArrowRight') prev();
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, next, prev]);

  // عند تغيير الحالة: صفّر المؤقت وسجّل المشاهدة وحمّل التالية مسبقًا
  useEffect(() => {
    if (!story) return;
    elapsed.current = 0;
    setProgress(0);
    setLoaded(false);
    onSeen(story.id);
    const upcoming = group.stories[si + 1] ?? groups[gi + 1]?.stories[0];
    if (upcoming?.media_type === 'image') { const im = new Image(); im.src = upcoming.media_url; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  // مؤقت الصور (الفيديو يتقدّم حسب وقت التشغيل)
  useEffect(() => {
    if (!story || story.media_type !== 'image' || !loaded || paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      elapsed.current += t - last;
      last = t;
      const p = Math.min(1, elapsed.current / story.duration_ms);
      setProgress(p);
      if (p >= 1) { next(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [story, loaded, paused, next]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (paused) v.pause(); else v.play().catch(() => { /* المتصفح منع التشغيل التلقائي */ });
  }, [paused, story?.id, loaded]);

  // ---------- اللمس ----------
  const start = useRef<{ x: number; y: number } | null>(null);
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    start.current = { x: e.clientX, y: e.clientY };
    held.current = false;
    holdTimer.current = setTimeout(() => { held.current = true; setPaused(true); }, 220);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    const s0 = start.current; start.current = null;
    const dx = s0 ? e.clientX - s0.x : 0;
    const dy = s0 ? e.clientY - s0.y : 0;
    const wasHeld = held.current;
    if (wasHeld) { held.current = false; setPaused(false); }
    // سحب للأسفل = إغلاق، سحب أفقي = تبديل المتجر (يسار = التالي في الاتجاه العربي)
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) { close(); return; }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { if (dx < 0) nextGroup(); else prevGroup(); return; }
    if (wasHeld || Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x > 0.66) prev(); else next();
  }

  if (!mounted || !group || !story) return null;

  const cta = story.product
    ? { href: `/p/${story.product.slug}`, label: 'تسوّق المنتج', icon: <ShoppingBag className="h-4 w-4" /> }
    : { href: `/s/${group.store.slug}`, label: 'زيارة المتجر', icon: <Store className="h-4 w-4" /> };

  return createPortal(
    <div className="fixed left-0 top-0 z-[70] flex h-[100dvh] w-full items-center justify-center overscroll-none bg-black" role="dialog" aria-modal="true" aria-label={`حالات ${group.store.name}`}>
      {/* أزرار الانتقال بين المتاجر على الشاشات الكبيرة */}
      <button onClick={prevGroup} disabled={gi === 0} aria-label="المتجر السابق"
        className="absolute right-6 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-0 md:grid">
        <ChevronRight className="h-6 w-6" />
      </button>
      <button onClick={nextGroup} aria-label="المتجر التالي"
        className="absolute left-6 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 md:grid">
        <ChevronLeft className="h-6 w-6" />
      </button>

      {/* بدون إزاحات أفقية: البطاقة دائمًا بعرض الشاشة على الجوال */}
      <div key={group.store.id} data-dir={dir}
          className="relative h-full w-full animate-story-in overflow-hidden bg-neutral-900 sm:h-[92dvh] sm:max-h-[860px] sm:w-auto sm:aspect-[9/16] sm:rounded-[28px]">

          {/* الوسائط */}
          {story.media_type === 'video' ? (
            <video key={story.id} ref={videoRef} src={story.media_url} playsInline muted={muted} autoPlay preload="auto"
              className="absolute inset-0 h-full w-full object-cover"
              onLoadedData={() => setLoaded(true)}
              onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }}
              onEnded={next} />
          ) : (
            <img key={story.id} src={story.media_url} alt={story.caption ?? group.store.name}
              className="absolute inset-0 h-full w-full object-cover" onLoad={() => setLoaded(true)} onError={() => setLoaded(true)} draggable={false} />
          )}
          {!loaded && <div className="absolute inset-0 grid place-items-center"><span className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/20 border-t-white" /></div>}

          {/* منطقة اللمس */}
          <div className="absolute inset-0 z-10 select-none" style={{ touchAction: 'none' }} onPointerDown={onPointerDown} onPointerUp={onPointerUp}
            onPointerCancel={() => { start.current = null; if (holdTimer.current) clearTimeout(holdTimer.current); if (held.current) { held.current = false; setPaused(false); } }}
            onContextMenu={(e) => e.preventDefault()} />

          {/* الرأس */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/60 to-transparent px-3 pb-10 pt-[max(env(safe-area-inset-top),12px)]">
            <div className="flex gap-1" dir="rtl">
              {group.stories.map((s, i) => (
                <span key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                  <span className="block h-full rounded-full bg-white"
                    style={{ width: `${i < si ? 100 : i === si ? progress * 100 : 0}%` }} />
                </span>
              ))}
            </div>
            <div className="pointer-events-auto mt-3 flex items-center gap-2.5 text-white">
              <Link href={`/s/${group.store.slug}`} className="flex min-w-0 items-center gap-2.5">
                <StoryAvatar store={group.store} seen size={38} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{group.store.name}</span>
                  <span className="block text-[11px] text-white/70">{timeAgo(story.created_at)}</span>
                </span>
              </Link>
              <span className="mr-auto flex items-center gap-1">
                {story.media_type === 'video' && (
                  <button onClick={() => setMuted((m) => !m)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15" aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}>
                    {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </button>
                )}
                <button onClick={() => setPaused((p) => !p)} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15" aria-label={paused ? 'متابعة' : 'إيقاف مؤقت'}>
                  {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                </button>
                <button onClick={close} className="grid h-9 w-9 place-items-center rounded-full hover:bg-white/15" aria-label="إغلاق">
                  <X className="h-6 w-6" />
                </button>
              </span>
            </div>
          </div>

          {/* النص وزر الإجراء */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-[max(env(safe-area-inset-bottom),18px)] pt-16 text-white">
            {story.caption && <p className="mb-4 text-[15px] font-medium leading-7 [text-shadow:0_1px_8px_rgba(0,0,0,.5)]">{story.caption}</p>}
            <Link href={cta.href} onClick={() => { pushed.current = false; }}
              className="pointer-events-auto flex h-12 items-center justify-center gap-2 rounded-2xl bg-white text-sm font-semibold text-ink transition active:scale-[.98]">
              {cta.icon}{cta.label}
            </Link>
          </div>
      </div>
    </div>,
    document.body,
  );
}

function firstUnseen(g?: StoryGroup) {
  if (!g) return 0;
  const i = g.stories.findIndex((s) => !s.seen);
  return i < 0 ? 0 : i;
}
