const m=document.querySelector('[data-registration-complete]');
const r=JSON.parse(sessionStorage.getItem('tyf-registration-result')||'null'),en=document.documentElement.lang==='en';
m.innerHTML=!r?(en?'<p>No registration result is available.</p>':'<p>登録結果がありません。</p>'):
`<div class="qr-result"><h1>${en?'Registration complete':'来場登録が完了しました'}</h1>
<p><strong>${en?'Registration No.':'受付番号'}:</strong><br>${r.registrationNumber}</p>
<img src="${r.qrDataUrl}" alt="Visitor QR code"><p>${en?'Please present this QR code at reception.':'会場受付でこのQRコードをご提示ください。'}</p>
<p>${r.emailSent?(en?'A confirmation email has been sent.':'登録完了メールを送信しました。'):(en?'Registration succeeded. Email is not configured yet.':'登録は完了しました。メール配信は未設定です。')}</p></div>`;
