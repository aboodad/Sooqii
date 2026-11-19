'use client';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getSupabase } from '@/lib/supabase/client';
import type { Currency, PublicSettings } from '@/lib/types';
import { formatPrice } from '@/lib/format';

const DEFAULTS: PublicSettings = {
  payment_methods: [{ key: 'cod', label: 'الدفع عند الاستلام', enabled: true }],
  whatsapp_number: '', hub_enabled: false, pickup_enabled: false, pickup_fee: 0, return_days: 7, support_phone: '', currency: 'YER',
  loyalty: { enabled: false, point_value: 1, max_redeem_percent: 30, min_redeem: 100, daily_points: 5, streak_days: 7, streak_bonus: 50,
             purchase_percent: 2, review_points: 20, referral_inviter: 200, referral_invitee: 100, signup_points: 100 },
};

// تُجلب الإعدادات العامة مرة واحدة لكل جلسة تصفح (المفاتيح public_* مقروءة للجميع بسياسة RLS)
let cache: { settings: PublicSettings; currencies: Currency[] } | null = null;
let inflight: Promise<{ settings: PublicSettings; currencies: Currency[] }> | null = null;

async function load() {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const sb = getSupabase();
    const [{ data: rows }, { data: cur }] = await Promise.all([
      sb.from('app_settings').select('key,value').like('key', 'public_%'),
      sb.from('currencies').select('code,name_ar,symbol,rate,decimals').eq('is_active', true).order('sort'),
    ]);
    const m = Object.fromEntries((rows ?? []).map((r: { key: string; value: unknown }) => [r.key.replace(/^public_/, ''), r.value]));
    const settings: PublicSettings = {
      ...DEFAULTS,
      payment_methods: Array.isArray(m.payment_methods) ? (m.payment_methods as PublicSettings['payment_methods']) : DEFAULTS.payment_methods,
      whatsapp_number: String(m.whatsapp_number ?? ''),
      hub_enabled: m.hub_enabled === true, pickup_enabled: m.pickup_enabled === true,
      pickup_fee: Number(m.pickup_fee ?? 0), return_days: Number(m.return_days ?? 7),
      support_phone: String(m.support_phone ?? ''), currency: String(m.currency ?? 'YER'),
      loyalty: { ...DEFAULTS.loyalty, ...((m.loyalty as object) ?? {}) },
    };
    cache = { settings, currencies: ((cur ?? []) as Currency[]).map((c) => ({ ...c, rate: Number(c.rate) })) };
    return cache;
  })().finally(() => { inflight = null; });
  return inflight;
}

export function usePublicSettings() {
  const [state, setState] = useState(cache);
  useEffect(() => { if (!cache) load().then(setState).catch(() => {}); }, []);
  return { settings: state?.settings ?? DEFAULTS, currencies: state?.currencies ?? [], ready: !!state };
}

/** عملة العرض المختارة (الأسعار مخزّنة بالريال اليمني، والتحويل للعرض فقط) */
export const useCurrencyStore = create<{ code: string; setCode: (c: string) => void }>()(
  persist((set) => ({ code: 'YER', setCode: (code) => set({ code }) }), { name: 'sawqy-currency' }),
);

export function useMoney() {
  const { currencies } = usePublicSettings();
  const code = useCurrencyStore((s) => s.code);
  const cur = currencies.find((c) => c.code === code);
  return (yer: number | string | null | undefined) => {
    if (!cur || cur.code === 'YER') return formatPrice(yer);
    const v = Number(yer || 0) / cur.rate;
    return `${new Intl.NumberFormat('ar', { minimumFractionDigits: cur.decimals, maximumFractionDigits: cur.decimals }).format(v)} ${cur.symbol}`;
  };
}

/** يعرض المبلغ بعملة المستخدم، مع إظهار المبلغ بالريال اليمني كمرجع عند اختيار عملة أخرى */
export function Money({ value, className, showBase }: { value: number | string | null | undefined; className?: string; showBase?: boolean }) {
  const fmt = useMoney();
  const code = useCurrencyStore((s) => s.code);
  return (
    <span className={className}>
      {fmt(value)}
      {showBase && code !== 'YER' && <span className="mr-1 text-[11px] font-normal text-ink-muted">({formatPrice(value)})</span>}
    </span>
  );
}
