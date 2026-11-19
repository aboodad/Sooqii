import type { ProductCardData } from '@/lib/types';
import { ProductCard } from './product-card';

export function ProductGrid({ items, priorityCount = 0, storeSlug }: { items: ProductCardData[]; priorityCount?: number; storeSlug?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((p, i) => <ProductCard key={p.id} p={p} priority={i < priorityCount} storeSlug={storeSlug} />)}
    </div>
  );
}
