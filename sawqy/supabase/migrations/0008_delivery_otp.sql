-- 0008 — تأكيد التسليم برمز OTP في دالة مستقلة حتى لا يُلغى عدّاد المحاولات عند الخطأ
create or replace function public.confirm_delivery(p_sub uuid, p_otp text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.sub_orders; v_code public.delivery_codes;
begin
  perform private.require_user();
  if not ((private.has_role('operations') and private.mfa_ok()) or private.is_admin()) then
    raise exception 'لا تملك صلاحية' using errcode = '42501';
  end if;
  select * into v from public.sub_orders where id = p_sub for update;
  if not found or v.status <> 'in_transit' then raise exception 'الطلب ليس في مرحلة التوصيل'; end if;
  select * into v_code from public.delivery_codes where sub_order_id = p_sub for update;
  if v_code.attempts >= 5 then
    return jsonb_build_object('ok', false, 'message', 'تم تجاوز عدد المحاولات، يلزم تسليم استثنائي من الإدارة');
  end if;
  if coalesce(trim(p_otp), '') <> v_code.code then
    update public.delivery_codes set attempts = attempts + 1 where sub_order_id = p_sub;
    return jsonb_build_object('ok', false, 'message', 'رمز التسليم غير صحيح', 'remaining', 4 - v_code.attempts);
  end if;
  perform private.apply_sub_status(v, 'delivered', 'تأكيد برمز OTP');
  return jsonb_build_object('ok', true, 'message', 'تم تأكيد التسليم');
end $$;

-- update_sub_order_status: التسليم يتم عبر confirm_delivery، أو استثنائيًا من الإدارة بسبب مكتوب
create or replace function public.update_sub_order_status(p_sub uuid, p_to public.sub_order_status,
                                                          p_reason text default null, p_otp text default null)
returns public.sub_order_status language plpgsql security definer set search_path = '' as $$
declare v public.sub_orders; v_merchant boolean; v_ops boolean;
begin
  perform private.require_user();
  select * into v from public.sub_orders where id = p_sub for update;
  if not found then raise exception 'الطلب غير موجود' using errcode = 'P0002'; end if;
  if not private.sub_transition_ok(v.status, p_to) then
    raise exception 'لا يمكن نقل الطلب من "%" إلى "%"', private.sub_status_label(v.status), private.sub_status_label(p_to);
  end if;
  v_merchant := private.store_perm(v.store_id, 'orders');
  v_ops := (private.has_role('operations') and private.mfa_ok()) or private.is_admin();
  if not (v_ops or (v_merchant and (v.status, p_to) in (
      ('pending_merchant','accepted'), ('pending_merchant','cancelled'), ('accepted','preparing'),
      ('accepted','cancelled'), ('preparing','ready'), ('preparing','cancelled'), ('ready','handed_over')))) then
    raise exception 'لا تملك صلاحية تنفيذ هذا الإجراء' using errcode = '42501';
  end if;
  if p_to in ('cancelled','delivery_failed') and coalesce(trim(p_reason), '') = '' then
    raise exception 'يرجى ذكر السبب';
  end if;
  if p_to = 'delivered' then
    if p_otp is not null then raise exception 'استخدم تأكيد التسليم برمز OTP'; end if;
    if not private.is_admin() or coalesce(trim(p_reason), '') = '' then
      raise exception 'التسليم يتطلب رمز OTP من العميل، أو تسليمًا استثنائيًا من الإدارة مع ذكر السبب';
    end if;
  end if;
  perform private.apply_sub_status(v, p_to, p_reason);
  return p_to;
end $$;

revoke execute on function public.confirm_delivery(uuid, text) from public, anon;
grant execute on function public.confirm_delivery(uuid, text) to authenticated;
