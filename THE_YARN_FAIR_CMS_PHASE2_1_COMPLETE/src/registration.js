function checkedValues(form, name) {
  return [...form.querySelectorAll(`[name="${name}"]:checked`)].map(el => el.value);
}

function field(form, name) {
  return form.elements.namedItem(name);
}

function value(form, name) {
  const element = field(form, name);
  return element && 'value' in element ? String(element.value).trim() : '';
}

function checked(form, name) {
  const element = field(form, name);
  return Boolean(element && 'checked' in element && element.checked);
}

function language() {
  return document.documentElement.lang === 'en' ? 'en' : 'ja';
}

function messageFor(code, lang) {
  const ja = lang === 'ja';
  const messages = {
    fullName_REQUIRED: ja ? '氏名を入力してください。' : 'Enter your name.',
    companyName_REQUIRED: ja ? '会社名を入力してください。' : 'Enter your company.',
    email_REQUIRED: ja ? 'メールアドレスを入力してください。' : 'Enter your email address.',
    phone_REQUIRED: ja ? '電話番号を入力してください。' : 'Enter your phone number.',
    industry_REQUIRED: ja ? '業種を選択してください。' : 'Select your industry.',
    INVALID_EMAIL: ja ? '正しいメールアドレスを入力してください。' : 'Enter a valid email address.',
    PRIVACY_CONSENT_REQUIRED: ja ? '個人情報の取扱いへの同意が必要です。' : 'Privacy consent is required.',
    VISIT_DATE_REQUIRED: ja ? '来場予定日を1日以上選択してください。' : 'Select at least one planned visit date.',
    ALREADY_REGISTERED: ja ? 'このメールアドレスは既に登録されています。' : 'This email address is already registered.',
    REQUEST_TIMEOUT: ja ? '通信がタイムアウトしました。もう一度お試しください。' : 'The request timed out. Please try again.',
    REGISTRATION_FAILED: ja ? '登録できませんでした。時間をおいて再度お試しください。' : 'Registration failed. Please try again later.'
  };
  return messages[code] || messages.REGISTRATION_FAILED;
}

const form = document.querySelector('#visitor-registration');
const status = document.querySelector('[data-registration-message]');

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const lang = language();
  const buttons = form.querySelectorAll('button[type="submit"]');
  const plannedVisitDates = checkedValues(form, 'planned_visit_dates');

  if (plannedVisitDates.length === 0) {
    status.className = 'status-message status-error';
    status.textContent = messageFor('VISIT_DATE_REQUIRED', lang);
    return;
  }

  buttons.forEach(button => { button.disabled = true; });
  status.className = 'status-message';
  status.textContent = lang === 'ja' ? '登録しています…' : 'Registering…';

  try {
    const payload = {
      fullName: value(form, 'full_name'),
      romanName: value(form, 'roman_name'),
      companyName: value(form, 'company_name'),
      companyNameEn: value(form, 'company_name_en'),
      department: value(form, 'department'),
      positionTitle: value(form, 'position_title'),
      email: value(form, 'email'),
      phone: value(form, 'phone'),
      countryRegion: value(form, 'country_region'),
      industry: value(form, 'industry'),
      language: lang,
      plannedVisitDates,
      interestMaterials: checkedValues(form, 'interest_materials'),
      organizerMessage: value(form, 'organizer_message'),
      privacyConsent: checked(form, 'privacy_consent'),
      marketingConsent: checked(form, 'marketing_consent'),
      // Honeypot is optional. An older page did not include this field.
      website: value(form, 'website')
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    const text = await response.text();
    let result = {};
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      throw Object.assign(new Error(text || `HTTP ${response.status}`), { code: 'REGISTRATION_FAILED' });
    }

    if (!response.ok) {
      throw Object.assign(new Error(result.message || result.error || `HTTP ${response.status}`), { code: result.error });
    }

    localStorage.setItem('tyf-registration-result', JSON.stringify({
      ...result,
      savedAt: Date.now()
    }));
    location.href = '/registration-complete.html';
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'REQUEST_TIMEOUT' : error?.code;
    status.className = 'status-message status-error';
    status.textContent = error?.message && error.message !== code && error.name !== 'AbortError'
      ? error.message
      : messageFor(code, lang);
    buttons.forEach(button => { button.disabled = false; });
    console.error('Visitor registration failed:', error);
  }
});
