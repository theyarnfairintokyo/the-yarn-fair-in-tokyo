import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { adminClient, json } from './_shared.mjs';

const COOKIE = '__Host-tyf-self-checkin';
const EVENT_START = Date.parse('2026-10-20T00:00:00+09:00');
const EVENT_END = Date.parse('2026-10-23T00:00:00+09:00');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 4096;

function safeEqual(a, b) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
function sign(value, key) {
  return createHmac('sha256', key).update(value).digest('base64url');
}
function readSession(request, key, now) {
  const cookie = (request.headers.get('cookie') || '').split(';').map(v => v.trim())
    .find(v => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!cookie || cookie.length > 1024) return null;
  const parts = cookie.split('.');
  if (parts.length !== 2 || !safeEqual(sign(parts[0], key), parts[1])) return null;
  try {
    const session = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (session.v !== 1 || !['redmi-1', 'redmi-2'].includes(session.device) ||
        !Number.isSafeInteger(session.exp) || session.exp <= now || session.exp > EVENT_END) return null;
    return session;
  } catch { return null; }
}
export function extractToken(value, origin) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > 1024) return null;
  if (UUID.test(raw)) return raw.toLowerCase();
  try {
    const url = new URL(raw);
    if (url.origin !== origin || url.pathname !== '/checkin.html') return null;
    const tokens = url.searchParams.getAll('token');
    if (tokens.length !== 1 || !UUID.test(tokens[0])) return null;
    return tokens[0].toLowerCase();
  } catch { return null; }
}
// Inject dependencies for tests without using production data.
export function createHandler({ env = process.env, client = adminClient, clock = Date.now } = {}) {
  return async request => {
    let origin;
    try { origin = new URL(env.PUBLIC_SITE_URL || env.URL).origin; }
    catch { return json({ error: 'SERVICE_NOT_CONFIGURED' }, 503); }
    const key = env.SELF_CHECKIN_DEVICE_KEY;
    if (!key || key.length < 32) return json({ error: 'SERVICE_NOT_CONFIGURED' }, 503);
    const now = clock();
    const session = readSession(request, key, now);
    if (request.method === 'GET') return json({ authorized: Boolean(session), device: session?.device || null,
      eventOpen: now >= EVENT_START && now < EVENT_END });
    if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'GET, POST' });
    if (request.headers.get('origin') !== origin) return json({ error: 'ORIGIN_NOT_ALLOWED' }, 403);
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return json({ error: 'REQUEST_TOO_LARGE' }, 413);
    let input;
    try {
      const body = await request.text();
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return json({ error: 'REQUEST_TOO_LARGE' }, 413);
      input = JSON.parse(body);
      if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error();
    } catch { return json({ error: 'INVALID_JSON' }, 400); }
    if (input.action === 'pair') {
      if (now >= EVENT_END) return json({ error: 'EVENT_CLOSED' }, 403);
      if (typeof input.deviceKey !== 'string' || !safeEqual(input.deviceKey, key) || !['redmi-1', 'redmi-2'].includes(input.device)) {
        return json({ error: 'DEVICE_NOT_AUTHORIZED' }, 403);
      }
      const payload = Buffer.from(JSON.stringify({ v: 1, device: input.device, exp: EVENT_END })).toString('base64url');
      return json({ authorized: true, device: input.device }, 200, {
        'set-cookie': `${COOKIE}=${payload}.${sign(payload, key)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${Math.floor((EVENT_END - now) / 1000)}`
      });
    }
    if (!session) return json({ error: 'DEVICE_NOT_AUTHORIZED' }, 403);
    if (input.action === 'unpair') return json({ authorized: false }, 200, {
      'set-cookie': `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`
    });
    if (input.action !== 'checkin') return json({ error: 'INVALID_ACTION' }, 400);
    // Client-supplied event, time, actor, re-entry flag and device label are never trusted.
    if (now < EVENT_START || now >= EVENT_END) return json({ error: 'EVENT_CLOSED' }, 403);
    const token = extractToken(input.qrToken, origin);
    if (!token) return json({ error: 'INVALID_QR_CODE' }, 400);
    // Verified production configuration; these identifiers are not credentials.
    const actorUserId = env.SELF_CHECKIN_ACTOR_USER_ID ?? '269fc015-9bc4-4ac6-8f6d-9acdd0893a59';
    const eventCode = env.SELF_CHECKIN_EVENT_CODE ?? 'TYF-TYO-AW26';
    if (!UUID.test(actorUserId || '') || !eventCode) {
      return json({ error: 'SERVICE_NOT_CONFIGURED' }, 503);
    }
    try {
      const { data, error } = await client().rpc('self_checkin_by_qr', {
        p_qr_token: token, p_device_label: session.device,
        p_actor_user_id: actorUserId, p_event_code: eventCode
      });
      if (error) {
        console.error('Self check-in RPC error:', error.code);
        return json({ error: 'CHECKIN_FAILED' }, 500);
      }
      const result = Array.isArray(data) ? data[0] : data;
      if (!result || typeof result.status !== 'string') return json({ error: 'CHECKIN_FAILED' }, 500);
      if (result.status === 'success') return json({ status: 'success', fullName: result.full_name,
        companyName: result.company_name, checkedInAt: result.checked_in_at });
      const allowed = ['already_checked_in', 'invalid_registration', 'event_closed', 'rate_limited', 'service_not_configured'];
      if (!allowed.includes(result.status)) return json({ error: 'CHECKIN_FAILED' }, 500);
      return json({ status: result.status }, result.status === 'rate_limited' ? 429 : 200);
    } catch {
      console.error('Self check-in server failure');
      return json({ error: 'CHECKIN_FAILED' }, 500);
    }
  };
}
export default createHandler();
export const config = { path: '/api/checkin-self' };
