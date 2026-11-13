import type { Sb } from '@/lib/supabase/types';
import type { CartData } from '@/lib/types';

export async function fetchCart(sb: Sb, coupon?: string | null, addressId?: string | null) {
  const { data, error } = await sb.rpc('get_cart', { p_coupon: coupon || null, p_address: addressId || null });
  if (error) throw error;
  return data as CartData;
}
export async function setCartItem(sb: Sb, offerId: string, qty: number): Promise<number> {
  const { data, error } = await sb.rpc('cart_set_item', { p_offer: offerId, p_qty: qty });
  if (error) throw error;
  return data as number;
}
export async function mergeCart(sb: Sb, items: { offer_id: string; qty: number }[]) {
  const { data, error } = await sb.rpc('cart_merge', { p_items: items });
  if (error) throw error;
  return data as number;
}
export async function placeOrder(sb: Sb, args: { addressId: string; coupon?: string | null; notes?: string; key: string }) {
  const { data, error } = await sb.rpc('place_order', {
    p_address: args.addressId, p_coupon: args.coupon || null, p_notes: args.notes || null, p_idempotency: args.key,
  });
  if (error) throw error;
  return data as { order_id: string; order_no: string };
}
