import { PageHeader } from '@/components/dashboard/shell';
import { CouponManager } from '@/components/dashboard/coupon-manager';
export default function AdminPromotions() {
  return <div><PageHeader title="كوبونات المنصة" subtitle="كوبون واحد للسلة متعددة المتاجر، يُوزَّع خصمه على العناصر وتتحمله المنصة (لا يُخصم من مستحقات التاجر)" /><CouponManager /></div>;
}
