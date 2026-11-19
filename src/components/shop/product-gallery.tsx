'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProductImage } from './product-image';
import { cn } from '@/lib/utils';

export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState({ x: 50, y: 50, on: false });
  const list = images.length ? images : [null];
  return (
    <div className="space-y-3 md:sticky md:top-24">
      <div
        className="card relative aspect-square overflow-hidden"
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100, on: e.pointerType === 'mouse' }); }}
        onPointerLeave={() => setZoom((z) => ({ ...z, on: false }))}
      >
        <AnimatePresence mode="wait">
          <motion.div key={i} className="absolute inset-0" initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
            style={{ transformOrigin: `${zoom.x}% ${zoom.y}%` }}>
            <div className="h-full w-full transition-transform duration-200" style={{ transform: zoom.on ? 'scale(1.8)' : 'scale(1)', transformOrigin: `${zoom.x}% ${zoom.y}%` }}>
              <ProductImage src={list[i]} alt={name} priority sizes="(max-width:768px) 100vw, 50vw" />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {list.length > 1 && (
        <div className="flex gap-2">
          {list.map((src, k) => (
            <button key={k} onClick={() => setI(k)} className={cn('relative h-20 w-20 overflow-hidden rounded-2xl ring-2 transition', k === i ? 'ring-brand-500' : 'ring-transparent opacity-70 hover:opacity-100')}>
              <ProductImage src={src} alt="" sizes="80px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
