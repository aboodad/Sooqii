'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import type { MyContext } from '@/lib/types';
import { useCartStore } from '@/stores/cart-store';
import { mergeCart } from '@/lib/api/cart';

type SessionValue = {
  user: User | null; ctx: MyContext; loading: boolean;
  refresh: () => Promise<void>;
  isAdmin: boolean; isStaff: boolean; isMerchant: boolean;
};
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const sb = getSupabase();
  const [user, setUser] = useState<User | null>(null);
  const [ctx, setCtx] = useState<MyContext>(null);
  const [loading, setLoading] = useState(true);
  const setCount = useCartStore((s) => s.setCount);

  // يمنع تشغيل أكثر من تحديث في نفس الوقت (كان يسبب تعليقًا عند الدخول)
  const inflight = useRef<Promise<void> | null>(null);

  const load = useCallback(async (u: User | null) => {
    setUser(u);
    try {
      if (u) {
        // دمج سلة الزائر بعد الدخول
        const guest = useCartStore.getState().guest;
        if (guest.length) {
          try {
            await mergeCart(sb, guest.map((g) => ({ offer_id: g.offer_id, qty: g.qty })));
            useCartStore.getState().clearGuest();
          } catch { /* تُترك محليًا وتُعاد المحاولة لاحقًا */ }
        }
        const [{ data: c }, { data: cart }] = await Promise.all([
          sb.rpc('get_my_context'),
          sb.from('cart_items').select('qty'),
        ]);
        setCtx((c as MyContext) ?? null);
        setCount((cart ?? []).reduce((s: number, r: { qty: number }) => s + r.qty, 0));
      } else {
        setCtx(null);
        setCount(useCartStore.getState().guest.reduce((s, g) => s + g.qty, 0));
      }
    } catch {
      /* خطأ شبكة مؤقت: لا نترك الواجهة عالقة */
    } finally {
      setLoading(false);
    }
  }, [sb, setCount]);

  const refresh = useCallback(async () => {
    if (inflight.current) return inflight.current;
    inflight.current = (async () => {
      // getSession يقرأ الجلسة محليًا بلا رحلة شبكة؛ التحقق الفعلي يتم في قاعدة البيانات (RLS)
      const { data: { session } } = await sb.auth.getSession();
      await load(session?.user ?? null);
    })().finally(() => { inflight.current = null; });
    return inflight.current;
  }, [sb, load]);

  useEffect(() => {
    // INITIAL_SESSION يصل فور التحميل فيغني عن استدعاء منفصل.
    // لا نستدعي Supabase داخل callback مباشرة (يسبب قفلًا وتعليقًا) — نؤجله بـ setTimeout.
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') { setUser(session?.user ?? null); return; }
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'MFA_CHALLENGE_VERIFIED') {
        setTimeout(() => { load(session?.user ?? null); }, 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, load]);

  // إشعارات لحظية (Realtime يحترم RLS)
  const uid = user?.id;
  useEffect(() => {
    if (!uid) return;
    const ch = sb.channel(`notif-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload) => {
          setCtx((c) => (c ? { ...c, unread: c.unread + 1 } : c));
          import('sonner').then(({ toast }) => toast((payload.new as { title: string }).title));
        })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [sb, uid]);

  const value = useMemo<SessionValue>(() => {
    const roles = ctx?.roles ?? [];
    return {
      user, ctx, loading, refresh,
      isAdmin: roles.includes('super_admin') || roles.includes('admin'),
      isStaff: roles.length > 0,
      isMerchant: (ctx?.stores?.length ?? 0) > 0,
    };
  }, [user, ctx, loading, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession must be used within SessionProvider');
  return v;
}
