const readerEl = document.getElementById('qr-reader');
const statusEl = document.getElementById('status');
const startButton = document.getElementById('start');
const pairForm = document.getElementById('pair-form');
const pairButton = document.getElementById('pair-button');
const keyInput = document.getElementById('device-key');
let scanner = null;
let running = false;
let processing = false;
let authorized = false;
let eventOpen = false;
let wakeLock = null;
let lastQr = '';
let lastQrAt = 0;
let mirror = false;
try { localStorage.removeItem('selfCheckinMirror'); } catch { /* optional preference */ }
const messages = {
  DEVICE_NOT_AUTHORIZED: '端末設定が必要です\n主催者にお声がけください',
  EVENT_CLOSED: '現在は受付時間外です\n受付日は10月20〜22日です',
  INVALID_QR_CODE: 'QRコードを確認できません\n受付スタッフへお声がけください',
  invalid_registration: 'このQRコードは今回の展示会で使用できません\n受付スタッフへお声がけください',
  already_checked_in: 'すでに受付済みです\n再入場は受付スタッフへお声がけください',
  event_closed: '現在は受付時間外です\n受付スタッフへお声がけください',
  rate_limited: '少し時間をおいて再度お試しください',
  SERVICE_NOT_CONFIGURED: '受付の設定を確認しています\n受付スタッフへお声がけください',
  service_not_configured: '受付の設定を確認しています\n受付スタッフへお声がけください'
};
function show(message, type = 'info') {
  // Visitor data is always text, never HTML.
  statusEl.textContent = message;
  statusEl.className = type;
}
function applyMirror() { readerEl.classList.toggle('mirror', mirror); }
applyMirror();
async function api(input) {
  const response = await fetch('/api/checkin-self', {
    method: input ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
    headers: input ? { 'Content-Type': 'application/json' } : {},
    body: input ? JSON.stringify(input) : undefined,
    signal: AbortSignal.timeout(12000)
  });
  const data = await response.json();
  return data;
}
async function holdScreenAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } } catch { /* tablets also have an OS screen timeout setting */ }
}
async function refreshAuthorization() {
  try {
    const state = await api();
    if (state.error) {
      show(messages[state.error] || '受付システムに接続できません', 'error');
      return false;
    }
    authorized = state.authorized === true;
    eventOpen = state.eventOpen === true;
    pairForm.hidden = authorized;
    startButton.hidden = !authorized;
    startButton.textContent = eventOpen ? 'カメラを開始' : 'カメラをテスト';
    show(!authorized ? '主催者による端末設定が必要です' :
      eventOpen ? 'カメラを開始してください' : '端末設定済み\n会期前はカメラのテストのみできます');
    return authorized;
  } catch { show('通信を確認し、ページを再読み込みしてください', 'error'); return false; }
}
pairForm.addEventListener('submit', async event => {
  event.preventDefault();
  pairButton.disabled = true;
  let key = keyInput.value.trim();
  keyInput.value = '';
  try {
    const result = await api({ action: 'pair', device: document.getElementById('device').value, deviceKey: key });
    key = '';
    if (!result.authorized) { show(messages[result.error] || '端末設定に失敗しました', 'error'); return; }
    await refreshAuthorization();
  } catch { show('通信を確認して端末設定をやり直してください', 'error'); }
  finally { key = ''; keyInput.value = ''; pairButton.disabled = false; }
});
async function onScan(decodedText) {
  if (processing || !running) return;
  if (decodedText === lastQr && Date.now() - lastQrAt < 1000) {
    show('QRコードを読み取り中です…');
    return;
  }
  processing = true;
  lastQr = decodedText;
  lastQrAt = Date.now();
  try {
    scanner.pause(true);
    show('受付処理中です…');
    // Before the event, testing the camera must not create attendance records.
    if (!eventOpen) {
      show('QR読み取りを確認しました');
      const state = await api();
      eventOpen = state.eventOpen === true;
      if (!eventOpen) { show('QR読み取りを確認しました\n会期前のため受付は記録されません'); return; }
    }
    const result = await api({ action: 'checkin', qrToken: decodedText });
    if (result.status === 'success') show(`${result.companyName || ''}\n${result.fullName || ''} 様\n受付完了 ✓`, 'success');
    else {
      show(messages[result.error || result.status] || '受付処理に失敗しました\n受付スタッフへお声がけください', 'error');
      if (result.error === 'DEVICE_NOT_AUTHORIZED') {
        authorized = false;
        running = false;
        await scanner.stop();
        pairForm.hidden = false;
      }
    }
  } catch {
    // A timed-out request may have committed. Never claim success or submit an automatic retry.
    show('通信を確認できません\n受付スタッフへお声がけください', 'error');
  } finally {
    setTimeout(() => {
      try {
        if (running && scanner) {
          scanner.resume();
          show('QRコードをかざしてください');
        } else if (!authorized) show(messages.DEVICE_NOT_AUTHORIZED, 'error');
      } catch {
        running = false;
        startButton.disabled = false;
        startButton.hidden = !authorized;
        show('カメラを再度開始してください', 'error');
      }
      processing = false;
    }, 3000);
  }
}
async function startCamera() {
  if (!authorized || running || processing) return;
  startButton.disabled = true;
  show('カメラを起動しています…');
  try {
    if (typeof Html5Qrcode === 'undefined') throw new Error('QR library unavailable');
    // Use the software decoder consistently on Android, including flipped QR images.
    scanner ??= new Html5Qrcode('qr-reader', {
      useBarCodeDetectorIfSupported: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      verbose: false
    });
    await scanner.start({ facingMode: 'user' }, {
      // Scan the entire frame so the displayed QR cannot fall outside a cropped box.
      fps: 10, disableFlip: false,
      videoConstraints: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    }, onScan, () => {});
    running = true;
    applyMirror();
    startButton.hidden = true;
    await holdScreenAwake();
    show('QRコードをかざしてください');
  } catch {
    running = false;
    startButton.disabled = false;
    startButton.hidden = false;
    show('カメラを起動できません\nカメラの使用を許可してください', 'error');
  }
}
startButton.addEventListener('click', startCamera);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && running) holdScreenAwake();
});
// Resume a provisioned kiosk after reload; first camera permission is an organizer action.
if (await refreshAuthorization()) await startCamera();
