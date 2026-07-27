-- Create user first in Authentication > Users, then replace AUTH_USER_UUID.
insert into public.staff_profiles(user_id,display_name,role,is_active) values('AUTH_USER_UUID','Oshida','admin',true);
insert into public.staff_event_access(user_id,event_id) select 'AUTH_USER_UUID',id from public.events where event_code='TYF-TYO-AW26' on conflict do nothing;
