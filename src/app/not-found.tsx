import Link from 'next/link';
import { LogoImage } from '@/components/shop/logo';

export default function NotFound() {
  return (
    <div className="mesh-bg flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6 [perspective:600px]">
        <span className="block animate-float text-[9rem] font-black leading-none text-gradient">404</span>
      </div>
      <LogoImage height={56} />
      <h1 className="mt-4 text-2xl font-extrabold">الصفحة غير موجودة</h1>
      <p className="mt-2 text-ink-soft">ربما نُقل المنتج أو أُرشف. جرّب البحث أو عد للرئيسية.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className="rounded-2xl bg-brand-500 px-6 py-3 font-bold text-white shadow-glow">الرئيسية</Link>
        <Link href="/search" className="rounded-2xl bg-white px-6 py-3 font-bold ring-1 ring-slate-200">البحث</Link>
      </div>
    </div>
  );
}
