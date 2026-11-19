import { Suspense } from 'react';
import { SearchX } from 'lucide-react';
import type { SearchResult } from '@/lib/types';
import { ProductGrid } from './product-grid';
import { Filters } from './filters';
import { Pagination } from './pagination';
import { EmptyState } from '@/components/ui/misc';

export function CatalogResults({ result, page, perPage, base, params, storeSlug }: {
  result: SearchResult; page: number; perPage: number; base: string; params: Record<string, string | undefined>; storeSlug?: string;
}) {
  return (
    <>
      <Suspense><Filters total={result.total} /></Suspense>
      {result.items.length ? (
        <>
          <ProductGrid items={result.items} priorityCount={4} storeSlug={storeSlug} />
          <Pagination total={result.total} page={page} perPage={perPage} base={base} params={params} />
        </>
      ) : (
        <EmptyState icon={<SearchX />} title="لا توجد نتائج" text="جرّب كلمات أخرى أو أزل بعض عوامل التصفية." />
      )}
    </>
  );
}
