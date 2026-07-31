import { supabase } from './supabase.js';
import * as XLSX from 'xlsx';

const state = {
  registrations: [],
  checkins: [],
  firstCheckin: new Map(),
  profile: null,
  currentView: 'dashboard'
};

const pageMeta = {
  dashboard: ['Dashboard', 'Visitor registration and live check-in management'],
  visitors: ['Visitors', 'Search, review and export visitor records'],
  exhibitors: ['Exhibitor CMS', 'Manage exhibitor information and publication status']
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatTokyo(value, { timeOnly = false } = {}) {
  if (!value) return '';
  try {
    const options = timeOnly
      ? { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }
      : { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    return new Intl.DateTimeFormat('ja-JP', options).format(new Date(value));
  } catch {
    return String(value);
  }
}

function isTodayTokyo(value) {
  if (!value) return false;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit'
  });
  return formatter.format(new Date(value)) === formatter.format(new Date());
}

function withinLastHour(value) {
  if (!value) return false;
  const elapsed = Date.now() - new Date(value).getTime();
  return elapsed >= 0 && elapsed <= 60 * 60 * 1000;
}

function showToast(message, isError = false) {
  const toast = document.querySelector('[data-dashboard-toast]');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

async function getStaff() {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) {
    location.replace('/staff-login.html');
    return null;
  }

  const { data: profile, error } = await supabase
    .from('staff_profiles')
    .select('display_name,role,is_active')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !profile || !profile.is_active) {
    showToast(error?.message || '管理者権限を確認できません。', true);
    return null;
  }

  return { session, profile };
}

function setView(name) {
  if (!pageMeta[name]) return;
  state.currentView = name;

  document.querySelectorAll('[data-view-panel]').forEach(panel => {
    panel.hidden = panel.dataset.viewPanel !== name;
  });
  document.querySelectorAll('[data-dashboard-view]').forEach(button => {
    button.classList.toggle('active', button.dataset.dashboardView === name);
  });

  document.querySelector('[data-page-title]').textContent = pageMeta[name][0];
  document.querySelector('[data-page-subtitle]').textContent = pageMeta[name][1];

  if (name === 'visitors') renderVisitorTable();
}

function buildFirstCheckinMap() {
  state.firstCheckin = new Map();
  [...state.checkins]
    .sort((a, b) => new Date(a.checked_in_at) - new Date(b.checked_in_at))
    .forEach(row => {
      if (!state.firstCheckin.has(row.registration_id)) {
        state.firstCheckin.set(row.registration_id, row);
      }
    });
}

function updateMetrics() {
  const total = state.registrations.length;
  const checked = state.registrations.filter(row => state.firstCheckin.has(row.id)).length;
  const pending = total - checked;
  const today = state.checkins.filter(row => isTodayTokyo(row.checked_in_at)).length;
  const lastHour = state.checkins.filter(row => withinLastHour(row.checked_in_at)).length;
  const industries = new Set(state.registrations.map(row => row.visitors?.industry).filter(Boolean));

  document.querySelector('[data-total-registrations]').textContent = total;
  document.querySelector('[data-total-checkins]').textContent = checked;
  document.querySelector('[data-total-unchecked]').textContent = pending;
  document.querySelector('[data-today-checkins]').textContent = today;
  document.querySelector('[data-industry-count]').textContent = industries.size;
  document.querySelector('[data-attendance-rate]').textContent =
    total ? `${Math.round((checked / total) * 100)}% attendance` : '0% attendance';
  document.querySelector('[data-last-hour]').textContent =
    lastHour ? `+${lastHour} check-in${lastHour === 1 ? '' : 's'} in the last hour` : 'No check-ins in the last hour';
}

function renderTrend() {
  const dates = [
    ['2026-10-20', 'OCT 20'],
    ['2026-10-21', 'OCT 21'],
    ['2026-10-22', 'OCT 22']
  ];
  const counts = dates.map(([date]) =>
    state.registrations.filter(row => (row.planned_visit_dates || []).includes(date)).length
  );
  const max = Math.max(...counts, 1);
  const mount = document.querySelector('[data-registration-trend]');

  mount.innerHTML = dates.map(([date, label], index) => `
    <div class="tyf-bar">
      <span>${label}</span>
      <div class="tyf-bar-track"><div class="tyf-bar-fill" style="width:${Math.round((counts[index] / max) * 100)}%"></div></div>
      <strong>${counts[index]}</strong>
    </div>
  `).join('');
}

