import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg' | 'icon';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600',
  accent: 'bg-accent-500 text-white hover:bg-accent-600',
  outline: 'border border-line bg-white text-ink hover:border-brand-500 hover:text-brand-600',
  ghost: 'text-ink-soft hover:bg-mist hover:text-ink',
  danger: 'bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm rounded-xl gap-1.5',
  md: 'h-11 px-5 text-sm rounded-xl gap-2',
  lg: 'h-13 px-7 py-3.5 text-base rounded-2xl gap-2',
  icon: 'h-10 w-10 rounded-xl',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: Size; loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition-all duration-200 active:scale-[.97]',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant], sizes[size], className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});
