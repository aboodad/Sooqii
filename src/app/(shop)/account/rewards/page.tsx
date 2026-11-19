'use client';
import { useState } from 'react';
import { CalendarCheck, Copy, Flame, Gift, Coins, Share2, Ticket, Trophy, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { useSession } from '@/hooks/use-session';
import { formatDate, formatNumber, formatPrice } from '@/lib/format';
import { errorMessage, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Modal, Skeleton, EmptyState } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';

type Center = {
  settings: { enabled: boolean; daily_points: number; streak_days: number; streak_bonus: number; referral_inviter: number; referral_invitee: number; point_value: number };
  balance: number; pending: number;
  history: { amount: number; kind: string; status: string; note: string | null; at: string; available_at: string | null }[];
  checkin: { today: boolean; streak: number };
  referral: { code: string; used: boolean; invited: number };
  rewards: { id: number; title: string; description: string | null; cost: number; type: string; value: number; min_cart: number; valid_days: number }[];
  packs: { id: number; title: string; description: string | null; coupons: { value: number; min_cart: number }[]; valid_days: number; claimed: boolean }[];
  gifts: { id: number; title: string; description: string | null; options: { key: string; title: string; type: string; value: number }[]; pick_count: number; min_orders: number; claimed: boolean }[];
  raffles: { id: number; title: string; description: string | null; prize: string; image_url: string | null; entry_cost: number; ends_at: string; status: string; entered: boolean; won: boolean; entries: number }[];
  coupons: { code: string; type: string; value: number; min_cart: number; ends_at: string; used: boolean }[];
};

export default function RewardsPage() {
  const sb = getSupabase();
  const { refresh } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const [gift, setGift] = useState<Center['gifts'][number] | null>(null);
  const [refCode, setRefCode] = useState('');
  const { data: c, loading, reload } = useQuery(async () => {
    const { data, error } = await sb.rpc('loyalty_center');
    if (error) throw error;
    return data as Center;
  });

  async function run(key: string, fn: () => PromiseLike<{ data: unknown; error: unknown }>, ok: (d: never) => string) {
    setBusy(key);
    const { data, error } = await fn();
    setBusy(null);
    if (error) return toast.error(errorMessage(error));
    toast.success(ok(data as never)); reload(); refresh();
  }

  if (loading && !c) return <Skeleton className="h-96" />;
  if (!c) return null;
  if (!c.settings.enabled) return <div className="tile"><EmptyState icon={<Gift />} title="برنامج المكافآت قريبًا" text="ترقّب نقاطًا وهدايا على مشترياتك." /></div>;

  const coupon = (t: string, v: number) => (t.includes('percent') || t === 'percent' ? `${v}%` : formatPrice(v));

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-lift">
        <Sparkles className="absolute -left-4 -top-4 h-28 w-28 opacity-10" />
        <p className="text-sm text-white/70">رصيد نقاطك</p>
        <p className="mt-1 text-4xl font-black">{formatNumber(c.balance)} <span className="text-base font-medium">نقطة</span></p>
        <p className="mt-1 text-sm text-white/80">تعادل {formatPrice(c.balance * c.settings.point_value)} عند الدفع{c.pending > 0 ? ` · ${formatNumber(c.pending)} نقطة قيد التفعيل` : ''}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="accent" disabled={c.checkin.today} loading={busy === 'checkin'}
            onClick={() => run('checkin', () => sb.rpc('daily_checkin'), (d: { points: number; bonus: number }) => `+${d.points + d.bonus} نقطة${d.bonus ? ' مع مكافأة الأيام المتتالية 🎉' : ''}`)}>
            <CalendarCheck className="h-4 w-4" /> {c.checkin.today ? 'سجّلت اليوم ✓' : `سجّل حضورك (+${c.settings.daily_points})`}
          </Button>
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm"><Flame className="h-4 w-4 text-amber-300" /> {c.checkin.streak} يوم متتالي</span>
          <span className="text-xs text-white/70">كل {c.settings.streak_days} أيام متتالية = +{c.settings.streak_bonus} نقطة</span>
        </div>
      </div>

      <Section icon={<Share2 />} title="ادعُ أصدقاءك">
        <p className="mb-3 text-sm text-ink-soft">شارك كودك: يحصل صديقك على {c.settings.referral_invitee} نقطة، وتحصل أنت على {c.settings.referral_inviter} نقطة بعد استلام أول طلب له.</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl bg-mist px-4 py-2 font-mono text-lg font-bold tracking-widest" dir="ltr">{c.referral.code}</span>
          <Button size="sm" variant="soft" onClick={() => { navigator.clipboard?.writeText(c.referral.code); toast.success('تم النسخ'); }}><Copy className="h-4 w-4" /> نسخ</Button>
          <span className="text-xs text-ink-muted">دعوت {c.referral.invited}</span>
        </div>
        {!c.referral.used && (
          <div className="mt-4 flex max-w-sm gap-2">
            <Input placeholder="لديك كود دعوة؟" dir="ltr" value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase().slice(0, 12))} />
            <Button size="sm" disabled={refCode.length < 6} loading={busy === 'ref'} onClick={() => run('ref', () => sb.rpc('apply_referral', { p_code: refCode }), () => 'تم تطبيق كود الدعوة')}>تطبيق</Button>
          </div>
        )}
      </Section>

      {c.rewards.length > 0 && (
        <Section icon={<Coins />} title="متجر النقاط">
          <div className="grid gap-3 sm:grid-cols-2">
            {c.rewards.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-mist p-4">
                <div className="flex-1"><p className="font-bold">{r.title}</p><p className="text-xs text-ink-soft">كوبون {coupon(r.type, r.value)}{r.min_cart > 0 ? ` للطلبات فوق ${formatPrice(r.min_cart)}` : ''} · صالح {r.valid_days} يومًا</p></div>
                <Button size="sm" disabled={c.balance < r.cost} loading={busy === `r${r.id}`}
                  onClick={() => run(`r${r.id}`, () => sb.rpc('redeem_reward', { p_reward: r.id }), (d: { code: string }) => `كوبونك: ${d.code}`)}>{formatNumber(r.cost)} نقطة</Button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {c.packs.length > 0 && (
        <Section icon={<Ticket />} title="باقات الكوبونات">
          {c.packs.map((p) => (
            <div key={p.id} className="rounded-2xl bg-gradient-to-l from-accent-50 to-white p-4 ring-1 ring-accent-100">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1"><p className="font-bold">{p.title}</p>{p.description && <p className="text-xs text-ink-soft">{p.description}</p>}</div>
                <Button size="sm" variant="accent" disabled={p.claimed} loading={busy === `p${p.id}`}
                  onClick={() => run(`p${p.id}`, () => sb.rpc('claim_coupon_pack', { p_pack: p.id }), (d: { codes: string[] }) => `أُضيفت ${d.codes.length} كوبونات إلى حسابك`)}>{p.claimed ? 'تم الاستلام' : 'احصل عليها'}</Button>
              </div>
              <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto">
                {p.coupons.map((x, i) => <span key={i} className="shrink-0 rounded-xl border border-dashed border-accent-300 bg-white px-3 py-1.5 text-xs"><b>{formatPrice(x.value)}</b>{x.min_cart ? <span className="text-ink-muted"> / {formatNumber(x.min_cart)}+</span> : null}</span>)}
              </div>
            </div>
          ))}
        </Section>
      )}

      {c.gifts.length > 0 && (
        <Section icon={<Gift />} title="اختر هداياك">
          <div className="grid gap-3 sm:grid-cols-2">
            {c.gifts.map((g) => (
              <div key={g.id} className="rounded-2xl bg-mist p-4">
                <p className="font-bold">{g.title}</p>{g.description && <p className="text-xs text-ink-soft">{g.description}</p>}
                <Button size="sm" className="mt-3" disabled={g.claimed} onClick={() => setGift(g)}>{g.claimed ? 'تم الاستلام' : `اختر ${g.pick_count} هدايا`}</Button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {c.raffles.length > 0 && (
        <Section icon={<Trophy />} title="السحوبات">
          <div className="grid gap-3 sm:grid-cols-2">
            {c.raffles.map((r) => (
              <div key={r.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.image_url && <img src={r.image_url} alt="" className="h-32 w-full object-cover" />}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2"><p className="font-bold">{r.title}</p>{r.won && <Badge tone="green">فزت! 🎉</Badge>}</div>
                  <p className="text-sm text-accent-600">الجائزة: {r.prize}</p>
                  <p className="mt-1 text-xs text-ink-muted">{r.status === 'drawn' ? 'تم السحب' : `ينتهي ${formatDate(r.ends_at)}`} · {r.entries} مشارك</p>
                  {r.status === 'open' && (
                    <Button size="sm" className="mt-3" disabled={r.entered || c.balance < r.entry_cost} loading={busy === `f${r.id}`}
                      onClick={() => run(`f${r.id}`, () => sb.rpc('enter_raffle', { p_raffle: r.id }), () => 'تم تسجيلك في السحب، بالتوفيق!')}>
                      {r.entered ? 'أنت مشترك ✓' : r.entry_cost ? `اشترك بـ ${r.entry_cost} نقطة` : 'اشترك مجانًا'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section icon={<Ticket />} title="كوبوناتي">
        {c.coupons.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {c.coupons.map((x) => (
              <div key={x.code} className={cn('flex items-center gap-3 rounded-2xl border border-dashed p-3', x.used || new Date(x.ends_at) < new Date() ? 'border-slate-200 opacity-50' : 'border-brand-300 bg-brand-50/40')}>
                <div className="flex-1"><p className="font-mono font-bold" dir="ltr">{x.code}</p><p className="text-xs text-ink-soft">{coupon(x.type, x.value)}{x.min_cart > 0 ? ` · فوق ${formatPrice(x.min_cart)}` : ''} · حتى {formatDate(x.ends_at)}</p></div>
                {!x.used && <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard?.writeText(x.code); toast.success('تم النسخ'); }}><Copy className="h-4 w-4" /></Button>}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-ink-muted">لا توجد كوبونات شخصية بعد.</p>}
      </Section>

      <Section icon={<Coins />} title="سجل النقاط">
        <div className="divide-y divide-slate-100 text-sm">
          {c.history.map((h, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-2.5">
              <div><p>{h.note ?? h.kind}</p><p className="text-xs text-ink-muted">{formatDate(h.at)}{h.status === 'pending' && h.available_at ? ` · تُفعّل ${formatDate(h.available_at)}` : ''}</p></div>
              <b className={h.amount > 0 ? (h.status === 'pending' ? 'text-amber-600' : 'text-emerald-600') : 'text-red-600'} dir="ltr">{h.amount > 0 ? '+' : ''}{formatNumber(h.amount)}</b>
            </div>
          ))}
          {!c.history.length && <p className="py-4 text-center text-ink-muted">لا توجد حركات بعد</p>}
        </div>
      </Section>

      <GiftModal gift={gift} onClose={() => setGift(null)} onDone={() => { setGift(null); reload(); refresh(); }} />
    </div>
  );
}

function GiftModal({ gift, onClose, onDone }: { gift: Center['gifts'][number] | null; onClose: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (!gift) return null;
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < gift.pick_count ? [...p, k] : p));
  return (
    <Modal open onClose={onClose} title={gift.title}>
      <p className="mb-3 text-sm text-ink-soft">اختر {gift.pick_count} من الهدايا التالية ({picked.length}/{gift.pick_count})</p>
      <div className="grid gap-2">
        {gift.options.map((o) => (
          <button key={o.key} onClick={() => toggle(o.key)} className={cn('rounded-xl p-3 text-right text-sm ring-2 transition', picked.includes(o.key) ? 'bg-brand-50 ring-brand-500' : 'ring-slate-200')}>
            <b>{o.title}</b><span className="block text-xs text-ink-muted">{o.type === 'points' ? `${o.value} نقطة` : o.type === 'coupon_percent' ? `كوبون ${o.value}%` : `كوبون ${formatPrice(o.value)}`}</span>
          </button>
        ))}
      </div>
      <Button className="mt-4 w-full" disabled={picked.length !== gift.pick_count} loading={busy} onClick={async () => {
        setBusy(true);
        const { error } = await getSupabase().rpc('claim_gifts', { p_campaign: gift.id, p_keys: picked });
        setBusy(false);
        if (error) return toast.error(errorMessage(error));
        toast.success('استلمت هداياك 🎁'); setPicked([]); onDone();
      }}>استلام الهدايا</Button>
    </Modal>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="tile p-4 md:p-5">
      <h2 className="mb-3 flex items-center gap-2 font-bold [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-brand-600">{icon}{title}</h2>
      {children}
    </section>
  );
}
