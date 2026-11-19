'use client';
import { use } from 'react';
import { TicketThread } from '@/components/support/ticket-thread';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <TicketThread id={use(params).id} staff />;
}
