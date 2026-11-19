'use client';
import { use } from 'react';
import { PageHeader } from '@/components/dashboard/shell';
import { ProductForm } from '@/components/dashboard/product-form';
export default function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  return <div><PageHeader title="تعديل المنتج" /><ProductForm productId={use(params).id} /></div>;
}
