'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type GuestItem = { offer_id: string; qty: number; name: string; image: string | null; price: number; slug: string };

type CartState = {
  count: number;              // عدد القطع (للحساب المسجل يأتي من الخادم)
  guest: GuestItem[];         // سلة الزائر محليًا حتى تسجيل الدخول
  pulse: number;              // لتحريك أيقونة السلة
  setCount: (n: number) => void;
  bump: () => void;
  addGuest: (item: GuestItem) => void;
  setGuestQty: (offerId: string, qty: number) => void;
  clearGuest: () => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      count: 0, guest: [], pulse: 0,
      setCount: (n) => set({ count: n }),
      bump: () => set({ pulse: get().pulse + 1 }),
      addGuest: (item) => {
        const guest = [...get().guest];
        const i = guest.findIndex((g) => g.offer_id === item.offer_id);
        if (i >= 0) guest[i] = { ...guest[i], qty: Math.min(99, guest[i].qty + item.qty) };
        else if (guest.length < 50) guest.push(item);
        set({ guest, count: guest.reduce((s, g) => s + g.qty, 0) });
      },
      setGuestQty: (offerId, qty) => {
        const guest = get().guest.map((g) => (g.offer_id === offerId ? { ...g, qty } : g)).filter((g) => g.qty > 0);
        set({ guest, count: guest.reduce((s, g) => s + g.qty, 0) });
      },
      clearGuest: () => set({ guest: [] }),
    }),
    {
      name: 'sawqy-cart',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ guest: s.guest }),
    },
  ),
);
