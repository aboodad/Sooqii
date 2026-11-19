import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/** أبعاد ملف الشعار المعتمد (640×391) — النسبة ثابتة */
const RATIO = 391 / 640;

/** الشعار المعتمد لسوقي. light: نسخة بيضاء للخلفيات الداكنة */
export function LogoImage({ height = 40, light, className, priority }: { height?: number; light?: boolean; className?: string; priority?: boolean }) {
  const width = Math.round(height / RATIO);
  return (
    <Image src={light ? '/brand/logo-light.png' : '/brand/logo.png'} alt="سوقي" width={width} height={height}
      priority={priority} className={cn('select-none', className)} style={{ height, width: 'auto' }} />
  );
}

export function Logo({ className, light, height = 44 }: { className?: string; light?: boolean; height?: number }) {
  return (
    <Link href="/" className={cn('flex shrink-0 items-center', className)} aria-label="سوقي — الرئيسية">
      <LogoImage height={height} light={light} priority />
    </Link>
  );
}

/** للتوافق مع الاستخدامات القديمة: علامة مربعة صغيرة */
export function LogoMark({ className, light }: { className?: string; light?: boolean }) {
  return <LogoImage height={36} light={light} className={className} />;
}