function renderLiveCheckins() {
  const registrationMap = new Map(state.registrations.map(row => [row.id, row]));
  const rows = [...state.checkins]
    .sort((a, b) => new Date(b.checked_in_at) - new Date(a.checked_in_at))
    .slice(0, 6);
  const mount = document.querySelector('[data-live-checkins]');

  if (!rows.length) {
    mount.innerHTML = '<p class="tyf-empty">No check-ins yet.</p>';
    return;
  }

  mount.innerHTML = rows.map(checkin => {
    const registration = registrationMap.get(checkin.registration_id);
    const visitor = registration?.visitors || {};
    return `
      <div class="tyf-live-row">
        <span class="tyf-live-time">${escapeHtml(formatTokyo(checkin.checked_in_at, { timeOnly: true }))}</span>
        <div>
          <div class="tyf-live-name">${escapeHtml(visitor.full_name || 'Visitor')}</div>
          <div class="tyf-live-company">${escapeHtml(visitor.company_name || '')}</div>
        </div>
        <span class="tyf-pill">${escapeHtml(checkin.checkin_kind || 'ENTRY')}</span>
      </div>
    `;
  }).join('');
}

function renderIndustryRanking() {
  const counts = new Map();
  state.registrations.forEach(row => {
    const industry = row.visitors?.industry || 'Not specified';
    counts.set(industry, (counts.get(industry) || 0) + 1);
  });

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const mount = document.querySelector('[data-industry-ranking]');
  if (!rows.length) {
    mount.innerHTML = '<p class="tyf-empty">No visitor data yet.</p>';
    return;
  }

  mount.innerHTML = rows.map(([industry, count], index) => `
    <div class="tyf-rank">
      <b>${String(index + 1).padStart(2, '0')}</b>
      <span title="${escapeHtml(industry)}">${escapeHtml(industry)}</span>
      <small>${count}</small>
    </div>
  `).join('');
}

function visitorMatchesFilters(row) {
  const query = (document.querySelector('[data-visitor-search]')?.value || '').trim().toLowerCase();
  const status = document.querySelector('[data-visitor-status]')?.value || 'all';
  const date = document.querySelector('[data-visitor-date]')?.value || 'all';
  const visitor = row.visitors || {};
  const checked = state.firstCheckin.has(row.id);

  const haystack = [
    row.registration_number,
    visitor.company_name,
    visitor.full_name,
    visitor.email,
    visitor.phone,
    visitor.industry
  ].join(' ').toLowerCase();

  if (query && !haystack.includes(query)) return false;
  if (status === 'checked' && !checked) return false;
  if (status === 'pending' && checked) return false;
  if (date !== 'all' && !(row.planned_visit_dates || []).includes(date)) return false;
  return true;
}

function renderVisitorTable() {
  const rows = state.registrations.filter(visitorMatchesFilters);
  const mount = document.querySelector('[data-visitor-rows]');
  const count = document.querySelector('[data-result-count]');
  if (count) count.textContent = `${rows.length} visitor${rows.length === 1 ? '' : 's'}`;

  if (!rows.length) {
    mount.innerHTML = '<tr><td colspan="7" class="tyf-empty">No matching visitors.</td></tr>';
    return;
  }

  mount.innerHTML = rows.map(row => {
    const visitor = row.visitors || {};
    const checkin = state.firstCheckin.get(row.id);
    return `
      <tr>
        <td>${escapeHtml(row.registration_number)}</td>
        <td><strong>${escapeHtml(visitor.company_name)}</strong></td>
        <td>${escapeHtml(visitor.full_name)}</td>
        <td>${escapeHtml(visitor.email)}</td>
        <td>${escapeHtml(visitor.industry)}</td>
        <td>${escapeHtml((row.planned_visit_dates || []).join(', '))}</td>
        <td>${checkin
          ? `<span class="tyf-status">CHECKED-IN<br>${escapeHtml(formatTokyo(checkin.checked_in_at))}</span>`
          : '<span class="tyf-status pending">PENDING</span>'}
        </td>
      </tr>
    `;
  }).join('');
}

