-- Read-only: run before applying the migration. No visitor names, QR tokens or credentials are returned.
select table_schema, table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in ('events','event_days','checkins','registrations','staff_profiles')
order by table_name, ordinal_position;

select e.id, e.event_code, e.status, e.is_public,
  array_agg(ed.event_date order by ed.event_date) as exhibition_dates
from public.events e join public.event_days ed on ed.event_id = e.id
group by e.id, e.event_code, e.status, e.is_public
having min(ed.event_date) = date '2026-10-20' and max(ed.event_date) = date '2026-10-22';

select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('record_checkin','lookup_registration_by_qr','self_checkin_by_qr');

select indexname, indexdef from pg_indexes where schemaname = 'public' and tablename = 'checkins';
-- Choose the existing admin UUID for SELF_CHECKIN_ACTOR_USER_ID, not an anon key.
select user_id, role, is_active from public.staff_profiles where role = 'admin' and is_active = true;
