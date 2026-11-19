'use client';
import { use } from 'react';
import { TicketThread } from '@/components/support/ticket-thread';

export default function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TicketThread id={id} />;
}
