'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { setCartItem } from '@/lib/api/cart';
import { useCartStore, type GuestItem } from '@/stores/cart-store';
import { useSession } from '@/hooks/use-session';
import { errorMessage } from '@/lib/utils';

export function useAddToCart() {
  const { user } = useSession();
  const [busy, setBusy] = useState(false);
  const { addGuest, setCount, bump } = useCartStore();

  async function add(item: GuestItem) {
    setBusy(true);
    try {
      if (user) {
        const sb = getSupabase();
        const { data: existing } = await sb.from('cart_items').select('qty').eq('offer_id', item.offer_id).maybeSingle();
        const n = await setCartItem(sb, item.offer_id, Math.min(99, (existing?.qty ?? 0) + item.qty));
        setCount(n);
      } else {
        addGuest(item);
      }
      bump();
      toast.success('أُضيف إلى السلة', { description: item.name });
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { add, busy };
}
