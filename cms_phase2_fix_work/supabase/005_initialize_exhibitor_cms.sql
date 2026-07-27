-- THE YARN FAIR IN TOKYO™ — Exhibitor CMS initialization
-- Purpose:
--   1) Grant the first Supabase Auth user administrator access.
--   2) Link all existing active exhibitor master records to TYF-TYO-AW26.
--   3) Keep existing company/contact data and avoid duplicate records.
--
-- Safe to run more than once.

begin;

-- Current administrator created in Authentication > Users.
insert into public.staff_profiles (user_id, display_name, role, is_active)
values ('269fc015-9bc4-4ac6-8f6d-9acdd0893a59'::uuid, 'Oshida', 'admin', true)
on conflict (user_id) do update
set display_name = excluded.display_name,
    role = 'admin',
    is_active = true,
    updated_at = now();

insert into public.staff_event_access (user_id, event_id)
select '269fc015-9bc4-4ac6-8f6d-9acdd0893a59'::uuid, e.id
from public.events e
where e.event_code = 'TYF-TYO-AW26'
on conflict do nothing;

-- Link the existing exhibitor masters to the current event.
-- Existing contact records are preserved as-is.
with target_event as (
  select id
  from public.events
  where event_code = 'TYF-TYO-AW26'
  limit 1
), ranked_exhibitors as (
  select
    ex.id as exhibitor_id,
    row_number() over (order by ex.company_name, ex.id)::integer as proposed_order
  from public.exhibitors ex
  where coalesce(ex.is_active, true) = true
)
insert into public.event_exhibitors (
  event_id,
  exhibitor_id,
  display_order,
  is_published,
  appointment_enabled
)
select
  te.id,
  re.exhibitor_id,
  re.proposed_order,
  true,
  false
from target_event te
cross join ranked_exhibitors re
on conflict (event_id, exhibitor_id) do update
set is_published = true;

commit;

-- Verification: this should return 17 rows for the current roster.
select
  ee.display_order,
  ex.company_name,
  c.contact_name_local,
  c.contact_name_en,
  c.organization_label_local,
  c.organization_label_en,
  c.email,
  ee.is_published
from public.event_exhibitors ee
join public.events e on e.id = ee.event_id
join public.exhibitors ex on ex.id = ee.exhibitor_id
left join lateral (
  select ec.*
  from public.exhibitor_contacts ec
  where ec.exhibitor_id = ex.id
  order by ec.is_primary desc, ec.display_order asc, ec.id asc
  limit 1
) c on true
where e.event_code = 'TYF-TYO-AW26'
order by ee.display_order, ex.company_name;
