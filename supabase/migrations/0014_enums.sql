-- 0014 — قيم جديدة للأنواع (منفصلة لأن القيمة الجديدة لا تُستخدم في نفس المعاملة)
alter type public.payment_method   add value if not exists 'wallet';
alter type public.payment_method   add value if not exists 'transfer';
alter type public.app_role         add value if not exists 'courier';
alter type public.app_role         add value if not exists 'hub';
alter type public.sub_order_status add value if not exists 'awaiting_payment' before 'pending_merchant';
alter type public.sub_order_status add value if not exists 'at_hub' after 'handed_over';
alter type public.order_status     add value if not exists 'packed' after 'in_progress';
alter type public.order_status     add value if not exists 'out_for_delivery' after 'packed';
