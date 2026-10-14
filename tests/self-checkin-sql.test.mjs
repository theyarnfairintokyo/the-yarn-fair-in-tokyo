// Integration tests against an isolated PostgreSQL engine, never the production database.
// Fixture columns reflect retrieved code. Live schema verification is still required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const migration = await readFile(new URL('../supabase/006_self_checkin.sql', import.meta.url), 'utf8');
const actor = '22222222-2222-4222-8222-222222222222';
const qr = '11111111-1111-4111-8111-111111111111';
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role', true) $$;
    create table public.events(id uuid primary key, event_code text unique, is_public boolean, status text);
    create table public.event_days(event_id uuid references public.events, event_date date);
    create table public.visitors(id uuid primary key, company_name text, full_name text);
    create table public.registrations(id uuid primary key, qr_token uuid unique, status text,
      event_id uuid references public.events, visitor_id uuid references public.visitors);
    create table public.staff_profiles(user_id uuid primary key, role text, is_active boolean);
    create table public.checkins(id uuid default gen_random_uuid() primary key,
      registration_id uuid references public.registrations, checkin_kind text check(checkin_kind in ('first_entry','re_entry')),
      checked_in_by uuid references public.staff_profiles(user_id), device_label text,
      checked_in_at timestamptz default now(), is_void boolean not null default false);
    insert into events values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','TEST-TOKYO',true,'registration_open');
    insert into event_days select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', d::date
      from generate_series(date '2026-10-20', date '2026-10-22', interval '1 day') d;
    insert into visitors values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Test Company','Test Visitor');
    insert into registrations values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${qr}','active',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    insert into staff_profiles values ('${actor}','admin',true);
    set request.jwt.claim.role = 'service_role';
    set test.now = '2026-10-20T13:00:00+09:00';
  `);
  // Only the isolated test clock is replaced; deployable SQL keeps PostgreSQL now().
  await db.exec(migration.replace('v_now timestamptz := now();', "v_now timestamptz := current_setting('test.now')::timestamptz;"));
  return db;
}
async function scan(db, token = qr, device = 'redmi-1', event = 'TEST-TOKYO') {
  const result = await db.query('select public.self_checkin_by_qr($1::uuid,$2,$3::uuid,$4) as result', [token, device, actor, event]);
  return result.rows[0].result;
}
test('SQL writes once across both device labels and first-entry uniqueness preserves staff re-entry', async () => {
  const db = await fixture();
  try {
    assert.equal((await scan(db)).status, 'success');
    assert.equal((await scan(db, qr, 'redmi-2')).status, 'already_checked_in');
    assert.equal((await db.query('select count(*)::int as n from checkins')).rows[0].n, 1);
    await assert.rejects(db.query(`insert into checkins(registration_id,checkin_kind,checked_in_by)
      values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','first_entry',$1)`, [actor]), /duplicate key/);
    await db.query(`insert into checkins(registration_id,checkin_kind,checked_in_by)
      values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','re_entry',$1)`, [actor]);
    assert.equal((await db.query('select count(*)::int as n from checkins')).rows[0].n, 2);
  } finally { await db.close(); }
});
test('SQL rejects invalid/cancelled/cross-event registrations and inactive actor', async () => {
  const db = await fixture();
  try {
    assert.equal((await scan(db, '99999999-9999-4999-8999-999999999999')).status, 'invalid_registration');
    assert.equal((await scan(db, qr, 'redmi-1', 'OTHER')).status, 'invalid_registration');
    await db.exec("update registrations set status='cancelled'");
    assert.equal((await scan(db)).status, 'invalid_registration');
    await db.exec("update staff_profiles set is_active=false");
    assert.equal((await scan(db)).status, 'service_not_configured');
    assert.equal((await db.query('select count(*)::int as n from checkins')).rows[0].n, 0);
  } finally { await db.close(); }
});
test('SQL checks Japanese dates and allows all three event dates only', async () => {
  const db = await fixture();
  try {
    for (const day of ['2026-10-19T23:59:59+09:00','2026-10-23T00:00:00+09:00']) {
      await db.query("select set_config('test.now',$1,false)", [day]);
      assert.equal((await scan(db)).status, 'event_closed');
    }
    for (const day of ['2026-10-20','2026-10-21','2026-10-22']) {
      await db.query("select set_config('test.now',$1,false)", [day+'T13:00:00+09:00']);
      assert.equal((await scan(db)).status, day.endsWith('20') ? 'success' : 'already_checked_in');
    }
  } finally { await db.close(); }
});
test('SQL durable rate limit covers unknown tokens and recovers in next minute', async () => {
  const db = await fixture();
  try {
    const unknown = '99999999-9999-4999-8999-999999999999';
    for (let i = 0; i < 40; i++) assert.equal((await scan(db, unknown)).status, 'invalid_registration');
    assert.equal((await scan(db, unknown)).status, 'rate_limited');
    assert.equal((await scan(db, unknown, 'redmi-2')).status, 'invalid_registration');
    await db.exec("set test.now = '2026-10-20T13:01:00+09:00'");
    assert.equal((await scan(db, unknown)).status, 'invalid_registration');
  } finally { await db.close(); }
});
test('anon/authenticated have no execute right; second migration is safe', async () => {
  const db = await fixture();
  try {
    const rows = (await db.query(`select
      has_function_privilege('anon','public.self_checkin_by_qr(uuid,text,uuid,text)','execute') as anon,
      has_function_privilege('authenticated','public.self_checkin_by_qr(uuid,text,uuid,text)','execute') as authenticated,
      has_function_privilege('service_role','public.self_checkin_by_qr(uuid,text,uuid,text)','execute') as service`)).rows;
    assert.deepEqual(rows[0], { anon: false, authenticated: false, service: true });
    await db.exec("set request.jwt.claim.role='authenticated'");
    await assert.rejects(scan(db), /SERVICE_ROLE_REQUIRED/);
    await db.exec(migration);
  } finally { await db.close(); }
});
