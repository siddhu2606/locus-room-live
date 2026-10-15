/* Headless-Chrome end-to-end check of room.html: node scripts/test_room_browser.js [url]  (serve the repo first: python -m http.server 8765) */
const { launch } = require('./cdp.js'); let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
(async () => {
  const b = await launch(process.argv[2] || 'http://localhost:8765/room.html'); await b.sleep(3000);
  ok(await b.ev(`__locus.stats.loc.length > 10`), 'engine runs and produces fixes');
  for (const v of ['iso', 'side', 'top']) { await b.ev(`document.querySelector('#views [data-v=${v}]').click()`); await b.sleep(900); }
  ok(await b.ev(`__locus.S.view.tilt > 85`), 'camera presets animate Top -> Angled -> Side -> Top');
  /* fake phone sensors: face north (alpha 0), 60 steps at 1.8 Hz */
  const r = JSON.parse(await b.ev(`(async()=>{ __locus.setSource('phone'); document.getElementById('b-sens').click(); await new Promise(r=>setTimeout(r,200)); const S=__locus.S; S.pos=[2.5,3.5];
    const ori=()=>window.dispatchEvent(Object.assign(new Event('deviceorientationabsolute'),{alpha:0,beta:5,gamma:0,absolute:true})); ori(); document.getElementById('b-align').click();
    for(let i=0;i<30;i++){ ori(); for(let k=0;k<28;k++){ const ev=new Event('devicemotion'); ev.accelerationIncludingGravity={x:.2,y:.1,z:9.81+3*Math.sin(2*Math.PI*1.8*(i*28+k)/50)}; Object.defineProperty(ev,'timeStamp',{value:(i*28+k)*20}); window.dispatchEvent(ev);} await new Promise(r=>setTimeout(r,2)); }
    return JSON.stringify({steps:S.steps,pos:S.pos}); })()`));
  ok(r.steps >= 25 && r.steps <= 35, `phone step counter: ${r.steps} steps from ~30 expected`); ok(r.pos[1] < 3.5 - 10 * 0.7 * 0.3 && Math.abs(r.pos[0] - 2.5) < 0.2, `walking north moves the dot up the map (y 3.5 -> ${r.pos[1].toFixed(2)})`);
  await b.ev(`document.querySelector('#spaces [data-sp=hospital]').click()`); await b.ev(`document.querySelector('#scorer [data-sc=ml]').click()`); await b.ev(`__locus.setSource('demo')`); await b.sleep(8000);
  ok(await b.ev(`__locus.S.space==='hospital' && __locus.stats.loc.length>20 && __locus.stats.loc.slice(-30).reduce((a,c)=>a+c,0)/30 < 3`), 'hospital map + ML trust scorer tracks (<3 m mean)');
  ok(!b.logs.length, 'no console errors' + (b.logs.length ? ': ' + b.logs.join(' | ') : '')); b.close(); console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
})();
