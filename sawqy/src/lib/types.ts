export type ProductCardData = {
  id: string; slug: string; name: string; image: string | null;
  price: number; original_price: number | null; discount_percent: number | null;
  rating: number; rating_count: number; in_stock: boolean; offer_id: string;
};
export type SearchResult = { items: ProductCardData[]; total: number };

export type Offer = {
  offer_id: string; price: number; original_price: number | null; discount_percent: number | null;
  in_stock: boolean; available: number; prep_hours: number;
  store: { name: string; slug: string; logo: string | null; rating: number; rating_count: number };
};
export type ProductDetail = {
  id: string; slug: string; name: string; description: string | null; specs: Record<string, string>;
  rating: number; rating_count: number; status: string;
  category: { id: number; name: string; slug: string } | null;
  brand: { id: number; name: string; slug: string } | null;
  images: string[];
  variants: { id: string; name: string; attributes: Record<string, string>; offers: Offer[] }[];
};

export type CartItem = {
  offer_id: string; product_id: string; name: string; slug: string; variant: string | null; image: string | null;
  store_id: string; store_name: string; store_slug: string; qty: number; unit_price: number; unit_discount: number;
  unit_final: number; line_total: number; coupon_share: number; available: number; ok: boolean; issue: string | null;
};
export type CartStore = {
  store_id: string; name: string; slug: string; subtotal: number; store_coupon: number; platform_coupon: number;
  shipping: number; total: number; eta_min: number; eta_max: number; item_count: number; any_ok: boolean;
};
export type CartData = {
  items: CartItem[]; stores: CartStore[];
  totals: { original_subtotal: number; merchant_discount: number; subtotal: number; coupon_discount: number; shipping: number; grand_total: number };
  coupon: { code: string; valid: boolean; message: string } | null;
  count: number; has_issues: boolean; free_shipping_min: number;
};

export type Category = { id: number; parent_id: number | null; name_ar: string; slug: string; icon: string; color: string; sort: number };

export type MyContext = {
  profile: { id: string; full_name: string | null; phone: string | null; avatar_url: string | null; status: string };
  roles: string[];
  stores: { id: string; name: string; slug: string; status: string; logo_url: string | null; role: string; permissions: string[] }[];
  mfa: { aal: string | null; enrolled: boolean };
  unread: number;
} | null;

export type Address = {
  id: string; label: string; recipient_name: string; phone: string; city_id: number;
  district: string | null; street: string | null; details: string | null; is_default: boolean;
  cities?: { name_ar: string; governorates: { name_ar: string } | null } | null;
};

// ---------- الاستوري ----------
export type StoryItem = {
  id: string; media_url: string; media_type: 'image' | 'video'; caption: string | null;
  duration_ms: number; created_at: string; seen: boolean;
  product: { slug: string; name: string } | null;
};
export type StoryGroup = {
  store: { id: string; name: string; slug: string; logo_url: string | null };
  latest: string; all_seen: boolean; stories: StoryItem[];
};
