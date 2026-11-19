import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Pagination({ total, page, perPage, base, params }: { total: number; page: number; perPage: number; base: string; params: Record<string, string | undefined> }) {
  const pages = Math.ceil(total / perPage);
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    if (p > 1) sp.set('page', String(p)); else sp.delete('page');
    return `${base}?${sp.toString()}`;
  };
  return (
    <nav className="mt-10 flex justify-center gap-1.5" aria-label="الصفحات">
      {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map((p) => (
        <Link key={p} href={href(p)} className={cn('grid h-10 w-10 place-items-center rounded-xl text-sm font-semibold transition', p === page ? 'bg-brand-500 text-white shadow-glow' : 'bg-white ring-1 ring-slate-200 hover:ring-brand-300')}>{p}</Link>
      ))}
    </nav>
  );
}
