import Image from 'next/image';
import { Logo } from '@/components/shop/logo';
import { art } from '@/lib/category-art';

/** تخطيط صفحات الدخول (النموذج الثالث): النموذج في جهة، ولوحة فيروزية برسومات المنصة في الأخرى */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2">
      <div className="flex flex-col px-5 pb-10 pt-6 md:px-14 lg:px-20 xl:px-28">
        <Logo height={50} />
        {/* لوحة مصغّرة للجوال */}
        <div className="relative mt-6 h-40 overflow-hidden rounded-[28px] bg-brand-500 lg:hidden">
          <span className="absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10" />
          <Image src={art('shopping-bags')} alt="" width={128} height={128} priority className="absolute left-1/2 top-1/2 w-28 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_16px_16px_rgba(0,40,40,.3)]" />
          <Image src={art('honey-pot')} alt="" width={64} height={64} className="absolute right-6 top-5 w-14 -rotate-12" />
          <Image src={art('headphone')} alt="" width={64} height={64} className="absolute left-6 top-6 w-14 rotate-12" />
          <Image src={art('running-shoe')} alt="" width={64} height={64} className="absolute bottom-4 right-10 w-16 -rotate-12" />
          <Image src={art('dress')} alt="" width={64} height={64} className="absolute bottom-4 left-10 w-12" />
        </div>
        <div className="auth-form mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-8 lg:py-10">{children}</div>
      </div>

      <div className="relative hidden overflow-hidden bg-brand-500 lg:block">
        <span className="absolute left-1/2 top-[38%] h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10" />
        <span className="absolute left-1/2 top-[38%] h-[400px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10" />
        <Image src={art('shopping-bags')} alt="" width={256} height={256} priority className="absolute left-1/2 top-[38%] w-60 -translate-x-1/2 -translate-y-1/2 drop-shadow-[0_26px_26px_rgba(0,40,40,.35)]" />
        <Image src={art('honey-pot')} alt="" width={160} height={160} className="absolute right-[12%] top-[12%] w-32 -rotate-12 drop-shadow-[0_18px_18px_rgba(0,40,40,.3)]" />
        <Image src={art('headphone')} alt="" width={160} height={160} className="absolute left-[12%] top-[10%] w-32 rotate-12 drop-shadow-[0_18px_18px_rgba(0,40,40,.3)]" />
        <Image src={art('running-shoe')} alt="" width={160} height={160} className="absolute right-[10%] top-[52%] w-36 -rotate-12 drop-shadow-[0_18px_18px_rgba(0,40,40,.3)]" />
        <Image src={art('dress')} alt="" width={160} height={160} className="absolute left-[14%] top-[54%] w-28 drop-shadow-[0_18px_18px_rgba(0,40,40,.3)]" />
        <div className="absolute left-[24%] top-[64%] rounded-2xl bg-white px-4 py-3 text-xs text-ink-soft shadow-lift">
          سلتك المحفوظة<span className="block text-sm font-semibold text-ink">منتجات من أكثر من متجر</span>
        </div>
        <div className="absolute inset-x-16 bottom-16 text-white">
          <h2 className="text-4xl font-bold leading-snug">حساب واحد، وكل متاجر اليمن</h2>
          <p className="mt-3 text-lg leading-8 text-white/80">تابع حالات متاجرك المفضلة، واطلب من أكثر من متجر، وادفع عند الاستلام.</p>
        </div>
      </div>
    </div>
  );
}
