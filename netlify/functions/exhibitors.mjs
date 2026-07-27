import { createClient } from '@supabase/supabase-js';
import { adminClient, json } from './_shared.mjs';

async function authenticatedAdmin(request) {
  const auth = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!auth) return null;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const publicKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publicKey) throw new Error('PUBLIC_SUPABASE_CONFIGURATION_MISSING');
  const client = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 0 } }
  });
  const { data: { user }, error } = await client.auth.getUser(auth);
  if (error || !user) return null;
  const admin = adminClient();
  const { data: profile, error: profileError } = await admin
    .from('staff_profiles')
    .select('role,is_active')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.is_active || profile.role !== 'admin') return null;
  return { user, admin };
}

function clean(value, max = 1000) {
  return String(value ?? '').trim().slice(0, max);
}
function nullable(value, max = 1000) {
  const result = clean(value, max);
  return result || null;
}
function validUrl(value) {
  const result = nullable(value, 500);
  if (!result) return null;
  try {
    const url = new URL(result);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new Error('WEBSITE_URL_INVALID');
  }
}
function validCountry(value) {
  const result = clean(value, 2).toUpperCase();
  if (!result) return null;
  if (!/^[A-Z]{2}$/.test(result)) throw new Error('COUNTRY_CODE_INVALID');
  return result;
}
function validEmail(value, required = false) {
  const result = clean(value, 254).toLowerCase();
  if (!result && !required) return null;
  if (!/^\S+@\S+\.\S+$/.test(result)) throw new Error('CONTACT_EMAIL_INVALID');
  return result;
}

async function currentEvent(admin) {
  const { data, error } = await admin
    .from('events')
    .select('id,event_code')
    .eq('event_code', process.env.EVENT_CODE || 'TYF-TYO-AW26')
    .single();
  if (error) throw error;
  return data;
}

async function list(admin) {
  const { data, error } = await admin.from('event_exhibitors').select(`
    id,event_id,exhibitor_id,booth_code,display_order,is_published,appointment_enabled,
    exhibitors(id,company_name,company_name_local,country_code,website_url,description_local,description_en,is_active,
      exhibitor_contacts(id,contact_name_local,contact_name_en,organization_label_local,organization_label_en,email,phone,is_primary,display_order)
    ),events!inner(event_code)
  `)
    .eq('events.event_code', process.env.EVENT_CODE || 'TYF-TYO-AW26')
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function upsertPrimaryContact(admin, exhibitorId, input) {
  const contactId = clean(input.contactId, 50);
  const email = validEmail(input.contactEmail, Boolean(contactId));
  const payload = {
    exhibitor_id: exhibitorId,
    contact_name_local: nullable(input.contactNameLocal, 180),
    contact_name_en: nullable(input.contactNameEn, 180),
    organization_label_local: nullable(input.organizationLocal, 180),
    organization_label_en: nullable(input.organizationEn, 180),
    email,
    phone: nullable(input.contactPhone, 50),
    is_primary: true,
    display_order: 1
  };

  if (contactId) {
    const { error } = await admin
      .from('exhibitor_contacts')
      .update(payload)
      .eq('id', contactId)
      .eq('exhibitor_id', exhibitorId);
    if (error) throw error;
    return;
  }

  const hasContactData = email || payload.contact_name_local || payload.contact_name_en || payload.phone;
  if (!hasContactData) return;
  if (!email) throw new Error('CONTACT_EMAIL_REQUIRED');
  const { error } = await admin.from('exhibitor_contacts').insert(payload);
  if (error) throw error;
}

export default async request => {
  try {
    const auth = await authenticatedAdmin(request);
    if (!auth) return json({ error: 'ADMIN_AUTH_REQUIRED', message: '管理者として再ログインしてください。' }, 401);
    const { admin } = auth;

    if (request.method === 'GET') return json({ items: await list(admin) });

    if (request.method === 'DELETE') {
      const url = new URL(request.url);
      const eventExhibitorId = clean(url.searchParams.get('eventExhibitorId'), 50);
      if (!eventExhibitorId) return json({ error: 'ID_REQUIRED' }, 400);
      const event = await currentEvent(admin);
      const { error } = await admin
        .from('event_exhibitors')
        .delete()
        .eq('id', eventExhibitorId)
        .eq('event_id', event.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (!['POST', 'PUT'].includes(request.method)) {
      return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'GET,POST,PUT,DELETE' });
    }

    const input = await request.json();
    const companyName = clean(input.companyName, 180);
    if (!companyName) return json({ error: 'COMPANY_NAME_REQUIRED', message: '会社名を入力してください。' }, 400);
    const exhibitorPayload = {
      company_name: companyName,
      company_name_local: nullable(input.companyNameLocal, 180),
      country_code: validCountry(input.countryCode),
      website_url: validUrl(input.websiteUrl),
      description_local: nullable(input.descriptionLocal, 5000),
      description_en: nullable(input.descriptionEn, 5000),
      is_active: input.isActive !== false
    };
    const eventPayload = {
      booth_code: nullable(input.boothCode, 50),
      display_order: Math.max(0, Number.parseInt(input.displayOrder, 10) || 0),
      is_published: input.isPublished !== false,
      appointment_enabled: Boolean(input.appointmentEnabled)
    };

    if (request.method === 'POST') {
      const event = await currentEvent(admin);
      const { data: exhibitor, error: exhibitorError } = await admin
        .from('exhibitors')
        .insert(exhibitorPayload)
        .select('id')
        .single();
      if (exhibitorError) throw exhibitorError;

      const { data: eventExhibitor, error: eventError } = await admin
        .from('event_exhibitors')
        .insert({ event_id: event.id, exhibitor_id: exhibitor.id, ...eventPayload })
        .select('id')
        .single();
      if (eventError) throw eventError;

      await upsertPrimaryContact(admin, exhibitor.id, input);
      return json({ id: eventExhibitor.id }, 201);
    }

    const eventExhibitorId = clean(input.eventExhibitorId, 50);
    const exhibitorId = clean(input.exhibitorId, 50);
    if (!eventExhibitorId || !exhibitorId) return json({ error: 'IDS_REQUIRED' }, 400);
    const event = await currentEvent(admin);

    const { error: exhibitorError } = await admin
      .from('exhibitors')
      .update(exhibitorPayload)
      .eq('id', exhibitorId);
    if (exhibitorError) throw exhibitorError;

    const { error: eventError } = await admin
      .from('event_exhibitors')
      .update(eventPayload)
      .eq('id', eventExhibitorId)
      .eq('event_id', event.id)
      .eq('exhibitor_id', exhibitorId);
    if (eventError) throw eventError;

    await upsertPrimaryContact(admin, exhibitorId, input);
    return json({ ok: true });
  } catch (error) {
    console.error('Exhibitor CMS operation failed:', error);
    const messages = {
      WEBSITE_URL_INVALID: 'WebサイトURLは https:// から入力してください。',
      COUNTRY_CODE_INVALID: '国コードは2文字の英字で入力してください。',
      CONTACT_EMAIL_INVALID: '正しいメールアドレスを入力してください。',
      CONTACT_EMAIL_REQUIRED: '担当者情報を登録する場合、メールアドレスが必要です.'
    };
    return json({
      error: 'EXHIBITOR_OPERATION_FAILED',
      message: messages[error.message] || error.message || '出展社情報を保存できませんでした。'
    }, 500);
  }
};

export const config = { path: '/api/exhibitors' };
