function checkedValues(form, name) {
  return [...form.querySelectorAll(`[name="${name}"]:checked`)].map(el => el.value);
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

  const payload = {
    fullName: form.full_name.value,
    romanName: form.roman_name.value,
    companyName: form.company_name.value,
    companyNameEn: form.company_name_en.value,
    department: form.department.value,
    positionTitle: form.position_title.value,
    email: form.email.value,
    phone: form.phone.value,
    countryRegion: form.country_region.value,
    industry: form.industry.value,
    language: lang,
    plannedVisitDates,
    interestMaterials: checkedValues(form, 'interest_materials'),
    organizerMessage: form.organizer_message.value,
    privacyConsent: form.privacy_consent.checked,
    marketingConsent: form.marketing_consent.checked,
    website: form.website.value
  };

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw Object.assign(new Error(result.message || result.error), { code: result.error });
    }

    localStorage.setItem('tyf-registration-result', JSON.stringify({
      ...result,
      savedAt: Date.now()
    }));
    location.href = '/registration-complete.html';
  } catch (error) {
    status.className = 'status-message status-error';
    status.textContent = error.message && error.message !== error.code
      ? error.message
      : messageFor(error.code, lang);
    buttons.forEach(button => { button.disabled = false; });
  }
});
