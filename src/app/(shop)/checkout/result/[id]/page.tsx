import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Clock, MessageCircle, Package } from 'lucide-react';
import { getServerSupabase } from '@/lib/supabase/server';
import { formatDate, formatPrice } from '@/lib/format';
import { PAYMENT_CHANNEL } from '@/lib/status';
import { paymentWhatsAppLink } from '@/lib/whatsapp';

export const metadata = { robots: { index: false } };

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const [{ data: order }, { data: rows }] = await Promise.all([
    sb.from('orders').select('id,order_no,grand_total,status,payment_status,payment_channel,payment_due_at,fulfillment,sub_orders(id)').eq('id', id).maybeSingle(),
    sb.from('app_settings').select('key,value').in('key', ['public_whatsapp_number', 'public_payment_methods']),
  ]);
  if (!order) notFound();
  const set = Object.fromEntries((rows ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  const methods = (Array.isArray(set.public_payment_methods) ? set.public_payment_methods : []) as { key: string; account?: string }[];
  const awaiting = order.status === 'pending_payment' && order.payment_status === 'unpaid';
  const wa = awaiting ? paymentWhatsAppLink({
    number: String(set.public_whatsapp_number ?? ''), orderNo: order.order_no, total: Number(order.grand_total),
    channel: order.payment_channel, account: methods.find((m) => m.key === order.payment_channel)?.account,
  }) : null;
  const account = methods.find((m) => m.key === order.payment_channel)?.account;
  const n = order.sub_orders?.length ?? 1;

  return (
    <div className="container flex flex-col items-center py-12 text-center md:py-16">
      <div className="relative">
        <div className={`absolute inset-0 animate-ping rounded-full ${awaiting ? 'bg-amber-300/40' : 'bg-emerald-300/40'}`} />
        <div className={`relative grid h-24 w-24 place-items-center rounded-full text-white shadow-lift ${awaiting ? 'bg-gradient-to-br from-amber-400 to-accent-500' : 'bg-gradient-to-br from-emerald-400 to-emerald-600'}`}>
          {awaiting ? <Clock className="h-12 w-12" /> : <CheckCircle2 className="h-12 w-12" />}
        </div>
      </div>
      <h1 className="mt-8 text-2xl font-extrabold md:text-3xl">{awaiting ? 'تم حجز طلبك — بقي الدفع' : 'تم استلام طلبك بنجاح 🎉'}</h1>
      <p className="mt-3 text-ink-soft">رقم الطلب <b className="text-ink" dir="ltr">{order.order_no}</b> · الإجمالي <b className="text-ink">{formatPrice(order.grand_total)}</b></p>

      {awaiting ? (
        <div className="mt-6 w-full max-w-md rounded-3xl bg-white p-5 text-right shadow-soft ring-1 ring-slate-100">
          <p className="text-sm leading-7 text-ink-soft">
            حوّل المبلغ عبر <b className="text-ink">{PAYMENT_CHANNEL[order.payment_channel] ?? order.payment_channel}</b>
            {account ? <> إلى <b className="text-ink" dir="ltr">{account}</b></> : null}، ثم أرسل صورة الإشعار أو رقم العملية عبر واتساب.
          </p>
          {order.payment_due_at && <p className="mt-2 text-xs text-accent-600">يُلغى الطلب تلقائيًا إن لم يُؤكَّد الدفع قبل {formatDate(order.payment_due_at)}.</p>}
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-6 py-3.5 font-bold text-white shadow-lift">
              <MessageCircle className="h-5 w-5" /> إرسال إثبات الدفع عبر واتساب
            </a>
          ) : <p className="mt-4 rounded-xl bg-orange-50 p-3 text-xs text-orange-800">رقم واتساب الدفع غير مُعدّ بعد، تواصل مع خدمة العملاء.</p>}
        </div>
      ) : (
        <p className="mt-2 max-w-md text-sm text-ink-muted">
          {order.fulfillment === 'direct' && n > 1 ? `يصل طلبك في ${n} شحنات. ` : order.fulfillment !== 'direct' ? 'ستُجمع منتجاتك في طرد واحد. ' : ''}
          ستصلك إشعارات بكل تحديث. احتفظ برمز التسليم الظاهر في صفحة الطلب لتعطيه للمندوب.
        </p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={`/account/orders/${order.id}`} className="flex items-center gap-2 rounded-2xl bg-brand-500 px-6 py-3 font-bold text-white shadow-glow"><Package className="h-5 w-5" /> تتبّع الطلب</Link>
        <Link href="/" className="rounded-2xl bg-white px-6 py-3 font-bold ring-1 ring-slate-200">متابعة التسوق</Link>
      </div>
    </div>
  );
}
