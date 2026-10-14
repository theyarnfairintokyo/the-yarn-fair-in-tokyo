-- Additive migration: does not replace staff RPCs, registration functions, policies or data.
-- Apply only after verifying the live schema using 006_self_checkin_preflight.sql.
begin;

-- The existing first-entry index may already cover this. This named index ensures
-- the invariant even when staff and self check-in race; re-entry rows remain allowed.
create unique index if not exists checkins_one_active_first_entry
on public.checkins (registration_id)
where checkin_kind = 'first_entry' and is_void = false;

create table if not exists private.self_checkin_rate (
  device_label text primary key check (device_label in ('redmi-1', 'redmi-2')),
  window_start timestamptz not null,
  attempts integer not null
);
alter table private.self_checkin_rate enable row level security;
revoke all on private.self_checkin_rate from public, anon, authenticated;

create or replace function public.self_checkin_by_qr(
  p_qr_token uuid,
  p_device_label text,
  p_actor_user_id uuid,
  p_event_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
  v_now timestamptz := now();
  v_date date := (v_now at time zone 'Asia/Tokyo')::date;
  v_window timestamptz := date_trunc('minute', v_now);
  v_attempts integer;
  v_company text;
  v_name text;
  v_checked_at timestamptz;
begin
  -- Execute is also restricted to service_role; browser anon/auth roles cannot call this RPC.
  if auth.role() is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_device_label is null or p_device_label not in ('redmi-1', 'redmi-2') or
     p_event_code is null or p_actor_user_id is null then
    return jsonb_build_object('status', 'service_not_configured');
  end if;
  -- Actor is selected in server configuration, never supplied by the visitor.
  -- Require an existing active admin; do not manufacture auth.uid() for staff RPCs.
  if not exists (select 1 from public.staff_profiles sp
    where sp.user_id = p_actor_user_id and sp.is_active = true and sp.role = 'admin') then
    return jsonb_build_object('status', 'service_not_configured');
  end if;
  if v_date < date '2026-10-20' or v_date > date '2026-10-22' then
    return jsonb_build_object('status', 'event_closed');
  end if;

  -- Persist the limit in PostgreSQL so multiple Netlify instances share it.
  insert into private.self_checkin_rate as rate (device_label, window_start, attempts)
  values (p_device_label, v_window, 1)
  on conflict (device_label) do update set
    attempts = case when rate.window_start = excluded.window_start then rate.attempts + 1 else 1 end,
    window_start = excluded.window_start
  returning attempts into v_attempts;
  if v_attempts > 40 then return jsonb_build_object('status', 'rate_limited'); end if;

  select r.* into v_registration from public.registrations r
  where r.qr_token = p_qr_token for update;
  if v_registration.id is null or v_registration.status is distinct from 'active' then
    return jsonb_build_object('status', 'invalid_registration');
  end if;
  -- Match the server-selected event and the exact three Tokyo exhibition days.
  -- This also avoids trusting ambiguous AW2026 labels or a browser-controlled event id.
  if not exists (select 1 from public.events e
    where e.id = v_registration.event_id and e.event_code = p_event_code
      and e.is_public = true and e.status in ('registration_open', 'in_progress')
      and (select array_agg(ed.event_date order by ed.event_date)
        from public.event_days ed where ed.event_id = e.id)
        = array[date '2026-10-20', date '2026-10-21', date '2026-10-22']) then
    return jsonb_build_object('status', 'invalid_registration');
  end if;
  if exists (select 1 from public.checkins c
    where c.registration_id = v_registration.id and c.is_void = false) then
    return jsonb_build_object('status', 'already_checked_in');
  end if;

  select v.company_name, v.full_name into v_company, v_name
  from public.visitors v where v.id = v_registration.visitor_id;
  if not found then return jsonb_build_object('status', 'invalid_registration'); end if;
  begin
    insert into public.checkins (registration_id, checkin_kind, checked_in_by, device_label)
    values (v_registration.id, 'first_entry', p_actor_user_id, p_device_label)
    returning checked_in_at into v_checked_at;
  exception when unique_violation then
    if exists (select 1 from public.checkins c
      where c.registration_id = v_registration.id and c.is_void = false) then
      return jsonb_build_object('status', 'already_checked_in');
    end if;
    raise;
  end;
  return jsonb_build_object('status', 'success', 'company_name', v_company,
    'full_name', v_name, 'checked_in_at', v_checked_at);
end;
$$;

revoke all on function public.self_checkin_by_qr(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.self_checkin_by_qr(uuid,text,uuid,text) to service_role;
commit;
