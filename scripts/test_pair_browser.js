/* Live Room (laptop) + Phone page (mobile) paired over PeerJS. Needs internet. node scripts/test_pair_browser.js [baseUrl] */
const { launch } = require('./cdp.js'); let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const base = process.argv[2] || 'http://localhost:8765/';
  const A = await launch(base + 'room.html', 1200, 820); let code = '';
  for (let i = 0; i < 30 && !/^[0-9]{4}$/.test(code); i++) { await A.sleep(1000); code = await A.ev(`document.getElementById('pc').textContent`); }
  ok(/^[0-9]{4}$/.test(code), 'Live Room auto-hosts and shows code ' + code);
  const B = await launch(base + 'phone.html#join=' + code, 400, 860, true);
  let st = ''; for (let i = 0; i < 25; i++) { await B.sleep(1000); st = await B.ev(`document.getElementById('pill-t').textContent`); if (/Room/.test(st)) break; }
  ok(/Room/.test(st), 'phone page paired: ' + st); await B.sleep(1500);
  ok(await B.ev(`__phone.P.gotCfg && __phone.P.anchors.length>=3`), 'phone received room config + anchors');
  ok(/connected/i.test(await A.ev(`document.getElementById('pt').textContent`)), 'room shows "phone connected"');
  /* phone: fake sensors, align facing north, walk 20 steps */
  await B.ev(`(async()=>{ document.getElementById('b-sens').click(); await new Promise(r=>setTimeout(r,300));
    const ori=()=>window.dispatchEvent(Object.assign(new Event('deviceorientationabsolute'),{alpha:0,beta:5,gamma:0,absolute:true})); ori(); document.getElementById('b-align').click(); __phone.P.pos=[2.5,3.4]; __phone.P.stepLen=0.5;
    for(let i=0;i<20;i++){ ori(); for(let k=0;k<33;k++){ const ev=new Event('devicemotion'); ev.accelerationIncludingGravity={x:.2,y:.1,z:9.81+2.5*Math.sin(2*Math.PI*1.8*(i*33+k)/60)}; Object.defineProperty(ev,'timeStamp',{value:(i*33+k)*1000/60}); window.dispatchEvent(ev);} await new Promise(r=>setTimeout(r,4)); } })()`);
  await B.sleep(1500);
  const bp = JSON.parse(await B.ev(`JSON.stringify({pos:__phone.P.pos,steps:__phone.P.steps,err:__phone.P.err})`)), ap = JSON.parse(await A.ev(`JSON.stringify({src:__locus.S.src,pos:__locus.S.pos})`));
  ok(bp.steps >= 15 && bp.pos[1] < 3.4 - 2, `phone counted ${bp.steps} steps and moved north: ${bp.pos.map(v => v.toFixed(2))}`);
  ok(ap.src === 'remote' && Math.hypot(ap.pos[0] - bp.pos[0], ap.pos[1] - bp.pos[1]) < 0.3, `Live Room dot follows the phone: ${ap.pos.map(v => v.toFixed(2))}`);
  ok(bp.err != null, 'phone receives LOCUS error back from the room: ' + (bp.err && bp.err.toFixed(2)) + ' m');
  await B.ev(`document.querySelector('#zpre [data-z="2.0"]').click()`); await B.sleep(1200);
  ok(await A.ev(`Math.abs(__locus.S.zDev-2.0)<0.01`), 'phone height patch reaches the room (zDev=2.0)');
  await A.ev(`document.querySelector('#spaces [data-sp=hospital]').click()`); await B.sleep(2500);
  ok(await B.ev(`__phone.P.space==='hospital' && __phone.P.W===40`), 'switching the room to Hospital updates the phone map');
  await A.shot('docs/shot_pair_room.png'); await B.shot('docs/shot_pair_phone.png');
  ok(!A.logs.length && !B.logs.length, 'no console errors ' + [...A.logs, ...B.logs].join(' | ')); A.close(); B.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})();
