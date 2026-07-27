import { createHash } from 'node:crypto';
import QRCode from 'qrcode';
import { Resend } from 'resend';
import { adminClient, json } from './_shared.mjs';

const EVENT_CODE = process.env.EVENT_CODE || 'TYF-TYO-AW26';
const ALLOWED_LANGUAGES = new Set(['ja', 'en']);
const MAX_LENGTHS = {
  fullName: 120,
  romanName: 120,
  companyName: 180,
  companyNameEn: 180,
  department: 120,
  positionTitle: 120,
  email: 254,
  phone: 50,
  countryRegion: 100,
  industry: 100,
  organizerMessage: 2000
};

function text(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function array(value, maxItems = 30, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function emailIsValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clientIp(request) {
  return request.headers.get('x-nf-client-connection-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '';
}

function hashAuditValue(value) {
  const salt = process.env.CONSENT_HASH_SALT;
  if (!salt || !value) return null;
  return createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

function siteUrl() {
  return String(process.env.PUBLIC_SITE_URL || process.env.URL || '').replace(/\/$/, '');
}

function confirmationHtml({ language, fullName, registrationNumber, plannedDates }) {
  const ja = language === 'ja';
  const dates = plannedDates.join(', ');
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.7;color:#4B1E3F">
      <h2>THE YARN FAIR IN TOKYO™</h2>
      <p>${ja ? `${fullName} 様` : `Dear ${fullName},`}</p>
      <p>${ja ? '来場登録が完了しました。' : 'Your visitor registration is complete.'}</p>
      <p><strong>${ja ? '受付番号' : 'Registration No.'}:</strong> ${registrationNumber}<br>
      <strong>${ja ? '来場予定日' : 'Planned visit date(s)'}:</strong> ${dates}</p>
      <p>${ja ? '会場受付で下記QRコードをご提示ください。' : 'Please present the QR code below at reception.'}</p>
      <p><img src="cid:visitor-qr" width="260" alt="Visitor QR code"></p>
      <p>WITH HARAJUKU HALL<br>2026.10.20–22</p>
      <p>Organized by ANDES JAPAN LLC / アンデスジャパン合同会社</p>
    </div>`;
}

export default async (request) => {
  if (request.method !== 'POST') {
    return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { allow: 'POST' });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'INVALID_JSON' }, 400);
  }

  // Honeypot: normal users never fill this field.
  if (text(input.website, 200)) {
    return json({ error: 'REGISTRATION_REJECTED' }, 400);
  }

  const payload = {
    fullName: text(input.fullName, MAX_LENGTHS.fullName),
    romanName: text(input.romanName, MAX_LENGTHS.romanName),
    companyName: text(input.companyName, MAX_LENGTHS.companyName),
    companyNameEn: text(input.companyNameEn, MAX_LENGTHS.companyNameEn),
    department: text(input.department, MAX_LENGTHS.department),
    positionTitle: text(input.positionTitle, MAX_LENGTHS.positionTitle),
    email: text(input.email, MAX_LENGTHS.email).toLowerCase(),
    phone: text(input.phone, MAX_LENGTHS.phone),
    countryRegion: text(input.countryRegion, MAX_LENGTHS.countryRegion),
    industry: text(input.industry, MAX_LENGTHS.industry),
    language: text(input.language, 2),
    plannedVisitDates: array(input.plannedVisitDates, 3, 10),
    interestMaterials: array(input.interestMaterials),
    organizerMessage: text(input.organizerMessage, MAX_LENGTHS.organizerMessage),
    privacyConsent: input.privacyConsent === true,
    marketingConsent: input.marketingConsent === true
  };

  const required = ['fullName', 'companyName', 'email', 'phone', 'industry'];
  for (const key of required) {
    if (!payload[key]) return json({ error: `${key}_REQUIRED` }, 400);
  }
  if (!emailIsValid(payload.email)) return json({ error: 'INVALID_EMAIL' }, 400);
  if (!ALLOWED_LANGUAGES.has(payload.language)) return json({ error: 'INVALID_LANGUAGE' }, 400);
  if (!payload.privacyConsent) return json({ error: 'PRIVACY_CONSENT_REQUIRED' }, 400);
  if (payload.plannedVisitDates.length < 1) return json({ error: 'VISIT_DATE_REQUIRED' }, 400);

  try {
    const supabase = adminClient();
    const userAgent = text(request.headers.get('user-agent'), 500);

    const { data, error } = await supabase.rpc('create_registration_v2', {
      p_event_code: EVENT_CODE,
      p_full_name: payload.fullName,
      p_roman_name: payload.romanName,
      p_company_name: payload.companyName,
      p_company_name_en: payload.companyNameEn,
      p_department: payload.department,
      p_position_title: payload.positionTitle,
      p_email: payload.email,
      p_phone: payload.phone,
      p_country_region: payload.countryRegion,
      p_industry: payload.industry,
      p_language: payload.language,
      p_planned_visit_dates: payload.plannedVisitDates,
      p_interest_materials: payload.interestMaterials,
      p_organizer_message: payload.organizerMessage,
      p_privacy_consent: payload.privacyConsent,
      p_marketing_consent: payload.marketingConsent,
      p_policy_version: '2026-07-26',
      p_ip_hash: hashAuditValue(clientIp(request)),
      p_user_agent: userAgent
    });

    if (error) {
      if (String(error.message).includes('ALREADY_REGISTERED')) {
        return json({
          error: 'ALREADY_REGISTERED',
          message: payload.language === 'en'
            ? 'This email address is already registered for this event.'
            : 'このメールアドレスは既に登録されています。'
        }, 409);
      }
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const publicUrl = siteUrl();
    if (!publicUrl) throw new Error('PUBLIC_SITE_URL_MISSING');

    const qrUrl = `${publicUrl}/checkin.html?token=${encodeURIComponent(result.qrToken)}`;
    const qrBuffer = await QRCode.toBuffer(qrUrl, {
      width: 420,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#4B1E3F', light: '#FFFFFF' }
    });

    let emailSent = false;
    let emailError = null;
    if (process.env.RESEND_API_KEY && process.env.FROM_EMAIL) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const subject = payload.language === 'en'
        ? 'Visitor registration complete | THE YARN FAIR IN TOKYO™'
        : '【THE YARN FAIR IN TOKYO™】来場登録完了';

      const { data: sent, error: sendError } = await resend.emails.send({
        from: process.env.FROM_EMAIL,
        to: [payload.email],
        subject,
        html: confirmationHtml({
          language: payload.language,
          fullName: payload.fullName,
          registrationNumber: result.registrationNumber,
          plannedDates: payload.plannedVisitDates
        }),
        attachments: [{
          content: qrBuffer.toString('base64'),
          filename: 'the-yarn-fair-visitor-qr.png',
          contentId: 'visitor-qr'
        }]
      });

      emailSent = !sendError;
      emailError = sendError?.message || null;

      await supabase.from('notifications').insert({
        event_id: result.eventId,
        registration_id: result.registrationId,
        channel: 'email',
        template_code: 'registration_confirmation',
        recipient: payload.email,
        language: payload.language,
        status: emailSent ? 'sent' : 'failed',
        provider_message_id: sent?.id || null,
        payload: { registrationNumber: result.registrationNumber },
        attempt_count: 1,
        last_error: emailError,
        sent_at: emailSent ? new Date().toISOString() : null
      });
    }

    return json({
      registrationNumber: result.registrationNumber,
      qrToken: result.qrToken,
      qrDataUrl: `data:image/png;base64,${qrBuffer.toString('base64')}`,
      emailSent,
      emailError
    }, 201);
  } catch (error) {
    console.error('Registration failure:', error);
    return json({
      error: 'REGISTRATION_FAILED',
      message: 'Registration could not be completed.'
    }, 500);
  }
};

export const config = { path: '/api/register' };
