import { supabase } from './supabase.js';

const mount = document.querySelector('[data-exhibitor-cms]');
let items = [];
let query = '';
let visibility = 'all';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalise(value) {
  return String(value ?? '').trim().toLowerCase();
}

function primaryContact(item) {
  const contacts = [...(item?.exhibitors?.exhibitor_contacts || [])].sort((a, b) =>
    Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) ||
    Number(a.display_order || 0) - Number(b.display_order || 0)
  );
  return contacts[0] || {};
}

async function token() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('ログインセッションがありません。再ログインしてください。');
  return session.access_token;
}

async function api(method, body, url = '/api/exhibitors') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${await token()}`
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let result = {};
    try { result = text ? JSON.parse(text) : {}; } catch { result = { message: text }; }
    if (!response.ok) throw new Error(result.message || result.error || `Operation failed (${response.status})`);
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('通信がタイムアウトしました。もう一度お試しください。');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function filteredItems() {
  return items.filter(item => {
    if (visibility === 'published' && !item.is_published) return false;
    if (visibility === 'hidden' && item.is_published) return false;
    if (!query) return true;
    const ex = item.exhibitors || {};
    const contact = primaryContact(item);
    const haystack = [
      ex.company_name,
      ex.company_name_local,
      ex.country_code,
      item.booth_code,
      contact.contact_name_local,
      contact.contact_name_en,
      contact.organization_label_local,
      contact.organization_label_en,
      contact.email
    ].map(normalise).join(' ');
    return haystack.includes(query);
  });
}

function statusBadge(published) {
  return published
    ? '<span class="cms-badge cms-badge-live">公開中</span>'
    : '<span class="cms-badge cms-badge-hidden">非公開</span>';
}

function form(item = {}) {
  const ex = item.exhibitors || {};
  const primary = primaryContact(item);
  const isNew = !item.id;
  return `
    <div class="cms-editor-head">
      <div>
        <p class="kicker">EXHIBITOR CMS</p>
        <h2>${isNew ? '出展社を追加' : `${esc(ex.company_name || '出展社')}を編集`}</h2>
      </div>
      <button class="btn" type="button" data-cancel>一覧へ戻る</button>
    </div>
    <form class="cms-form phase-card" data-cms-form novalidate>
      <input type="hidden" name="eventExhibitorId" value="${esc(item.id || '')}">
      <input type="hidden" name="exhibitorId" value="${esc(ex.id || '')}">
      <input type="hidden" name="contactId" value="${esc(primary.id || '')}">

      <fieldset class="cms-section">
        <legend>会社情報</legend>
        <div class="field-grid">
          <div class="field"><label>会社名（英字）<span class="required">必須</span></label><input name="companyName" required maxlength="180" value="${esc(ex.company_name || '')}"></div>
          <div class="field"><label>会社名（現地語／日本語）</label><input name="companyNameLocal" maxlength="180" value="${esc(ex.company_name_local || '')}"></div>
        </div>
        <div class="field-grid">
          <div class="field"><label>国コード（2文字）</label><input name="countryCode" maxlength="2" pattern="[A-Za-z]{2}" placeholder="IT / CN / JP" value="${esc(ex.country_code || '')}"></div>
          <div class="field"><label>Webサイト</label><input type="url" name="websiteUrl" placeholder="https://" maxlength="500" value="${esc(ex.website_url || '')}"></div>
        </div>
        <div class="field"><label>会社紹介（日本語）</label><textarea name="descriptionLocal" maxlength="5000">${esc(ex.description_local || '')}</textarea></div>
        <div class="field"><label>Company profile (English)</label><textarea name="descriptionEn" maxlength="5000">${esc(ex.description_en || '')}</textarea></div>
      </fieldset>

      <fieldset class="cms-section">
        <legend>展示会表示設定</legend>
        <div class="field-grid">
          <div class="field"><label>ブース番号</label><input name="boothCode" maxlength="50" value="${esc(item.booth_code || '')}"></div>
          <div class="field"><label>表示順</label><input type="number" min="0" step="1" name="displayOrder" value="${Number(item.display_order || 0)}"></div>
        </div>
        <div class="cms-checks">
          <label class="checkline"><input type="checkbox" name="isPublished" ${item.is_published !== false ? 'checked' : ''}> 公開サイトに表示する</label>
          <label class="checkline"><input type="checkbox" name="appointmentEnabled" ${item.appointment_enabled ? 'checked' : ''}> 商談予約を有効にする（将来機能）</label>
          <label class="checkline"><input type="checkbox" name="isActive" ${ex.is_active !== false ? 'checked' : ''}> 出展社マスターを有効にする</label>
        </div>
      </fieldset>

      <fieldset class="cms-section">
        <legend>主担当者</legend>
        <div class="field-grid">
          <div class="field"><label>担当者名（日本語／現地語）</label><input name="contactNameLocal" maxlength="180" value="${esc(primary.contact_name_local || '')}"></div>
          <div class="field"><label>Contact name (English)</label><input name="contactNameEn" maxlength="180" value="${esc(primary.contact_name_en || '')}"></div>
        </div>
        <div class="field-grid">
          <div class="field"><label>所属（日本語／現地語）</label><input name="organizationLocal" maxlength="180" value="${esc(primary.organization_label_local || '')}"></div>
          <div class="field"><label>Organization (English)</label><input name="organizationEn" maxlength="180" value="${esc(primary.organization_label_en || '')}"></div>
        </div>
        <div class="field-grid">
          <div class="field"><label>Email${primary.id ? '<span class="required">必須</span>' : ''}</label><input type="email" name="contactEmail" ${primary.id ? 'required' : ''} maxlength="254" value="${esc(primary.email || '')}"></div>
          <div class="field"><label>Phone</label><input name="contactPhone" maxlength="50" value="${esc(primary.phone || '')}"></div>
        </div>
      </fieldset>

      <div class="cms-sticky-actions">
        <p class="status-message" data-cms-message aria-live="polite"></p>
        <div class="phase-actions">
          <button class="btn" type="button" data-cancel>キャンセル</button>
          <button class="btn primary" type="submit" data-save>${isNew ? '出展社を追加' : '変更を保存'}</button>
        </div>
      </div>
    </form>`;
}

function renderList() {
  if (!mount) return;
  const rows = filteredItems();
  const publishedCount = items.filter(item => item.is_published).length;
  mount.innerHTML = `
    <div class="cms-toolbar phase-card">
      <div class="cms-summary">
        <strong>${items.length}</strong><span>登録社数</span>
        <strong>${publishedCount}</strong><span>公開中</span>
      </div>
      <div class="cms-controls">
        <label class="cms-search"><span class="sr-only">検索</span><input type="search" data-cms-search placeholder="会社名・担当者・メールで検索" value="${esc(query)}"></label>
        <select data-cms-visibility aria-label="公開状態">
          <option value="all" ${visibility === 'all' ? 'selected' : ''}>すべて</option>
          <option value="published" ${visibility === 'published' ? 'selected' : ''}>公開中</option>
          <option value="hidden" ${visibility === 'hidden' ? 'selected' : ''}>非公開</option>
        </select>
        <button class="btn primary" type="button" data-new-exhibitor>＋ 出展社を追加</button>
      </div>
    </div>

    ${rows.length ? `<div class="cms-company-list">
      ${rows.map(item => {
        const ex = item.exhibitors || {};
        const contact = primaryContact(item);
        const publicUrl = `/company.html?id=${encodeURIComponent(ex.id || '')}`;
        return `<article class="cms-company-row">
          <div class="cms-order">${Number(item.display_order || 0)}</div>
          <div class="cms-company-main">
            <div class="cms-company-title"><strong>${esc(ex.company_name || 'Untitled')}</strong>${statusBadge(item.is_published)}</div>
            <div class="cms-company-meta">
              ${ex.company_name_local ? `<span>${esc(ex.company_name_local)}</span>` : ''}
              ${item.booth_code ? `<span>Booth ${esc(item.booth_code)}</span>` : ''}
              ${ex.country_code ? `<span>${esc(ex.country_code)}</span>` : ''}
            </div>
            <div class="cms-contact-preview">
              <span>${esc(contact.contact_name_local || contact.contact_name_en || '担当者未登録')}</span>
              ${contact.email ? `<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>` : '<span class="cms-warning">メール未登録</span>'}
            </div>
          </div>
          <div class="cms-row-actions">
            <a class="btn compact" href="${publicUrl}" target="_blank" rel="noopener">公開ページ</a>
            <button class="btn compact" type="button" data-edit-id="${esc(item.id)}">編集</button>
            <button class="btn compact danger" type="button" data-delete="${esc(item.id)}">イベントから外す</button>
          </div>
        </article>`;
      }).join('')}
    </div>` : '<div class="phase-card"><p>該当する出展社がありません。</p></div>'}`;

  const search = mount.querySelector('[data-cms-search]');
  search?.addEventListener('input', event => {
    query = normalise(event.target.value);
    renderList();
    requestAnimationFrame(() => {
      const next = mount.querySelector('[data-cms-search]');
      next?.focus();
      next?.setSelectionRange(next.value.length, next.value.length);
    });
  });
  mount.querySelector('[data-cms-visibility]')?.addEventListener('change', event => {
    visibility = event.target.value;
    renderList();
  });
  mount.querySelector('[data-new-exhibitor]')?.addEventListener('click', () => showForm());
  mount.querySelectorAll('[data-edit-id]').forEach(button => button.addEventListener('click', () => {
    showForm(items.find(item => item.id === button.dataset.editId));
  }));
  mount.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => remove(button.dataset.delete)));
}

function showForm(item) {
  if (!mount) return;
  mount.innerHTML = form(item);
  mount.scrollIntoView({ behavior: 'smooth', block: 'start' });
  mount.querySelectorAll('[data-cancel]').forEach(button => button.addEventListener('click', renderList));
  const el = mount.querySelector('[data-cms-form]');
  el?.addEventListener('submit', async event => {
    event.preventDefault();
    const msg = el.querySelector('[data-cms-message]');
    const save = el.querySelector('[data-save]');
    msg.className = 'status-message';
    msg.textContent = '';
    if (!el.reportValidity()) return;

    const fd = new FormData(el);
    const body = Object.fromEntries(fd.entries());
    body.countryCode = String(body.countryCode || '').trim().toUpperCase();
    body.isPublished = fd.get('isPublished') === 'on';
    body.appointmentEnabled = fd.get('appointmentEnabled') === 'on';
    body.isActive = fd.get('isActive') === 'on';
    body.displayOrder = Number(body.displayOrder || 0);

    save.disabled = true;
    msg.textContent = '保存しています…';
    try {
      await api(body.eventExhibitorId ? 'PUT' : 'POST', body);
      msg.className = 'status-message status-success';
      msg.textContent = '保存しました。公開サイトへ即時反映されます。';
      await load(false);
    } catch (error) {
      msg.className = 'status-message status-error';
      msg.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  });
}

async function remove(id) {
  const item = items.find(row => row.id === id);
  const name = item?.exhibitors?.company_name || 'この出展社';
  if (!confirm(`${name}を今回の展示会一覧から外しますか？\n会社マスターと連絡先は削除されません。`)) return;
  try {
    await api('DELETE', null, `/api/exhibitors?eventExhibitorId=${encodeURIComponent(id)}`);
    await load();
  } catch (error) {
    alert(error.message);
  }
}

async function load(render = true) {
  if (!mount) return;
  if (render) mount.innerHTML = '<div class="phase-card"><p>出展社情報を読み込んでいます…</p></div>';
  try {
    const result = await api('GET');
    items = result.items || [];
    renderList();
  } catch (error) {
    mount.innerHTML = `<div class="phase-card"><p class="status-error">${esc(error.message)}</p><button class="btn" type="button" data-retry>再読み込み</button></div>`;
    mount.querySelector('[data-retry]')?.addEventListener('click', () => load());
  }
}

load();
