import { PageHeader } from '@/components/dashboard/shell';
import { ProductForm } from '@/components/dashboard/product-form';
export default function NewProduct() {
  return <div><PageHeader title="إضافة منتج" subtitle="أضف عرضك على منتج موجود أو أنشئ منتجًا جديدًا" /><ProductForm /></div>;
}
