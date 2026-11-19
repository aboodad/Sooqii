'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[sawqy]', error.digest ?? ''); }, [error]); // لا نعرض تفاصيل الخطأ للمستخدم
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-500"><AlertTriangle className="h-8 w-8" /></div>
      <h1 className="mt-4 text-xl font-bold">حدث خطأ غير متوقع</h1>
      <p className="mt-1 text-sm text-ink-soft">نعتذر عن ذلك. حاول مرة أخرى.{error.digest && <span className="block text-xs text-ink-muted" dir="ltr">ref: {error.digest}</span>}</p>
      <button onClick={reset} className="mt-5 rounded-xl bg-brand-500 px-5 py-2.5 font-semibold text-white">إعادة المحاولة</button>
    </div>
  );
}
