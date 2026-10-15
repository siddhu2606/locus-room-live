/* Node tests for Room Live: node scripts/test_room.js */
const E = require('../src/engine.js'), C = require('../src/room_core.js'), { trustPredict } = require('../src/trust_model.js');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const near = (a, b, t) => Math.abs(a - b) <= t;

/* 1 step detector across sensor rates, carrying styles and noise (real phones differ a lot) */
{ const rng = E.rngMake(3); const run = (hz, amp, f, secs, noise, still) => { const sd = new C.StepDetector(); let n = 0; for (let i = 0; i < hz * secs; i++) { const t = i * 1000 / hz; const w = still ? amp * Math.sin(2 * Math.PI * 8 * t / 1000) : amp * Math.sin(2 * Math.PI * f * t / 1000) + 0.35 * amp * Math.sin(2 * Math.PI * 2 * f * t / 1000 + 1); if (sd.push(0.4 + noise * rng.g(), 0.2 + noise * rng.g(), 9.81 + w + noise * rng.g(), t)) n++; } return n; };
  for (const [hz, amp] of [[20, 2.5], [60, 2.5], [100, 2.5], [60, 1.0], [60, 5], [50, 0.7]]) { const n = run(hz, amp, 1.8, 20, 0.15, false); ok(Math.abs(n - 36) <= 4, `walking ${hz} Hz amp ${amp} m/s2: ${n} steps (expect ~36)`); }
  const slow = run(60, 2, 1.3, 20, .15, false); ok(Math.abs(slow - 26) <= 4, `slow walk 1.3 Hz: ${slow} steps (expect ~26)`);
  const m = run(60, 0.25, 0, 20, .1, true); ok(m <= 2, `hand tremor / standing still: ${m} false steps`); }
/* 2 heading */
ok(near(C.headingFromEuler(0, 0, 0), 0, 1e-6), 'flat phone alpha 0 -> north');
ok(near(C.headingFromEuler(90, 0, 0), 270, 1e-6), 'flat phone alpha 90 -> west');
ok(near(C.headingFromEuler(0, 90, 0), 0, 1e-6) || near(C.headingFromEuler(0, 90, 0), 360, 1e-6), 'upright phone alpha 0 -> camera north');
ok(near(Math.abs(C.angDiff(350, 10)), 20, 1e-9), 'angDiff wraps');
/* 3 view roundtrip */
{ const v = { tilt: 50, yaw: 30, cx: 2, cy: 2, cz: 1, ox: 300, oy: 200, s: 60 }, V = C.makeView(v); const p = V.P(3.1, 1.2, 0); const u = V.U(p[0], p[1], 0);
  ok(near(u[0], 3.1, 1e-6) && near(u[1], 1.2, 1e-6), 'screen<->floor unprojection roundtrip'); }

