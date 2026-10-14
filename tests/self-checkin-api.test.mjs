import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, extractToken } from '../netlify/functions/checkin-self.mjs';
const origin = 'https://fair.example';
const qr = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const env = { PUBLIC_SITE_URL: origin, SELF_CHECKIN_DEVICE_KEY: 'test-only-key-not-a-production-secret-123456789',
  SELF_CHECKIN_ACTOR_USER_ID: actor, SELF_CHECKIN_EVENT_CODE: 'TEST-TOKYO' };
const atEvent = Date.parse('2026-10-20T13:00:00+09:00');
function fixture(result = { status: 'success', full_name: 'Test Visitor', company_name: '<Test Company>', checked_in_at: '2026-10-20T04:00:00Z' }, now = atEvent) {
  const calls = [];
  const handler = createHandler({ env, clock: () => now, client: () => ({ rpc: async (...args) => {
    calls.push(args); return { data: result, error: null };
  } }) });
  return { handler, calls };
}
function post(input, cookie = '', site = origin) {
  return new Request(`${origin}/api/checkin-self`, { method: 'POST', headers: { origin: site, cookie }, body: JSON.stringify(input) });
}
async function pair(handler, device = 'redmi-1') {
  const r = await handler(post({ action: 'pair', deviceKey: env.SELF_CHECKIN_DEVICE_KEY, device }));
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /Secure; HttpOnly; SameSite=Strict/);
  return r.headers.get('set-cookie').split(';')[0];
}
test('only same-origin UUID and issued checkin URL are accepted', () => {
  assert.equal(extractToken(qr, origin), qr);
  assert.equal(extractToken(`${origin}/checkin.html?token=${qr}`, origin), qr);
  for (const value of [`https://evil.example/checkin.html?token=${qr}`, `${origin}/registration.html?token=${qr}`,
    `${origin}/checkin.html?token=${qr}&token=${qr}`, 'not-a-token', null]) assert.equal(extractToken(value, origin), null);
});
test('no RPC without provisioning or with a wrong key or cross-site request', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(post({ action: 'checkin', qrToken: qr }))).status, 403);
  assert.equal((await handler(post({ action: 'pair', deviceKey: 'wrong', device: 'redmi-1' }))).status, 403);
  assert.equal((await handler(post({ action: 'pair', deviceKey: env.SELF_CHECKIN_DEVICE_KEY, device: 'redmi-1' }, '', 'https://evil.example'))).status, 403);
  assert.equal(calls.length, 0);
});
test('both provisioned tablets use server-selected actor and event, and return minimum data', async () => {
  for (const device of ['redmi-1','redmi-2']) {
    const { handler, calls } = fixture();
    const cookie = await pair(handler, device);
    const result = await handler(post({ action: 'checkin', qrToken: qr, p_event_code: 'evil', p_force_reentry: true }, cookie));
    assert.deepEqual(await result.json(), { status: 'success', fullName: 'Test Visitor', companyName: '<Test Company>', checkedInAt: '2026-10-20T04:00:00Z' });
    assert.deepEqual(calls[0], ['self_checkin_by_qr', { p_qr_token: qr, p_device_label: device, p_actor_user_id: actor, p_event_code: 'TEST-TOKYO' }]);
  }
});
test('tampered/expired/rotated cookies fail closed', async () => {
  const { handler, calls } = fixture();
  const cookie = await pair(handler);
  assert.equal((await handler(post({ action: 'checkin', qrToken: qr }, cookie + 'x'))).status, 403);
  const rotated = createHandler({ env: { ...env, SELF_CHECKIN_DEVICE_KEY: 'another-test-only-key-12345678901234567890' }, clock: () => atEvent });
  assert.equal((await rotated(post({ action: 'checkin', qrToken: qr }, cookie))).status, 403);
  const ended = fixture(undefined, Date.parse('2026-10-23T00:00:00+09:00'));
  assert.equal((await ended.handler(post({ action: 'checkin', qrToken: qr }, cookie))).status, 403);
  assert.equal(calls.length, 0);
});
test('before the event pairing works but recording is forbidden', async () => {
  const { handler, calls } = fixture(undefined, Date.parse('2026-10-14T15:00:00+09:00'));
  const cookie = await pair(handler);
  assert.equal((await handler(post({ action: 'checkin', qrToken: qr }, cookie))).status, 403);
  assert.equal(calls.length, 0);
});
test('duplicate and invalid registration do not disclose names', async () => {
  for (const status of ['already_checked_in', 'invalid_registration', 'rate_limited']) {
    const { handler } = fixture({ status, full_name: 'must not be returned' });
    const result = await handler(post({ action: 'checkin', qrToken: qr }, await pair(handler)));
    assert.equal(result.status, status === 'rate_limited' ? 429 : 200);
    assert.deepEqual(await result.json(), { status });
  }
});
test('configuration failures and oversized/invalid bodies are rejected before RPC', async () => {
  const { handler, calls } = fixture();
  assert.equal((await handler(post({ action: 'pair', deviceKey: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await handler(new Request(`${origin}/api/checkin-self`, { method: 'POST', headers: { origin }, body: '{' }))).status, 400);
  const unconfigured = createHandler({ env: { ...env, SELF_CHECKIN_ACTOR_USER_ID: '' }, clock: () => atEvent });
  assert.equal((await unconfigured(post({ action: 'checkin', qrToken: qr }, await pair(handler)))).status, 503);
  assert.equal(calls.length, 0);
});
