'use client';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useQuery } from '@/hooks/use-query';
import { timeAgo } from '@/lib/format';
import { TICKET_CATEGORY, TICKET_STATUS } from '@/lib/status';
import { errorMessage } from '@/lib/utils';
import { PageHeader } from '@/components/dashboard/shell';
import { Table, Td, Tabs } from '@/components/dashboard/widgets';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';

export default function SupportAdmin() {
  const sb = getSupabase();
  const [tab, setTab] = useState('open');
  const tickets = useQuery(async () => {
    if (tab === 'questions') return [];
    let q = sb.from('support_tickets').select('id,ticket_no,subject,category,status,updated_at, profiles:user_id(full_name)');
    if (tab !== 'all') q = q.eq('status', tab);
    return ((await q.order('updated_at', { ascending: false }).limit(200)).data ?? []) as unknown as { id: string; ticket_no: string; subject: string; category: string; status: string; updated_at: string; profiles: { full_name: string | null } | null }[];
  }, [tab]);
  const qs = useQuery(async () => {
    if (tab !== 'questions') return [];
    return ((await sb.from('product_questions').select('id,question,answer,status,created_at, products(name,slug)').order('created_at', { ascending: false }).limit(200)).data ?? []) as unknown as { id: string; question: string; answer: string | null; status: string; created_at: string; products: { name: string; slug: string } | null }[];
  }, [tab]);

  async function moderate(id: string, status: string) {
    const { error } = await sb.rpc('admin_moderate_question', { p_id: id, p_status: status });
    if (error) return toast.error(errorMessage(error));
    qs.reload();
  }

  return (
    <div>
      <PageHeader title="الدعم والأسئلة" subtitle="تذاكر العملاء وأسئلة المنتجات" />
      <Tabs value={tab} onChange={setTab} tabs={[{ v: 'open', l: 'مفتوحة' }, { v: 'pending', l: 'بانتظار العميل' }, { v: 'resolved', l: 'محلولة' }, { v: 'all', l: 'كل التذاكر' }, { v: 'questions', l: 'أسئلة المنتجات' }]} />
      {tab !== 'questions' ? (tickets.loading ? <Skeleton className="h-64" /> : (
        <Table head={['التذكرة', 'العميل', 'القسم', 'آخر تحديث', 'الحالة', '']} empty={!tickets.data?.length}>
          {tickets.data?.map((t) => (
            <tr key={t.id}><Td><b>{t.subject}</b><span className="block text-xs text-ink-muted" dir="ltr">{t.ticket_no}</span></Td><Td>{t.profiles?.full_name ?? '—'}</Td>
              <Td>{TICKET_CATEGORY[t.category]}</Td><Td className="text-xs">{timeAgo(t.updated_at)}</Td><Td><StatusBadge map={TICKET_STATUS} value={t.status} /></Td>
              <Td><Link href={`/admin/support/${t.id}`} className="font-bold text-brand-600">فتح</Link></Td></tr>
          ))}
        </Table>
      )) : (qs.loading ? <Skeleton className="h-64" /> : (
        <Table head={['السؤال', 'المنتج', 'الإجابة', 'الحالة', '']} empty={!qs.data?.length}>
          {qs.data?.map((q) => (
            <tr key={q.id}><Td className="max-w-xs">{q.question}<span className="block text-xs text-ink-muted">{timeAgo(q.created_at)}</span></Td>
              <Td><Link href={`/p/${q.products?.slug}`} className="text-brand-600">{q.products?.name}</Link></Td>
              <Td className="max-w-xs text-xs">{q.answer ?? <Badge tone="orange">بلا إجابة</Badge>}</Td>
              <Td><Badge tone={q.status === 'published' ? 'green' : q.status === 'hidden' ? 'red' : 'gray'}>{q.status}</Badge></Td>
              <Td>{q.status !== 'hidden' ? <Button size="sm" variant="ghost" onClick={() => moderate(q.id, 'hidden')}>إخفاء</Button> : <Button size="sm" variant="ghost" onClick={() => moderate(q.id, 'published')}>إظهار</Button>}</Td></tr>
          ))}
        </Table>
      ))}
    </div>
  );
}