/* 4 room engine: 5 x 4 x 2.7 m room, 5 anchors at mixed heights, phone walking a loop */
function runRoom({ n = 5, scorer = null, assumed = null, seed = 5, sigma = 0.25, steps = 400 }) {
  const W = 5, H = 4, ZH = 2.7, all = [{ id: 'A1', x: .3, y: .3, z: .4 }, { id: 'A2', x: 4.7, y: .3, z: 2.3 }, { id: 'A3', x: 4.7, y: 3.7, z: .4 }, { id: 'A4', x: .3, y: 3.7, z: 2.3 }, { id: 'A5', x: 2.5, y: .2, z: 1.2 }, { id: 'A6', x: 2.5, y: 3.8, z: 2.4 }];
  const an = all.slice(0, n); E.setRoom(W, H, an);
  const rng = E.rngMake(seed), loc = new E.Locus(E.ANCHORS, { N: 400, sigma: .3, rng: E.rngMake(11), inflate: 1, scorer });
  const cfg = { model: 'add', sigma, loss: .08, wallBias: 1.2, burst: 0, rssi1m: -40, n: 2.2, dead: new Set(), obstruct: new Set(), drift: new Set(), obstructBias: 1.2, driftBias: .8 };
  const zDev = 1.3, errs = [], ls = [], zs = []; let last = [2.5, 2]; const kf = new E.KalmanCV();
  for (let i = 0; i < steps; i++) {
    const th = i * 0.05, tr = [2.5 + 1.6 * Math.cos(th), 2 + 1.2 * Math.sin(th * 1.3)];
    const m3 = C.measure3D(tr, zDev, assumed == null ? zDev : assumed, an, cfg, rng, E.wallsBetween);
    const f = E.lsFix(E.ANCHORS, m3, last); if (f) last = f; kf.update(f, .1);
    const o = loc.step(m3, .1); if (!o) continue;
    if (i > 60) { errs.push(Math.hypot(o.pos[0] - tr[0], o.pos[1] - tr[1])); if (f) ls.push(Math.hypot(f[0] - tr[0], f[1] - tr[1]));
      const w = o.trust.map((t, j) => o.usable[j] ? t * t : 0), p3 = C.fix3D(an, m3, [o.pos[0], o.pos[1], 1.2], w, { w: W, h: H, z: ZH }, 1.2, .3); if (p3) zs.push(Math.abs(p3[2] - zDev)); }
  }
  const med = a => a.sort((x, y) => x - y)[a.length >> 1];
  return { loc: med(errs), ls: med(ls), z: zs.length ? med(zs) : null };
}
const a = runRoom({});
ok(a.loc < 0.8 && a.loc < a.ls, `room: LOCUS median ${a.loc.toFixed(2)} m < plain LS ${a.ls.toFixed(2)} m`);
ok(a.z !== null && a.z < 0.6, `room: height estimate median error ${a.z && a.z.toFixed(2)} m`);
const b = runRoom({ n: 3 }); ok(b.loc < 1.5, `room: 3 anchors still tracks (${b.loc.toFixed(2)} m), height needs >=4 -> ${b.z === null ? 'n/a (correct)' : b.z}`);
const c = runRoom({ assumed: 0.0 }); ok(c.loc > a.loc * 0.95, `wrong assumed height hurts (${c.loc.toFixed(2)} vs ${a.loc.toFixed(2)} m)`);
const d = runRoom({ scorer: trustPredict }); ok(d.loc < 1.5, `room with ML trust scorer runs (${d.loc.toFixed(2)} m)`);

/* 5 hospital + ML scorer in distribution */
function runHosp(scorer) {
  E.setSite('hospital'); const an = E.DROP_ORDER.map(i => E.ANCHORS[i]).slice(0, 6), rng = E.rngMake(3), w = new E.Walker(1.2, 6), loc = new E.Locus(an, { N: 400, sigma: .6, rng: E.rngMake(11), inflate: 1, scorer });
  const cfg = { model: 'add', sigma: .8, loss: .1, wallBias: 1.8, burst: .004, rssi1m: -40, n: 2.2, dead: new Set(), obstruct: new Set(), drift: new Set() }, errs = [];
  for (let i = 0; i < 500; i++) { const tr = w.step(.1).slice(), m3 = C.measure3D(tr, 1.3, 1.3, an.map(a => ({ ...a, z: 1.3 })), cfg, rng, E.wallsBetween), o = loc.step(m3, .1); if (o && i > 60) errs.push(Math.hypot(o.pos[0] - tr[0], o.pos[1] - tr[1])); }
  return errs.sort((x, y) => x - y)[errs.length >> 1];
}
const h0 = runHosp(null), h1 = runHosp(trustPredict); ok(h0 < 4 && h1 < 5, `hospital: heuristic ${h0.toFixed(2)} m, ML scorer ${h1.toFixed(2)} m`);
/* 6 NaN peer feature (single anchor) must not crash */
ok(isFinite(trustPredict([0, 0, 0, 0, 0, 0, 0, 0, 1, 5, 5, NaN, 1, 1.4])), 'ML scorer handles NaN peer residual');
console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
