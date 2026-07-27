import { createClient } from '@supabase/supabase-js';
import { adminClient, json } from './_shared.mjs';

async function authenticatedAdmin(request){
  const auth=String(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!auth) return null;
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
  const publicKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!publicKey) throw new Error('PUBLIC_SUPABASE_CONFIGURATION_MISSING');
  const client=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await client.auth.getUser(auth);
  if(error||!user) return null;
  const admin=adminClient();
  const {data:profile}=await admin.from('staff_profiles').select('role,is_active').eq('user_id',user.id).maybeSingle();
  if(!profile?.is_active||profile.role!=='admin') return null;
  return {user,admin};
}

function clean(v,max=1000){return String(v??'').trim().slice(0,max);}
function nullable(v,max=1000){const x=clean(v,max);return x||null;}

async function list(admin){
  const {data,error}=await admin.from('event_exhibitors').select(`
    id,event_id,exhibitor_id,booth_code,display_order,is_published,appointment_enabled,
    exhibitors(id,company_name,company_name_local,country_code,website_url,description_local,description_en,is_active,
      exhibitor_contacts(id,contact_name_local,contact_name_en,organization_label_local,organization_label_en,email,phone,is_primary,display_order)
    ),events!inner(event_code)
  `).eq('events.event_code',process.env.EVENT_CODE||'TYF-TYO-AW26').order('display_order',{ascending:true});
  if(error) throw error;
  return data||[];
}

export default async(request)=>{
  const auth=await authenticatedAdmin(request);
  if(!auth) return json({error:'ADMIN_AUTH_REQUIRED'},401);
  const {admin}=auth;
  try{
    if(request.method==='GET') return json({items:await list(admin)});
    const input=await request.json();
    if(request.method==='POST'){
      const companyName=clean(input.companyName,180);
      if(!companyName) return json({error:'COMPANY_NAME_REQUIRED'},400);
      const {data:event,error:eventError}=await admin.from('events').select('id').eq('event_code',process.env.EVENT_CODE||'TYF-TYO-AW26').single();
      if(eventError) throw eventError;
      const {data:ex,error:exError}=await admin.from('exhibitors').insert({
        company_name:companyName,company_name_local:nullable(input.companyNameLocal,180),country_code:nullable(input.countryCode,2),
        website_url:nullable(input.websiteUrl,500),description_local:nullable(input.descriptionLocal,5000),description_en:nullable(input.descriptionEn,5000),is_active:true
      }).select('id').single();
      if(exError) throw exError;
      const {data:ee,error:eeError}=await admin.from('event_exhibitors').insert({event_id:event.id,exhibitor_id:ex.id,
        booth_code:nullable(input.boothCode,50),display_order:Number(input.displayOrder)||0,is_published:input.isPublished!==false,
        appointment_enabled:Boolean(input.appointmentEnabled)}).select('id').single();
      if(eeError) throw eeError;
      if(clean(input.contactEmail,254)){
        const {error:cError}=await admin.from('exhibitor_contacts').insert({exhibitor_id:ex.id,
          contact_name_local:nullable(input.contactNameLocal,180),contact_name_en:nullable(input.contactNameEn,180),
          organization_label_local:nullable(input.organizationLocal,180),organization_label_en:nullable(input.organizationEn,180),
          email:clean(input.contactEmail,254).toLowerCase(),phone:nullable(input.contactPhone,50),is_primary:true,display_order:1});
        if(cError) throw cError;
      }
      return json({id:ee.id},201);
    }
    if(request.method==='PUT'){
      const eventExhibitorId=clean(input.eventExhibitorId,50);
      const exhibitorId=clean(input.exhibitorId,50);
      if(!eventExhibitorId||!exhibitorId) return json({error:'IDS_REQUIRED'},400);
      const {error:exError}=await admin.from('exhibitors').update({
        company_name:clean(input.companyName,180),company_name_local:nullable(input.companyNameLocal,180),country_code:nullable(input.countryCode,2),
        website_url:nullable(input.websiteUrl,500),description_local:nullable(input.descriptionLocal,5000),description_en:nullable(input.descriptionEn,5000),
        is_active:input.isActive!==false
      }).eq('id',exhibitorId);
      if(exError) throw exError;
      const {error:eeError}=await admin.from('event_exhibitors').update({booth_code:nullable(input.boothCode,50),display_order:Number(input.displayOrder)||0,
        is_published:input.isPublished!==false,appointment_enabled:Boolean(input.appointmentEnabled)}).eq('id',eventExhibitorId);
      if(eeError) throw eeError;

      const contactEmail=clean(input.contactEmail,254).toLowerCase();
      const contactPayload={
        exhibitor_id:exhibitorId,
        contact_name_local:nullable(input.contactNameLocal,180),
        contact_name_en:nullable(input.contactNameEn,180),
        organization_label_local:nullable(input.organizationLocal,180),
        organization_label_en:nullable(input.organizationEn,180),
        email:contactEmail||null,
        phone:nullable(input.contactPhone,50),
        is_primary:true,
        display_order:1
      };
      const contactId=clean(input.contactId,50);
      if(contactId){
        const {error:contactError}=await admin.from('exhibitor_contacts').update(contactPayload).eq('id',contactId).eq('exhibitor_id',exhibitorId);
        if(contactError) throw contactError;
      }else if(contactEmail||contactPayload.contact_name_local||contactPayload.contact_name_en){
        const {error:contactError}=await admin.from('exhibitor_contacts').insert(contactPayload);
        if(contactError) throw contactError;
      }
      return json({ok:true});
    }
    if(request.method==='DELETE'){
      const url=new URL(request.url);
      const eventExhibitorId=url.searchParams.get('eventExhibitorId');
      if(!eventExhibitorId) return json({error:'ID_REQUIRED'},400);
      const {error}=await admin.from('event_exhibitors').delete().eq('id',eventExhibitorId);
      if(error) throw error;
      return json({ok:true});
    }
    return json({error:'METHOD_NOT_ALLOWED'},405,{allow:'GET,POST,PUT,DELETE'});
  }catch(error){console.error(error);return json({error:'EXHIBITOR_OPERATION_FAILED',message:error.message},500);}
};

export const config={path:'/api/exhibitors'};
