/* Headless-Chrome end-to-end check of room.html: node scripts/test_room_browser.js [url]  (serve the repo first: python -m http.server 8765)
   Also starts a mock LOCUS Beacon receiver on :8766 (same /api/samples API as the Android app) to test Receiver phone mode. */
const http = require('http');
const { launch } = require('./cdp.js'); let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
/* mock receiver: person stands at (1.5, 1.2) in a 5 x 4 room with beacons 1-4 in the square preset, -59 dBm at 1 m, n = 2.2, 4 dB noise */
const B = [[.3, .3], [4.7, .3], [4.7, 3.7], [.3, 3.7]], Z = [0.4, 2.35, 0.4, 2.35], who = [1.5, 1.2]; let seq = 0, buf = [];
setInterval(() => { B.forEach((b, i) => { const d = Math.max(0.3, Math.hypot(who[0] - b[0], who[1] - b[1], 1.3 - Z[i])), g = Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(6.283 * Math.random()); buf.push([++seq, i + 1, Math.round(-59 - 22 * Math.log10(d) + 4 * g), Date.now()]); }); if (buf.length > 2000) buf = buf.slice(-1000); }, 100);
const mock = http.createServer((q, r) => { const since = +(new URL(q.url, 'http://x').searchParams.get('since') || 0), now = Date.now(); r.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); r.end(JSON.stringify({ seq, device: 'mock', samples: buf.filter(s => s[0] > since).map(s => [s[0], s[1], s[2], now - s[3]]) })); }).listen(8766);
(async () => {
  const b = await launch(process.argv[2] || 'http://localhost:8765/room.html'); await b.sleep(3000);
  ok(await b.ev(`__locus.stats.loc.length > 10`), 'engine runs and produces fixes');
  ok(await b.ev(`!document.querySelector('[data-t=track]') && document.querySelector('.tabs [aria-selected=true]').dataset.t === 'beacons'`), 'Track tab removed, Beacons tab is first');
  for (const v of ['iso', 'side', 'top']) { await b.ev(`document.querySelector('#views [data-v=${v}]').click()`); await b.sleep(900); }
  ok(await b.ev(`__locus.S.view.tilt > 85`), 'camera presets animate Top -> Angled -> Side -> Top');
  for (const k of [2, 3, 6, 4]) { await b.ev(`document.querySelector('#lays [data-lay="${k}"]').click()`); await b.sleep(300); ok(await b.ev(`__locus.S.anchors.length === ${k} && document.querySelectorAll('#bt input[type=checkbox]:checked').length === ${k} && document.querySelector('#lays .on').dataset.lay === '${k}'`), `preset ${k} beacons`); }
  await b.sleep(4000);
  ok(await b.ev(`document.querySelector('#bt tr .c-r').textContent.includes('dBm') && parseFloat(document.querySelector('#bt tr .tb i').style.width) > 0`), 'table shows RSSI, range and trust');
  ok(await b.ev(`[...document.querySelectorAll('#bt tr')].slice(0,4).every(tr => tr.querySelector('.hd.ok, .hd.warn'))`), 'health dots for active beacons');
  await b.ev(`document.querySelectorAll('#bt input[type=checkbox]')[3].click()`); await b.sleep(400);
  ok(await b.ev(`__locus.S.anchors.length === 3 && __locus.S.anchors.every(a => a.b !== 4)`), 'unticking beacon 4 drops it from the engine');
  await b.ev(`document.querySelectorAll('#bt input[type=checkbox]')[3].click()`);
  await b.ev(`(()=>{ const S=__locus.S; S.sel=0; document.querySelector('#faults [data-f=dead]').click(); })()`); await b.sleep(4500);
  ok(await b.ev(`document.querySelector('#bt tr .hd').classList.contains('bad') && /Beacon 1: no packets/.test(document.getElementById('warn').textContent)`), 'killed beacon shows red dot + "no packets" warning');
  await b.ev(`document.querySelector('#faults [data-f=clear]').click()`);
  await b.ev(`document.querySelectorAll('#bt .cal')[1].click()`); await b.sleep(3600);
  ok(await b.ev(`/dBm/.test(document.querySelectorAll('#bt .cal')[1].textContent) && Math.abs(__locus.S.all[1].p1 + 59) <= 6`), '1 m calibration in demo stores ~-59 dBm: ' + await b.ev(`__locus.S.all[1].p1`));
  await b.ev(`document.getElementById('b-gcal').click()`); ok(await b.ev(`getComputedStyle(document.getElementById('gcal')).display !== 'none' && /Beacon 1 \\(1 of 4\\)/.test(document.getElementById('g-title').textContent)`), 'guided calibration opens on beacon 1 of 4');
  await b.ev(`document.getElementById('g-stop').click()`);
  /* receiver phone mode against the mock */
  await b.ev(`document.getElementById('b-live').click(); document.getElementById('i-host').value='localhost:8766'; document.getElementById('b-conn').click()`); await b.sleep(6000);
  const pos = JSON.parse(await b.ev(`JSON.stringify(__locus.cur.out && __locus.cur.out.pos)`));
  ok(await b.ev(`__locus.S.link && /Real BLE · 4/.test(document.getElementById('p-mode').textContent)`), 'receiver link up, 4 beacons heard');
  ok(pos && Math.hypot(pos[0] - 1.5, pos[1] - 1.2) < 1.5, `live estimate near the mock person (1.5, 1.2): ${pos && pos.map(v => v.toFixed(2))}`);
  await b.ev(`__locus.logTap([1.5, 1.2])`); ok(await b.ev(`__locus.stats.loc.length === 1`), 'tap logs one ground-truth sample in receiver mode');
  await b.ev(`document.getElementById('b-demo').click()`); await b.sleep(1500);
  await b.ev(`document.querySelector('#spaces [data-sp=hospital]').click()`); await b.ev(`document.querySelector('#scorer [data-sc=ml]').click()`); await b.sleep(8000);
  ok(await b.ev(`__locus.S.space==='hospital' && __locus.stats.loc.length>20 && __locus.stats.loc.slice(-30).reduce((a,c)=>a+c,0)/30 < 3`), 'hospital map + ML trust scorer tracks (<3 m mean)');
  ok(!b.logs.length, 'no console errors' + (b.logs.length ? ': ' + b.logs.join(' | ') : '')); b.close(); mock.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})();
