import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2, Package } from 'lucide-react';
import { getServerSupabase } from '@/lib/supabase/server';
import { formatPrice } from '@/lib/format';

export const metadata = { robots: { index: false } };

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getServerSupabase();
  const { data: order } = await sb.from('orders').select('id,order_no,grand_total,sub_orders(id)').eq('id', id).maybeSingle();
  if (!order) notFound();
  return (
    <div className="container flex flex-col items-center py-16 text-center">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-emerald-300/40" />
        <div className="relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lift"><CheckCircle2 className="h-12 w-12" /></div>
      </div>
      <h1 className="mt-8 text-3xl font-extrabold">تم استلام طلبك بنجاح 🎉</h1>
      <p className="mt-3 text-ink-soft">رقم الطلب <b className="text-ink" dir="ltr">{order.order_no}</b> · الإجمالي <b className="text-ink">{formatPrice(order.grand_total)}</b></p>
      <p className="mt-2 max-w-md text-sm text-ink-muted">قُسّم طلبك إلى {order.sub_orders?.length ?? 1} شحنة حسب المتجر، وستصلك إشعارات بكل تحديث. احتفظ برمز التسليم الظاهر في صفحة الطلب لتعطيه للمندوب.</p>
      <div className="mt-8 flex gap-3">
        <Link href={`/account/orders/${order.id}`} className="flex items-center gap-2 rounded-2xl bg-brand-500 px-6 py-3 font-bold text-white shadow-glow"><Package className="h-5 w-5" /> تتبّع الطلب</Link>
        <Link href="/" className="rounded-2xl bg-white px-6 py-3 font-bold ring-1 ring-slate-200">متابعة التسوق</Link>
      </div>
    </div>
  );
}