function prepareExports() {
  window.__TYF_EXPORT_ROWS__ = state.registrations.map(row => {
    const visitor = row.visitors || {};
    return {
      'Registration No.': row.registration_number,
      'Registered At': formatTokyo(row.registered_at),
      'Company': visitor.company_name || '',
      'Name': visitor.full_name || '',
      'Email': visitor.email || '',
      'Phone': visitor.phone || '',
      'Industry': visitor.industry || '',
      'Planned Dates': (row.planned_visit_dates || []).join(', '),
      'First Check-in': formatTokyo(state.firstCheckin.get(row.id)?.checked_in_at),
      'Status': row.status
    };
  });
}

function exportCsv() {
  const rows = window.__TYF_EXPORT_ROWS__ || [];
  if (!rows.length) return showToast('No registration data.', true);
  const headers = Object.keys(rows[0]);
  const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = '\ufeff' + [
    headers.map(quote).join(','),
    ...rows.map(row => headers.map(header => quote(row[header])).join(','))
  ].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `TYF_AW2026_${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('CSV export completed.');
}

function exportExcel() {
  const rows = window.__TYF_EXPORT_ROWS__ || [];
  if (!rows.length) return showToast('No registration data.', true);
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 24 }, { wch: 19 }, { wch: 24 }, { wch: 22 }, { wch: 30 },
    { wch: 18 }, { wch: 20 }, { wch: 28 }, { wch: 24 }, { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Visitors');
  XLSX.writeFile(workbook, `TYF_AW2026_${new Date().toISOString().slice(0, 10)}.xlsx`);
  showToast('Excel export completed.');
}

async function loadDashboard({ quiet = false } = {}) {
  const refreshButton = document.querySelector('[data-action="refresh-dashboard"]');
  if (refreshButton) refreshButton.disabled = true;

  try {
    const [{ data: registrations, error: registrationError }, { data: checkins, error: checkinError }] =
      await Promise.all([
        supabase
          .from('registrations')
          .select(`
            id,registration_number,registered_at,planned_visit_dates,status,
            visitors(full_name,company_name,email,phone,industry)
          `)
          .order('registered_at', { ascending: false })
          .limit(5000),
        supabase
          .from('checkins')
          .select('registration_id,checked_in_at,checkin_kind,is_void')
          .eq('is_void', false)
          .order('checked_in_at', { ascending: false })
          .limit(10000)
      ]);

    if (registrationError) throw registrationError;
    if (checkinError) throw checkinError;

    state.registrations = registrations || [];
    state.checkins = checkins || [];
    buildFirstCheckinMap();
    updateMetrics();
    renderTrend();
    renderLiveCheckins();
    renderIndustryRanking();
    renderVisitorTable();
    prepareExports();

    if (!quiet) showToast('Dashboard updated.');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Dashboard data could not be loaded.', true);
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}

function initRealtime() {
  supabase
    .channel('tyf-admin-dashboard')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => loadDashboard({ quiet: true }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'checkins' }, () => loadDashboard({ quiet: true }))
    .subscribe();
}

function initClock() {
  const update = () => {
    const target = document.querySelector('[data-current-time]');
    if (target) target.textContent = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tokyo', weekday: 'long', hour: '2-digit', minute: '2-digit'
    }).format(new Date()) + ' JST';
  };
  update();
  setInterval(update, 30000);
}

function bindEvents() {
  document.querySelectorAll('[data-dashboard-view]').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.dashboardView));
  });
  document.querySelectorAll('[data-action="export-csv"]').forEach(button => button.addEventListener('click', exportCsv));
  document.querySelectorAll('[data-action="export-excel"]').forEach(button => button.addEventListener('click', exportExcel));
  document.querySelector('[data-action="refresh-dashboard"]')?.addEventListener('click', () => loadDashboard());
  document.querySelector('[data-action="staff-logout"]')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.href = '/staff-login.html';
  });

  ['[data-visitor-search]', '[data-visitor-status]', '[data-visitor-date]'].forEach(selector => {
    const element = document.querySelector(selector);
    element?.addEventListener(element.tagName === 'INPUT' ? 'input' : 'change', renderVisitorTable);
  });
}

async function init() {
  bindEvents();
  initClock();

  const auth = await getStaff();
  if (!auth) return;

  state.profile = auth.profile;
  document.querySelector('[data-staff-name]').textContent =
    `${auth.profile.display_name} · ${auth.profile.role}`;

  const isAdmin = auth.profile.role === 'admin';
  document.querySelectorAll('[data-admin-only]').forEach(element => {
    element.hidden = !isAdmin;
  });

  setView('dashboard');
  await loadDashboard({ quiet: true });
  initRealtime();
}

init();
