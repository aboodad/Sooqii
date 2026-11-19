import { Header } from '@/components/shop/header';
import { BottomNav } from '@/components/shop/bottom-nav';
import { CartFloat } from '@/components/shop/cart-float';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {/* بدون تذييل؛ مسافة سفلية لشريط التنقل في الجوال */}
      <main className="min-h-[60vh] pb-28 md:pb-12">{children}</main>
      <CartFloat />
      <BottomNav />
    </>
  );
}
