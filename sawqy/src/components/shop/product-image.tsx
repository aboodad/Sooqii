'use client';
import Image from 'next/image';
import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/** صورة منتج مع بديل أنيق عند فشل التحميل */
export function ProductImage({ src, alt, className, sizes, priority }: { src: string | null; alt: string; className?: string; sizes?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={cn('grid h-full w-full place-items-center bg-gradient-to-br from-brand-50 via-white to-orange-50', className)}>
        <ImageOff className="h-8 w-8 text-brand-300" />
      </div>
    );
  }
  return (
    <Image src={src} alt={alt} fill sizes={sizes ?? '(max-width:768px) 50vw, 25vw'} priority={priority}
      className={cn('object-cover', className)} onError={() => setFailed(true)} />
  );
}
