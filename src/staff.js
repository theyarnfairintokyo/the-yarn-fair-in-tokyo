import { supabase } from './supabase.js';
import * as XLSX from 'xlsx';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTokyo(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return value;
  }
}

async function sessionAndProfile() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data: profile, error } = await supabase
    .from('staff_profiles')
    .select('display_name,role,is_active')
    .eq('user_id', session.user.id)
    .single();

  if (error || !profile?.is_active) return null;
  return { session, profile };
}

async function requireStaff() {
  const auth = await sessionAndProfile();
  if (!auth) {
    location.href = '/staff-login.html';
    return null;
  }
  return auth;
}

document.querySelector('#staff-login')?.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.querySelector('[data-login-message]');
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  message.textContent = '';

  const { error } = await supabase.auth.signInWithPassword({
    email: form.email.value.trim(),
    password: form.password.value
  });

  if (error) {
    message.textContent = 'メールアドレスまたはパスワードを確認してください。';
    button.disabled = false;
    return;
  }
  location.href = '/admin.html';
});

window.staffLogout = async () => {
  await supabase.auth.signOut();
  location.href = '/staff-login.html';
};

async function loadAdmin() {
  const mount = document.querySelector('[data-admin-dashboard]');
  if (!mount) return;

  const auth = await requireStaff();
  if (!auth) return;

  document.querySelector('[data-staff-name]').textContent =
    `${auth.profile.display_name} (${auth.profile.role})`;

  const { data: registrations, error } = await supabase
    .from('registrations')
    .select(`
      id,registration_number,registered_at,planned_visit_dates,status,
      visitors(full_name,company_name,email,phone,industry)
    `)
    .order('registered_at', { ascending: false })
    .limit(5000);

  if (error) {
    mount.innerHTML = `<p class="status-error">${escapeHtml(error.message)}</p>`;
    return;
  }

  const { data: checkins, error: checkinError } = await supabase
    .from('checkins')
    .select('registration_id,checked_in_at,checkin_kind,is_void')
    .eq('is_void', false)
    .order('checked_in_at', { ascending: true });

  if (checkinError) {
    mount.innerHTML = `<p class="status-error">${escapeHtml(checkinError.message)}</p>`;
    return;
  }

  const firstCheckin = new Map();
  (checkins || []).forEach(row => {
    if (!firstCheckin.has(row.registration_id)) firstCheckin.set(row.registration_id, row);
  });

  const total = registrations?.length || 0;
  const checkedIn = (registrations || []).filter(row => firstCheckin.has(row.id)).length;

  document.querySelector('[data-total-registrations]').textContent = total;
  document.querySelector('[data-total-checkins]').textContent = checkedIn;
  document.querySelector('[data-total-unchecked]').textContent = total - checkedIn;

  window.__TYF_EXPORT_ROWS__ = (registrations || []).map(row => ({
    'Registration No.': row.registration_number,
    'Registered At': formatTokyo(row.registered_at),
    'Company': row.visitors?.company_name || '',
    'Name': row.visitors?.full_name || '',
    'Email': row.visitors?.email || '',
    'Phone': row.visitors?.phone || '',
    'Industry': row.visitors?.industry || '',
    'Planned Dates': (row.planned_visit_dates || []).join(', '),
    'First Check-in': formatTokyo(firstCheckin.get(row.id)?.checked_in_at),
    'Status': row.status
  }));

  mount.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>
          <th>Registration</th><th>Company</th><th>Name</th><th>Email</th>
          <th>Phone</th><th>Planned dates</th><th>Check-in</th>
        </tr></thead>
        <tbody>${(registrations || []).map(row => `
          <tr>
            <td>${escapeHtml(row.registration_number)}</td>
            <td>${escapeHtml(row.visitors?.company_name)}</td>
            <td>${escapeHtml(row.visitors?.full_name)}</td>
            <td>${escapeHtml(row.visitors?.email)}</td>
            <td>${escapeHtml(row.visitors?.phone)}</td>
            <td>${escapeHtml((row.planned_visit_dates || []).join(', '))}</td>
            <td>${escapeHtml(formatTokyo(firstCheckin.get(row.id)?.checked_in_at) || 'Not checked in')}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

window.exportExcel = () => {
  const rows = window.__TYF_EXPORT_ROWS__ || [];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 26 }, { wch: 20 }, { wch: 24 }, { wch: 30 }, { wch: 18 },
    { wch: 28 }, { wch: 28 }, { wch: 18 }, { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Visitors');
  XLSX.writeFile(workbook, `TYF_AW2026_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

function parseQrToken(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).searchParams.get('token') || raw;
  } catch {
    return raw;
  }
}

window.lookupQrToken = async rawValue => {
  const auth = await requireStaff();
  if (!auth) return;

  const mount = document.querySelector('[data-checkin-result]');
  const token = parseQrToken(rawValue);
  if (!token) {
    mount.innerHTML = '<p class="status-error">QRコードまたは受付トークンを入力してください。</p>';
    return;
  }

  mount.innerHTML = '<p>検索しています…</p>';
  const { data, error } = await supabase.rpc('lookup_registration_by_qr', {
    p_qr_token: token
  });

  if (error || !data?.length) {
    mount.innerHTML = `<p class="status-error">${escapeHtml(error?.message || 'Registration not found.')}</p>`;
    return;
  }

  const row = data[0];
  const alreadyCheckedIn = Number(row.active_checkin_count) > 0;
  mount.innerHTML = `
    <h2>${escapeHtml(row.company_name)}</h2>
    <p>${escapeHtml(row.full_name)}</p>
    <p>${escapeHtml(row.registration_number)}</p>
    <p>${alreadyCheckedIn
      ? `受付済み：${escapeHtml(formatTokyo(row.first_checkin_at))}`
      : '未受付'}</p>
    <button class="btn primary" type="button"
      onclick="recordCheckin('${escapeHtml(row.registration_id)}', ${alreadyCheckedIn})">
      ${alreadyCheckedIn ? '再入場を記録' : '受付する'}
    </button>`;
};

window.recordCheckin = async (registrationId, forceReentry) => {
  const auth = await requireStaff();
  if (!auth) return;

  const mount = document.querySelector('[data-checkin-result]');
  mount.innerHTML = '<p>受付処理中…</p>';

  const { data, error } = await supabase.rpc('record_checkin', {
    p_registration_id: registrationId,
    p_device_label: navigator.userAgent.slice(0, 240),
    p_force_reentry: forceReentry
  });

  mount.innerHTML = error
    ? `<p class="status-error">${escapeHtml(error.message)}</p>`
    : `<h2>受付完了</h2><p>${escapeHtml(formatTokyo(data?.[0]?.checked_in_at))}</p>`;
};

let activeScanner = null;
window.startQrScanner = async () => {
  const auth = await requireStaff();
  if (!auth) return;

  const mount = document.querySelector('[data-checkin-result]');
  try {
    if (activeScanner) {
      await activeScanner.stop().catch(() => {});
      await activeScanner.clear().catch(() => {});
    }
    activeScanner = new Html5Qrcode('qr-reader');
    await activeScanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async decodedText => {
        await activeScanner.stop();
        await window.lookupQrToken(decodedText);
      },
      () => {}
    );
  } catch (error) {
    mount.innerHTML = `<p class="status-error">${escapeHtml(error.message)}</p>`;
  }
};

async function autoLookupFromUrl() {
  if (!document.querySelector('[data-checkin-result]')) return;
  const token = new URLSearchParams(location.search).get('token');
  if (token) await window.lookupQrToken(token);
}

loadAdmin();
autoLookupFromUrl();
