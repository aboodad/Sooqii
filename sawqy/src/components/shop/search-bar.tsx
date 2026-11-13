'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SearchBar({ className, store }: { className?: string; store?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  return (
    <form
      role="search"
      className={cn('group relative', className)}
      onSubmit={(e) => {
        e.preventDefault();
        const term = q.trim().slice(0, 120);
        router.push(store ? `/s/${store}?q=${encodeURIComponent(term)}` : `/search?q=${encodeURIComponent(term)}`);
      }}
    >
      <input
        value={q} onChange={(e) => setQ(e.target.value)} maxLength={120} enterKeyHint="search"
        placeholder={store ? 'ابحث داخل هذا المتجر' : 'ابحث عن منتج أو متجر أو ماركة'}
        className="h-12 w-full rounded-2xl border border-transparent bg-mist pr-11 pl-20 text-sm text-ink transition placeholder:text-ink-muted focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/10"
        aria-label="بحث"
      />
      <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted transition group-focus-within:text-brand-500" />
      <button className="absolute left-1.5 top-1.5 h-9 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white transition hover:bg-brand-600">
        بحث
      </button>
    </form>
  );
}
