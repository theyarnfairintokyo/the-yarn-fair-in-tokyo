import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/self-checkin.js', import.meta.url), 'utf8');
async function fixture({ eventOpen = true, result = { status: 'success', companyName: '<Company>', fullName: '<Visitor>' }, failure = false } = {}) {
  const elements = new Map();
  const timers = [], calls = [];
  let callback;
  let paused = 0, resumed = 0;
  for (const id of ['qr-reader','status','start','mirror-toggle','pair-form','pair-button','device-key','device']) {
    elements.set(id, { textContent: '', className: '', classList: { toggle() {} }, style: {}, clientWidth: 500, hidden: false,
      addEventListener() {}, value: '' });
  }
  class Scanner {
    async start(_camera, _settings, scan) { callback = scan; }
    pause() { paused++; }
    resume() { resumed++; }
    async stop() {}
  }
  const context = vm.createContext({
    document: { getElementById: id => elements.get(id), addEventListener() {}, visibilityState: 'visible' },
    localStorage: { getItem: () => null, setItem() {} }, navigator: {}, Html5Qrcode: Scanner,
    AbortSignal, Date, setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
    fetch: async (_url, args) => {
      if (args.method === 'GET') return { json: async () => ({ authorized: true, eventOpen }) };
      calls.push(JSON.parse(args.body));
      if (failure) throw new Error('network');
      return { json: async () => result };
    }
  });
  await vm.runInContext(`(async () => {${source}\n})()`, context);
  return { elements, timers, calls, scan: text => callback(text), state: () => ({ paused, resumed }) };
}
test('one submission at a time, safe text display, and resume/clear after exactly 3 seconds', async () => {
  const f = await fixture();
  await Promise.all([f.scan('QR-A'), f.scan('QR-B')]);
  assert.equal(f.calls.length, 1);
  assert.equal(f.elements.get('status').textContent, '<Company>\n<Visitor> 様\n受付完了 ✓');
  assert.equal(f.state().paused, 1);
  assert.equal(f.timers[0].ms, 3000);
  f.timers[0].fn();
  assert.equal(f.state().resumed, 1);
  assert.equal(f.elements.get('status').textContent, 'QRコードをかざしてください');
  await f.scan('QR-A');
  assert.equal(f.calls.length, 1, 'same code still held at camera is briefly suppressed');
  await f.scan('QR-B');
  assert.equal(f.calls.length, 2);
});
test('camera test before event never posts attendance', async () => {
  const f = await fixture({ eventOpen: false });
  await f.scan('QR-A');
  assert.equal(f.calls.length, 0);
  assert.match(f.elements.get('status').textContent, /受付は記録されません/);
  f.timers[0].fn();
  assert.equal(f.state().resumed, 1);
});
test('network failure does not claim success or automatically retry and scanning recovers', async () => {
  const f = await fixture({ failure: true });
  await f.scan('QR-A');
  assert.equal(f.calls.length, 1);
  assert.match(f.elements.get('status').textContent, /通信を確認できません/);
  f.timers[0].fn();
  assert.equal(f.calls.length, 1);
  assert.equal(f.state().resumed, 1);
});
test('duplicates show a staff re-entry direction and automatically recover', async () => {
  const f = await fixture({ result: { status: 'already_checked_in' } });
  await f.scan('QR-A');
  assert.match(f.elements.get('status').textContent, /すでに受付済み/);
  f.timers[0].fn();
  assert.equal(f.state().resumed, 1);
});
