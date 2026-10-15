/* two headless browsers: A shares, B joins by link; phone-like source on A moves the dot on B; settings sync back. Needs internet (PeerJS cloud + CDN). */
const { launch } = require('./cdp.js'); let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const url = process.argv[2] || 'http://localhost:8765/room.html';
  const A = await launch(url, 1100, 800); await A.sleep(2500);
  ok(await A.ev(`typeof Peer !== 'undefined'`), 'PeerJS loaded from CDN');
  await A.ev(`document.getElementById('b-share').click()`); let code; for (let i = 0; i < 30 && !code; i++) { await A.sleep(1000); code = await A.ev(`(document.getElementById('i-url').value.match(/join=([0-9]{4})/)||[])[1]`); } ok(!!code, 'host got code ' + code);
  const B = await launch(url + '#join=' + code, 400, 800, true); for (let i = 0; i < 25; i++) { await B.sleep(1000); if (/Connected/.test(await B.ev(`document.getElementById('n-sync').textContent`))) break; }
  const st = await B.ev(`document.getElementById('n-sync').textContent`); ok(/Connected/.test(st), 'viewer connected: ' + st);
  await A.ev(`__locus.setSource('touch'); __locus.S.pos=[1.2,3.1]`); await B.sleep(1500);
  const bp = JSON.parse(await B.ev(`JSON.stringify({src:__locus.S.src,pos:__locus.S.pos})`)); ok(bp.src === 'remote' && Math.abs(bp.pos[0] - 1.2) < 0.15 && Math.abs(bp.pos[1] - 3.1) < 0.15, 'dot on B follows A: ' + JSON.stringify(bp));
  await B.ev(`__locus.S.obstruct.add('A2'); __locus.S.W=6.5; __locus.rebuild(false)`); await B.sleep(1800);
  const ap = JSON.parse(await A.ev(`JSON.stringify({o:[...__locus.S.obstruct],W:__locus.S.W})`)); ok(ap.o.includes('A2') && ap.W === 6.5, 'settings from B reach A: ' + JSON.stringify(ap));
  ok(!A.logs.length && !B.logs.length, 'no console errors ' + [...A.logs, ...B.logs].join('|')); A.close(); B.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})();
