'use client';
import { Toaster } from 'sonner';
import { SessionProvider } from '@/hooks/use-session';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster position="top-center" dir="rtl" richColors closeButton toastOptions={{ style: { fontFamily: 'var(--font-tajawal)' } }} />
    </SessionProvider>
  );
}
