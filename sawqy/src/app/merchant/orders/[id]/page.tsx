'use client';
import { use } from 'react';
import { SubOrderDetail } from '@/components/dashboard/sub-order-detail';
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <SubOrderDetail id={use(params).id} mode="merchant" />;
}
