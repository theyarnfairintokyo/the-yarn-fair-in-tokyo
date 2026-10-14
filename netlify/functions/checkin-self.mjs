
import { createHash, timingSafeEqual } from 'node:crypto';
import { adminClient, json } from './_shared.mjs';

const MAX_BODY_BYTES = 4096;

function safeEqual(a, b) {
  const left = createHash('sha256')
    .update(String(a))
    .digest();

  const right = createHash('sha256')
    .update(String(b))
    .digest();

  return timingSafeEqual(left, right);
}

function extractToken(value) {
  const raw = String(value || '').trim();

  if (!raw || raw.length > 1024) return null;

  let token = raw;

  try {
    const url = new URL(raw);

    const allowedOrigin = new URL(
      process.env.PUBLIC_SITE_URL ||
      process.env.URL
    ).origin;

    if (url.origin !== allowedOrigin) return null;

    if (url.pathname !== '/checkin.html') return null;

    token = url.searchParams.get('token') || '';
  } catch {
    // The scanner may submit a raw UUID.
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(token)
  ) {
    return null;
  }

  return token;
}

export default async (request) => {
  if (request.method !== 'POST') {
    return json(
      { error: 'METHOD_NOT_ALLOWED' },
      405,
      { allow: 'POST' }
    );
  }

  const configuredKey = process.env.SELF_CHECKIN_DEVICE_KEY;

  if (!configuredKey || configuredKey.length < 32) {
    console.error('Self check-in device key missing');
    return json({ error: 'SERVICE_NOT_CONFIGURED' }, 503);
  }

  const claimedLength = Number(
    request.headers.get('content-length') || 0
  );

  if (claimedLength > MAX_BODY_BYTES) {
    return json({ error: 'REQUEST_TOO_LARGE' }, 413);
  }

  let input;

  try {
    const body = await request.text();

    if (body.length > MAX_BODY_BYTES) {
      return json({ error: 'REQUEST_TOO_LARGE' }, 413);
    }

    input = JSON.parse(body);
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.deviceKey !== 'string' ||
    !safeEqual(input.deviceKey, configuredKey)
  ) {
    return json({ error: 'DEVICE_NOT_AUTHORIZED' }, 403);
  }

  const token = extractToken(input.qrToken);

  if (!token) {
    return json({ error: 'INVALID_QR_CODE' }, 400);
  }

  try {
    const supabase = adminClient();

    /*
      This RPC will be created separately.

      It must:
      - restrict check-in to the current Tokyo event
      - validate the QR token
      - verify that registration is active
      - reject duplicate first check-ins atomically
      - preserve existing re-entry records
      - use a valid system user for checked_in_by
      - return only the minimum visitor information
    */

    const { data, error } = await supabase.rpc(
      'self_checkin_by_qr',
      {
        p_qr_token: token,
        p_device_label: 'Redmi Self Check-in',
        p_actor_user_id:
          process.env.SELF_CHECKIN_ACTOR_USER_ID || null
      }
    );

    if (error) {
      console.error('Self check-in RPC error:', error.code);

      return json(
        { error: 'CHECKIN_FAILED' },
        500
      );
    }

    const result = Array.isArray(data) ? data[0] : data;

    if (!result) {
      return json({ error: 'INVALID_QR_CODE' }, 400);
    }

    if (result.status !== 'success') {
      return json({
        status: result.status,
        message: result.message || ''
      });
    }

    return json({
      status: 'success',
      fullName: result.full_name,
      companyName: result.company_name,
      checkedInAt: result.checked_in_at
    });

  } catch (error) {
    console.error('Self check-in failure:', error);

    return json(
      { error: 'CHECKIN_FAILED' },
      500
    );
  }
};

export const config = {
  path: '/api/checkin-self'
};
