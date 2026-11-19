import type { Sb } from '@/lib/supabase/types';
import type { CartData } from '@/lib/types';

export async function fetchCart(sb: Sb, coupon?: string | null, addressId?: string | null, delivery: 'delivery' | 'pickup' = 'delivery', points = 0) {
  const { data, error } = await sb.rpc('get_cart', { p_coupon: coupon || null, p_address: addressId || null, p_delivery: delivery, p_points: points });
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
export type PlaceOrderArgs = {
  addressId: string; coupon?: string | null; notes?: string; key: string;
  payment: string; delivery: 'delivery' | 'pickup'; pickup?: number | null; points?: number; currency?: string;
};
export type PlaceOrderResult = {
  order_id: string; order_no: string; invoice_no?: string; payment?: string; grand_total?: number;
  currency?: string; fx_rate?: number; due_at?: string | null; duplicate: boolean;
};
export async function placeOrder(sb: Sb, a: PlaceOrderArgs) {
  const { data, error } = await sb.rpc('place_order', {
    p_address: a.addressId, p_coupon: a.coupon || null, p_notes: a.notes || null, p_idempotency: a.key,
    p_payment: a.payment, p_delivery: a.delivery, p_pickup: a.pickup ?? null, p_points: a.points ?? 0, p_currency: a.currency || 'YER',
  });
  if (error) throw error;
  return data as PlaceOrderResult;
}
