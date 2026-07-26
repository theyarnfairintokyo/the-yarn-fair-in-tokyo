create or replace function public.create_registration_v2(
p_event_code text,p_full_name text,p_roman_name text,p_company_name text,p_company_name_en text,p_department text,p_position_title text,
p_email text,p_phone text,p_country_region text,p_industry text,p_language text,p_planned_visit_dates date[],p_interest_materials text[],
p_organizer_message text,p_privacy_consent boolean,p_marketing_consent boolean,p_policy_version text default '2026-07-26')
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.events%rowtype;v_visitor_id uuid;v_registration_id uuid;v_registration_number text;v_qr_token uuid;v_now timestamptz:=now();
begin
if not p_privacy_consent then raise exception 'PRIVACY_CONSENT_REQUIRED';end if;
if p_language not in ('ja','en','ko') then raise exception 'INVALID_LANGUAGE';end if;
if coalesce(cardinality(p_planned_visit_dates),0)<1 then raise exception 'VISIT_DATE_REQUIRED';end if;
select * into v_event from public.events e where e.event_code=p_event_code and e.is_public=true and e.status in ('registration_open','in_progress') limit 1;
if v_event.id is null then raise exception 'EVENT_NOT_OPEN';end if;
insert into public.visitors(full_name,roman_name,company_name,company_name_en,department,position_title,email,phone,country_region,industry,preferred_language,first_registered_at,last_registered_at)
values(trim(p_full_name),nullif(trim(p_roman_name),''),trim(p_company_name),nullif(trim(p_company_name_en),''),nullif(trim(p_department),''),nullif(trim(p_position_title),''),
lower(trim(p_email))::extensions.citext,trim(p_phone),nullif(trim(p_country_region),''),trim(p_industry),p_language,v_now,v_now)
on conflict(email) do update set full_name=excluded.full_name,roman_name=excluded.roman_name,company_name=excluded.company_name,company_name_en=excluded.company_name_en,
department=excluded.department,position_title=excluded.position_title,phone=excluded.phone,country_region=excluded.country_region,industry=excluded.industry,
preferred_language=excluded.preferred_language,last_registered_at=v_now returning id into v_visitor_id;
if exists(select 1 from public.registrations where event_id=v_event.id and visitor_id=v_visitor_id) then raise exception 'ALREADY_REGISTERED';end if;
v_registration_number:=p_event_code||'-'||to_char(v_now at time zone 'Asia/Tokyo','YYMMDD')||'-'||upper(substr(replace(extensions.gen_random_uuid()::text,'-',''),1,6));
insert into public.registrations(event_id,visitor_id,registration_number,planned_visit_dates,interest_materials,organizer_message,status,source)
values(v_event.id,v_visitor_id,v_registration_number,p_planned_visit_dates,coalesce(p_interest_materials,'{}'::text[]),nullif(trim(p_organizer_message),''),'active','public_web')
returning id,qr_token into v_registration_id,v_qr_token;
insert into public.consent_events(visitor_id,registration_id,consent_type,consent_value,policy_version,language,recorded_at)
values(v_visitor_id,v_registration_id,'privacy_required',true,p_policy_version,p_language,v_now),
(v_visitor_id,v_registration_id,'marketing_optional',coalesce(p_marketing_consent,false),p_policy_version,p_language,v_now);
return jsonb_build_object('registrationId',v_registration_id,'registrationNumber',v_registration_number,'qrToken',v_qr_token,'email',lower(trim(p_email)),'language',p_language);
end;$$;
revoke execute on function public.create_registration_v2(text,text,text,text,text,text,text,text,text,text,text,text,date[],text[],text,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.create_registration_v2(text,text,text,text,text,text,text,text,text,text,text,text,date[],text[],text,boolean,boolean,text) to service_role;
