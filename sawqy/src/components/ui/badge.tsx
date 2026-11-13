import { cn } from '@/lib/utils';

const tones = {
  gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  teal: 'bg-brand-50 text-brand-700 ring-brand-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
} as const;

export function Badge({ tone = 'gray', className, children, dot }: {
  tone?: keyof typeof tones; className?: string; children: React.ReactNode; dot?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: keyof typeof tones }>; value: string }) {
  const m = map[value] ?? { label: value, tone: 'gray' as const };
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}
