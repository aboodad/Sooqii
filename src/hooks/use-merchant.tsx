'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from './use-session';

type Store = NonNullable<ReturnType<typeof useSession>['ctx']>['stores'][number];
type Value = { store: Store | null; stores: Store[]; setStoreId: (id: string) => void; can: (perm: string) => boolean };
const Ctx = createContext<Value | null>(null);
const KEY = 'sawqy-merchant-store';

export function MerchantProvider({ children }: { children: React.ReactNode }) {
  const { ctx } = useSession();
  const stores = useMemo(() => ctx?.stores ?? [], [ctx]);
  const [storeId, setStoreIdState] = useState<string | null>(null);
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* تخزين غير متاح */ }
    setStoreIdState(stores.find((s) => s.id === saved)?.id ?? stores[0]?.id ?? null);
  }, [stores]);
  const store = stores.find((s) => s.id === storeId) ?? null;
  const value = useMemo<Value>(() => ({
    store, stores,
    setStoreId: (id) => { setStoreIdState(id); try { localStorage.setItem(KEY, id); } catch { /* */ } },
    // إخفاء الأزرار لتحسين التجربة فقط؛ الصلاحية تُفرض في الخادم
    can: (perm) => !!store && (['owner', 'manager'].includes(store.role) || store.permissions.includes(perm)),
  }), [store, stores]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useMerchant() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMerchant outside provider');
  return v;
}
