const mount = document.querySelector('[data-registration-complete]');
const lang = document.documentElement.lang === 'en' ? 'en' : 'ja';
let result = null;

try {
  result = JSON.parse(localStorage.getItem('tyf-registration-result') || 'null');
  if (result && Date.now() - Number(result.savedAt || 0) > 24 * 60 * 60 * 1000) {
    result = null;
    localStorage.removeItem('tyf-registration-result');
  }
} catch {
  result = null;
}

if (!result) {
  mount.innerHTML = lang === 'en'
    ? '<p>No recent registration result is available in this browser.</p>'
    : '<p>このブラウザには直近の登録結果がありません。</p>';
} else {
  mount.innerHTML = `
    <div class="qr-result">
      <h1>${lang === 'en' ? 'Registration complete' : '来場登録が完了しました'}</h1>
      <p><strong>${lang === 'en' ? 'Registration No.' : '受付番号'}:</strong><br>${result.registrationNumber}</p>
      <img id="visitor-qr-image" src="${result.qrDataUrl}" alt="Visitor QR code">
      <p>${lang === 'en' ? 'Please present this QR code at reception.' : '会場受付でこのQRコードをご提示ください。'}</p>
      <div class="phase-actions" style="justify-content:center">
        <button class="btn" id="save-qr" type="button">${lang === 'en' ? 'SAVE QR' : 'QRを保存'}</button>
        <button class="btn" type="button" onclick="window.print()">${lang === 'en' ? 'PRINT' : '印刷'}</button>
      </div>
      <p>${result.emailSent
        ? (lang === 'en' ? 'A confirmation email has been sent.' : '登録完了メールを送信しました。')
        : (lang === 'en' ? 'Registration succeeded. Confirmation email is not enabled yet.' : '登録は完了しました。確認メールはまだ有効化されていません。')}</p>
    </div>`;

  document.querySelector('#save-qr')?.addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = result.qrDataUrl;
    link.download = `THE-YARN-FAIR-${result.registrationNumber}.png`;
    link.click();
  });
}
