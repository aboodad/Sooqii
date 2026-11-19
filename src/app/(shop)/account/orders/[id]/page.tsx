'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { Check, Clock, FileText, KeyRound, LifeBuoy, MapPin, MessageCircle, Package, RotateCcw, Star, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { formatDate, formatPrice } from '@/lib/format';
import { FULFILLMENT_LABEL, HUB_TIMELINE, ORDER_STATUS, PAYMENT_CHANNEL, PAYMENT_STATUS, SUB_STATUS, SUB_TIMELINE } from '@/lib/status';
import { usePublicSettings } from '@/hooks/use-settings';
import { paymentWhatsAppLink } from '@/lib/whatsapp';
import { errorMessage, cn } from '@/lib/utils';
import { StatusBadge } from '@/components/ui/badge';
import { Modal, Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';

type Item = { id: string; product_name: string; variant_name: string | null; image_url: string | null; qty: number; line_total: number; unit_price: number; product_id: string };
type Sub = { id: string; sub_no: string; status: string; subtotal: number; shipping_fee: number; total: number; cancel_reason: string | null; delivered_at: string | null;
  order_items: Item[]; delivery_codes: { code: string } | null;
  order_status_history: { to_status: string; created_at: string; reason: string | null }[] };

export default function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const sb = getSupabase();
  const [review, setReview] = useState<Item | null>(null);
  const [ret, setRet] = useState<Item | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const { settings } = usePublicSettings();

  const { data, loading, reload } = useQuery(async () => {
    const { data: order, error } = await sb.from('orders')
      .select('*, order_delivery_codes(code), sub_orders(id,sub_no,status,subtotal,shipping_fee,total,cancel_reason,delivered_at, order_items(id,product_name,variant_name,image_url,qty,line_total,unit_price,product_id), delivery_codes(code), order_status_history(to_status,created_at,reason))')
      .eq('id', id).single();
    if (error) throw error;
    const itemIds = (order.sub_orders as Sub[]).flatMap((s) => s.order_items.map((i) => i.id));
    const [{ data: reviews }, { data: returns }] = await Promise.all([
      sb.from('reviews').select('order_item_id,rating').in('order_item_id', itemIds),
      sb.from('returns').select('order_item_id,status').in('order_item_id', itemIds),
    ]);
    return { order, reviews: reviews ?? [], returns: returns ?? [] };
  }, [id]);

  if (loading) return <Skeleton className="h-96" />;
  if (!data) return <p className="tile p-4 md:p-6">الطلب غير موجود</p>;
  const { order, reviews, returns } = data;
  const subs = (order.sub_orders as Sub[]).sort((a, b) => a.sub_no.localeCompare(b.sub_no));
  const canCancel = subs.some((s) => ['awaiting_payment', 'pending_merchant', 'accepted'].includes(s.status));
  const addr = order.address_snapshot as Record<string, string>;
  const viaHub = order.fulfillment !== 'direct';
  const TL = viaHub ? HUB_TIMELINE : SUB_TIMELINE;
  const orderCode = (order.order_delivery_codes as { code: string } | null)?.code;
  const awaiting = order.status === 'pending_payment' && order.payment_status === 'unpaid';
  const method = settings.payment_methods.find((m) => m.key === order.payment_channel);
  const wa = awaiting ? paymentWhatsAppLink({ number: settings.whatsapp_number, orderNo: order.order_no, total: Number(order.grand_total), channel: order.payment_channel, account: method?.account }) : null;

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center gap-3 p-5">
        <div className="flex-1">
          <h1 className="text-xl font-semibold md:text-2xl" dir="ltr">{order.order_no}</h1>
          <p className="mt-1 text-sm text-ink-muted">{formatDate(order.created_at)}</p>
        </div>
        <StatusBadge map={ORDER_STATUS} value={order.status} />
        <StatusBadge map={PAYMENT_STATUS} value={order.payment_status} />
        <Link href={`/account/orders/${order.id}/invoice`}><Button variant="outline" size="sm"><FileText className="h-4 w-4" /> الفاتورة</Button></Link>
        <Link href={`/account/support?order=${order.id}`}><Button variant="ghost" size="sm"><LifeBuoy className="h-4 w-4" /> مساعدة</Button></Link>
        {canCancel && <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)}><XCircle className="h-4 w-4" /> إلغاء الطلب</Button>}
      </div>

      {awaiting && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 font-bold text-amber-900"><Clock className="h-5 w-5" /> بانتظار تأكيد الدفع</p>
          <p className="mt-1 text-sm leading-6 text-amber-900/80">
            حوّل {formatPrice(order.grand_total)} عبر {PAYMENT_CHANNEL[order.payment_channel] ?? order.payment_channel}{method?.account ? <> إلى <b dir="ltr">{method.account}</b></> : null} ثم أرسل الإشعار عبر واتساب.
            {order.payment_due_at && <> المهلة حتى {formatDate(order.payment_due_at)}.</>}
          </p>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" /> إرسال إثبات الدفع</a>}
        </div>
      )}

      {viaHub && orderCode && ['out_for_delivery', 'packed', 'in_progress', 'confirmed'].includes(order.status) && (
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-l from-accent-500 to-accent-400 p-4 text-white shadow-glow-orange">
          <KeyRound className="h-6 w-6" />
          <div className="flex-1"><p className="text-sm font-semibold">رمز استلام الطرد — {order.fulfillment === 'pickup' ? 'أظهره في نقطة الاستلام' : 'أعطه للمندوب عند الاستلام فقط'}</p></div>
          <span className="rounded-xl bg-white/20 px-4 py-2 text-2xl font-black tracking-[.3em]" dir="ltr">{orderCode}</span>
        </div>
      )}

      <p className="flex items-center gap-2 rounded-2xl bg-sky-50 p-4 text-sm text-sky-800 ring-1 ring-sky-100">
        <Truck className="h-4 w-4 shrink-0" />
        {viaHub ? `${FULFILLMENT_LABEL[order.fulfillment]} — تُجمع كل منتجاتك في طرد واحد${order.box_code ? ` (${order.box_code})` : ''}.`
          : subs.length > 1 ? `طلبك يصل في ${subs.length} شحنات، وقد تصل كل شحنة في وقت مختلف.` : 'طلبك يصل في شحنة واحدة.'}
      </p>

      {subs.map((s, sIdx) => {
        const idx = TL.indexOf(s.status);
        const off = ['cancelled', 'delivery_failed', 'return_in_progress', 'returned'].includes(s.status);
        return (
          <div key={s.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-gradient-to-l from-brand-50 to-white px-5 py-3">
              <span className="flex items-center gap-2 font-bold"><Package className="h-4 w-4 text-brand-600" />{subs.length > 1 ? `الشحنة ${sIdx + 1}` : 'محتويات الطلب'}</span>
              <div className="flex items-center gap-2"><span className="text-xs text-ink-muted" dir="ltr">{s.sub_no}</span><StatusBadge map={SUB_STATUS} value={s.status} /></div>
            </div>
            <div className="p-5">
              {!off ? (
                <ol className="mb-5 flex items-center">
                  {TL.map((st, k) => (
                    <li key={st} className="flex flex-1 items-center last:flex-none">
                      <span title={SUB_STATUS[st].label} className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold transition',
                        k <= idx ? 'bg-brand-500 text-white shadow-glow' : 'bg-slate-100 text-ink-muted', k === idx && 'ring-4 ring-brand-200')}>
                        {k < idx ? <Check className="h-3.5 w-3.5" /> : k + 1}
                      </span>
                      {k < TL.length - 1 && <span className={cn('h-1 flex-1 rounded-full', k < idx ? 'bg-brand-500' : 'bg-slate-100')} />}
                    </li>
                  ))}
                </ol>
              ) : s.cancel_reason ? <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">السبب: {s.cancel_reason}</p> : null}
              <p className="mb-4 text-sm font-semibold text-brand-700">{SUB_STATUS[s.status]?.label}</p>

              {!viaHub && s.delivery_codes && ['handed_over', 'in_transit', 'ready'].includes(s.status) && (
                <div className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-l from-accent-500 to-accent-400 p-4 text-white shadow-glow-orange">
                  <KeyRound className="h-6 w-6" />
                  <div className="flex-1"><p className="text-sm font-semibold">رمز التسليم — أعطه للمندوب عند الاستلام فقط</p></div>
                  <span className="rounded-xl bg-white/20 px-4 py-2 text-2xl font-black tracking-[.3em]" dir="ltr">{s.delivery_codes.code}</span>
                </div>
              )}

              <div className="divide-y divide-slate-100">
                {s.order_items.map((it) => {
                  const rv = reviews.find((r) => r.order_item_id === it.id);
                  const rt = returns.find((r) => r.order_item_id === it.id);
                  return (
                    <div key={it.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="h-16 w-16 overflow-hidden rounded-xl bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {it.image_url && <img src={it.image_url} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">{it.product_name}</p>
                        <p className="text-xs text-ink-muted">{it.variant_name ? `${it.variant_name} · ` : ''}الكمية {it.qty}</p>
                      </div>
                      <b className="text-sm">{formatPrice(it.line_total)}</b>
                      {s.status === 'delivered' && (
                        <div className="flex w-full gap-2 sm:w-auto">
                          <Button size="sm" variant="soft" onClick={() => setReview(it)}><Star className="h-4 w-4" /> {rv ? 'تعديل التقييم' : 'قيّم'}</Button>
                          {!rt ? <Button size="sm" variant="outline" onClick={() => setRet(it)}><RotateCcw className="h-4 w-4" /> إرجاع</Button>
                            : <span className="self-center text-xs text-ink-muted">طلب إرجاع مُرسل</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex justify-end gap-6 border-t border-slate-100 pt-3 text-sm">
                <span className="text-ink-soft">الشحن: <b className="text-ink">{s.shipping_fee > 0 ? formatPrice(s.shipping_fee) : 'مجاني'}</b></span>
                <span className="text-ink-soft">الإجمالي: <b className="text-ink">{formatPrice(s.total)}</b></span>
              </div>
            </div>
          </div>
        );
      })}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h3 className="mb-2 flex items-center gap-2 font-bold"><MapPin className="h-4 w-4 text-brand-600" /> عنوان التوصيل</h3>
          <p className="text-sm text-ink-soft">{addr.recipient_name} · <span dir="ltr">{addr.phone}</span></p>
          <p className="text-sm text-ink-soft">{[addr.governorate, addr.city, addr.district, addr.street, addr.details].filter(Boolean).join('، ')}</p>
        </div>
        <div className="card space-y-1.5 p-5 text-sm">
          <div className="flex justify-between"><span className="text-ink-soft">المنتجات</span><b>{formatPrice(order.subtotal)}</b></div>
          {order.discount_total > 0 && <div className="flex justify-between"><span className="text-ink-soft">الخصومات</span><b className="text-emerald-600">- {formatPrice(order.discount_total)}</b></div>}
          <div className="flex justify-between"><span className="text-ink-soft">الشحن</span><b>{formatPrice(order.shipping_total)}</b></div>
          <div className="flex justify-between"><span className="text-ink-soft">طريقة الدفع</span><b>{PAYMENT_CHANNEL[order.payment_channel] ?? order.payment_channel}</b></div>
          <div className="flex justify-between border-t border-slate-100 pt-2 text-base"><span className="font-bold">الإجمالي</span><b className="text-brand-700">{formatPrice(order.grand_total)}</b></div>
        </div>
      </div>

      <CancelModal open={cancelOpen} onClose={() => setCancelOpen(false)} orderId={order.id} onDone={reload} />
      <ReviewModal item={review} onClose={() => setReview(null)} onDone={reload} />
      <ReturnModal item={ret} onClose={() => setRet(null)} onDone={reload} />
    </div>
  );
}

function CancelModal({ open, onClose, orderId, onDone }: { open: boolean; onClose: () => void; orderId: string; onDone: () => void }) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="إلغاء الطلب">
      <p className="mb-3 text-sm text-ink-soft">سيتم إلغاء الشحنات التي لم يبدأ تجهيزها فقط.</p>
      <Textarea placeholder="سبب الإلغاء (اختياري)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
      <Button variant="danger" className="mt-4 w-full" loading={busy} onClick={async () => {
        setBusy(true);
        const { error } = await getSupabase().rpc('cancel_order', { p_order: orderId, p_reason: reason || 'إلغاء من العميل' });
        setBusy(false);
        if (error) return toast.error(errorMessage(error));
        toast.success('تم الإلغاء'); onClose(); onDone();
      }}>تأكيد الإلغاء</Button>
    </Modal>
  );
}

function ReviewModal({ item, onClose, onDone }: { item: Item | null; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = useState(5); const [comment, setComment] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <Modal open={!!item} onClose={onClose} title="قيّم المنتج">
      <p className="mb-3 text-sm font-semibold">{item?.product_name}</p>
      <div className="mb-4 flex justify-center gap-2" dir="ltr">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} onClick={() => setRating(i)} aria-label={`${i} نجوم`} className="transition hover:scale-125">
            <Star className={cn('h-9 w-9', i <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
          </button>
        ))}
      </div>
      <Textarea placeholder="شاركنا رأيك (اختياري)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      <Button className="mt-4 w-full" loading={busy} onClick={async () => {
        setBusy(true);
        const { error } = await getSupabase().rpc('submit_review', { p_item: item!.id, p_rating: rating, p_comment: comment });
        setBusy(false);
        if (error) return toast.error(errorMessage(error));
        toast.success('شكرًا لتقييمك'); onClose(); onDone();
      }}>إرسال التقييم</Button>
    </Modal>
  );
}

function ReturnModal({ item, onClose, onDone }: { item: Item | null; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState(1); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <Modal open={!!item} onClose={onClose} title="طلب إرجاع">
      <p className="mb-3 text-sm font-semibold">{item?.product_name}</p>
      <div className="space-y-3">
        <Field label="الكمية"><Input type="number" min={1} max={item?.qty} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(item?.qty ?? 1, Number(e.target.value))))} /></Field>
        <Field label="سبب الإرجاع"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="مثال: المنتج مختلف عن الوصف" /></Field>
      </div>
      <Button className="mt-4 w-full" loading={busy} onClick={async () => {
        if (reason.trim().length < 3) return toast.error('اكتب سبب الإرجاع');
        setBusy(true);
        const { error } = await getSupabase().rpc('request_return', { p_item: item!.id, p_qty: qty, p_reason: reason });
        setBusy(false);
        if (error) return toast.error(errorMessage(error));
        toast.success('تم إرسال طلب الإرجاع'); onClose(); onDone();
      }}>إرسال الطلب</Button>
    </Modal>
  );
}
