/* ===== LOCUS Room Live - app: phone-driven truth -> simulated 3D radio -> LOCUS engine -> 3D view ===== */
const $ = id => document.getElementById(id);
const LS_KEY = 'locus.room.v1';
const COL = { truth: '#0B3A4A', locus: '#10B981', ls: '#F5A524', kf: '#8B5CF6', pt: '#22C3E6', dead: '#9AA9B0', obs: '#F5A524', drift: '#8B5CF6' };
const S = {
  space: 'room', W: 5, H: 4, Z: 2.7, n: 5, zDev: 1.3, zKnow: true, zAssume: 1.3, partition: false,
  src: 'demo', pos: [2.5, 2], trail: [], showTrail: true, heading: null, align: 0, fine: 0, stepLen: 0.7, scale: 1, steps: 0,
  anchors: [], sel: 0, dead: new Set(), obstruct: new Set(), drift: new Set(),
  model: 'rssi', sigDb: 4, sigM: 0.6, loss: 0.1, rssi1m: -59, pn: 2.2, scorer: 'heuristic',
  view: { tilt: 90, yaw: 0, zoom: 1 }, show: { truth: true, locus: true, ls: true, kf: false, pt: true },
};
try { const j = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); ['W', 'H', 'Z', 'n', 'zDev', 'model', 'sigDb', 'loss', 'rssi1m', 'pn', 'stepLen', 'scale'].forEach(k => { if (j[k] != null) S[k] = j[k]; }); } catch (e) { }
const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(['W', 'H', 'Z', 'n', 'zDev', 'model', 'sigDb', 'loss', 'rssi1m', 'pn', 'stepLen', 'scale'].map(k => [k, S[k]])))); } catch (e) { } };

/* ---------- space / anchors ---------- */
function defaultRoomAnchors() {
  const W = S.W, H = S.H, Z = S.Z, m = 0.3, lo = 0.4, hi = Math.max(1.2, Z - 0.35);
  return [{ id: 'A1', x: m, y: m, z: lo }, { id: 'A2', x: W - m, y: m, z: hi }, { id: 'A3', x: W - m, y: H - m, z: lo }, { id: 'A4', x: m, y: H - m, z: hi },
  { id: 'A5', x: W / 2, y: m, z: Math.min(1.4, hi) }, { id: 'A6', x: W / 2, y: H - m, z: hi }];
}
let eng = null, last = null;
function partitions() { return S.partition && S.space === 'room' ? [[S.W / 2, 0, S.W / 2, S.H * 0.36], [S.W / 2, S.H * 0.64, S.W / 2, S.H]] : []; }
function rebuild(keepAnchors) {
  if (S.space === 'hospital') {
    setSite('hospital'); S.Z = 3; S.W = FLOOR.w; S.H = FLOOR.h;
    const base = DROP_ORDER.map(i => ANCHORS[i]);
    S.anchors = base.map((a, i) => ({ id: a.id, x: a.x, y: a.y, z: i % 2 ? 0.9 : 2.6 }));
  } else {
    const all = (keepAnchors && S.all) ? S.all : defaultRoomAnchors();
    S.anchors = all.map(a => ({ ...a, x: Math.min(S.W - .1, Math.max(.1, a.x)), y: Math.min(S.H - .1, Math.max(.1, a.y)), z: Math.min(S.Z, Math.max(0, a.z)) }));
    setRoom(S.W, S.H, S.anchors, partitions());
  }
  S.all = S.anchors; S.anchors = S.all.slice(0, S.n);
  if (S.space === 'hospital') { /* engine uses the hospital walls; anchors already in drop order */ }
  S.pos = [Math.min(S.W - .2, Math.max(.2, S.pos[0])), Math.min(S.H - .2, Math.max(.2, S.pos[1]))];
  if (S.space === 'hospital' && (S.pos[0] < 1 || S.pos[1] < 1)) S.pos = [3, 12];
  newEngine(); S.trail = []; S.sel = Math.min(S.sel, S.n - 1);
  fitView();
}
function newEngine() {
  const sc = S.scorer === 'ml' ? trustPredict : null;
  eng = { loc: new Locus(S.anchors, { N: 400, sigma: engSigma(), rng: rngMake(11), inflate: 2.0, scorer: sc }), kf: new KalmanCV(), ls: S.pos.slice(), rng: rngMake(2026), t: 0 };
  stats = { loc: [], ls: [], kf: [] }; logRows = [];
}
/* the filter's range-noise belief: dB shadowing is multiplicative in range (rel. error = sigma_dB*ln10/(10n)) */
function engSigma() {
  if (S.space === 'hospital') return Math.max(0.3, S.sigM * 0.75);
  if (S.model === 'add') return Math.max(0.15, S.sigM);
  return Math.min(3, Math.max(0.2, S.sigDb * Math.LN10 / (10 * S.pn) * 0.4 * Math.hypot(S.W, S.H)));
}
function radioCfg() {
  const hosp = S.space === 'hospital';
  return {
    model: S.model, loss: S.loss, rssi1m: S.rssi1m, n: S.pn, sigma: S.model === 'add' ? S.sigM : 0.6, sigmaDb: S.sigDb, wallDb: 6, obstructDb: 12, driftDb: 6, burst: hosp ? 0.004 : 0.002,
    wallBias: hosp ? 1.8 : 1.2, obstructBias: hosp ? 4 : 1.8, driftBias: hosp ? 2.5 : 1.2, dead: S.dead, obstruct: S.obstruct, drift: S.drift,
  };
}

/* ---------- truth sources ---------- */
let walker = null, keys = {}, joy = { x: 0, y: 0 }, target = null, demoI = 0;
function demoPath() {
  if (S.space === 'hospital') return [[3, 12], [15, 12], [15, 4], [15, 12], [25, 12], [25, 4], [25, 12], [36, 12], [36, 19.5], [36, 12], [27, 12], [27, 19.5], [27, 12], [6, 12], [6, 19.5], [6, 12]];
  const W = S.W, H = S.H, a = 0.8, p = S.partition ? [[a, a], [W / 2 - .6, a], [W / 2 - .6, H / 2], [W / 2 + .6, H / 2], [W / 2 + .6, a], [W - a, a], [W - a, H - a], [W / 2 + .6, H - a], [W / 2 + .6, H / 2], [W / 2 - .6, H / 2], [W / 2 - .6, H - a], [a, H - a]] : [[a, a], [W - a, a], [W - a, H - a], [a, H - a]];
  return p;
}
function moveToward(tx, ty, sp, dt) { const dx = tx - S.pos[0], dy = ty - S.pos[1], d = Math.hypot(dx, dy); if (d < 0.05) return true; const st = Math.min(d, sp * dt); stepMove(dx / d * st, dy / d * st); return false; }
function stepMove(dx, dy) {
  const [x, y] = S.pos, m = 0.12; let nx = Math.min(S.W - m, Math.max(m, x + dx)), ny = Math.min(S.H - m, Math.max(m, y + dy));
  if (crossesWall(x, y, nx, ny)) { if (!crossesWall(x, y, nx, y)) ny = y; else if (!crossesWall(x, y, x, ny)) nx = x; else { nx = x; ny = y; } }
  S.pos = [nx, ny];
}
function updateTruth(dt) {
  const spd = S.space === 'hospital' ? 1.4 : 0.9;
  if (S.src === 'demo') { const p = demoPath(); demoI %= p.length; if (moveToward(p[demoI][0], p[demoI][1], spd, dt)) demoI = (demoI + 1) % p.length; }
  else if (S.src === 'remote') { if (remote.pos) { const k = 0.5; S.pos = [S.pos[0] + k * (remote.pos[0] - S.pos[0]), S.pos[1] + k * (remote.pos[1] - S.pos[1])]; } }
  else if (S.src === 'touch') {
    let vx = (keys.d || keys.ArrowRight ? 1 : 0) - (keys.a || keys.ArrowLeft ? 1 : 0) + joy.x, vy = (keys.s || keys.ArrowDown ? 1 : 0) - (keys.w || keys.ArrowUp ? 1 : 0) + joy.y;
    const L = Math.hypot(vx, vy);
    if (L > 0.05) { target = null; const sp = spd * Math.min(1, L); const c = Math.cos(-S.view.yaw * Math.PI / 180), s = Math.sin(-S.view.yaw * Math.PI / 180); stepMove((vx * c - vy * s) / L * sp * dt, (vx * s + vy * c) / L * sp * dt); }
    else if (target && moveToward(target[0], target[1], spd, dt)) target = null;
  }
}

/* ---------- phone sensors ---------- */
const sd = new StepDetector(), hf = new HeadingFilter(0.25); let sensOn = false, lastMotion = 0, absSeen = false, gpsW = null, gpsOrigin = null, gpsLast = null;
function stepLenFromHeight() { return Math.round(parseFloat($('i-hgt').value) * 0.415) / 100; }
function onMotion(ev) {
  const a = ev.accelerationIncludingGravity; if (!a || a.x == null) return; lastMotion = performance.now();
  if (sd.push(a.x, a.y, a.z, ev.timeStamp || performance.now()) && S.src === 'phone') phoneStep();
}
function phoneStep() { S.steps++; const h = S.heading == null ? S.align : S.heading, a = (h - S.align - S.fine) * Math.PI / 180, L = S.stepLen * S.scale; stepMove(L * Math.sin(a), -L * Math.cos(a)); }
function onOri(ev) {
  if (ev.type === 'deviceorientation' && absSeen) return; if (ev.type === 'deviceorientationabsolute') absSeen = true;
  let alpha = ev.alpha; if (typeof ev.webkitCompassHeading === 'number') alpha = 360 - ev.webkitCompassHeading;
  if (alpha == null || ev.beta == null) return;
  S.heading = hf.push(headingFromEuler(alpha, ev.beta, ev.gamma || 0));
}
async function enableSensors() {
  const note = $('n-sens');
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const r1 = await DeviceMotionEvent.requestPermission(); let r2 = 'granted'; if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) r2 = await DeviceOrientationEvent.requestPermission();
      if (r1 !== 'granted' || r2 !== 'granted') { note.textContent = 'Permission denied. On iPhone: Settings → Safari → Motion & Orientation Access → on, then reload.'; return; }
    }
    if (!sensOn) { addEventListener('devicemotion', onMotion); addEventListener('deviceorientationabsolute', onOri, true); addEventListener('deviceorientation', onOri, true); sensOn = true; }
    note.textContent = 'Sensors on. Waiting for motion data…'; setTimeout(() => { if (!lastMotion) note.textContent = 'No motion data received. This device/browser has no motion sensors (desktop?) or they are blocked. Use "+1 test step" to try it, or open this page on your phone.'; }, 1800);
  } catch (e) { note.textContent = 'Could not start sensors: ' + (e && e.message || e); }
}
function startGps() {
  if (!navigator.geolocation) { $('n-gps').textContent = 'This browser has no geolocation.'; return; }
  if (gpsW != null) return;
  gpsW = navigator.geolocation.watchPosition(p => {
    const c = p.coords; gpsLast = c; if (!gpsOrigin) gpsOrigin = [c.latitude, c.longitude];
    const [e, n] = gpsToLocal(c.latitude, c.longitude, gpsOrigin[0], gpsOrigin[1]), a = S.align * Math.PI / 180, k = S.scale;
    if (S.src === 'gps' && c.accuracy < 60) { const tx = S.W / 2 + (e * Math.cos(a) + n * Math.sin(a)) * k, ty = S.H / 2 - (-e * Math.sin(a) + n * Math.cos(a)) * k; S.pos = [Math.min(S.W - .1, Math.max(.1, S.pos[0] + 0.5 * (tx - S.pos[0]))), Math.min(S.H - .1, Math.max(.1, S.pos[1] + 0.5 * (ty - S.pos[1])))]; }
    $('n-gps').textContent = 'Accuracy ±' + c.accuracy.toFixed(0) + ' m' + (c.accuracy > 15 ? ' - too coarse for a room; try Phone motion.' : '.');
  }, e => { $('n-gps').textContent = 'GPS error: ' + e.message; gpsW = null; }, { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 });
}

/* ---------- simulation tick (10 Hz) ---------- */
let stats = { loc: [], ls: [], kf: [] }, logRows = [], cur = null;
function tick() {
  const dt = 0.1, truth = S.pos.slice(), assumed = S.zKnow ? S.zDev : S.zAssume;
  const meas = measure3D(truth, S.zDev, assumed, S.anchors, radioCfg(), eng.rng, wallsBetween);
  const ls = lsFix(S.anchors, meas, eng.ls); if (ls) eng.ls = ls; const kf = eng.kf.update(ls, dt);
  eng.loc.sigma = engSigma(); const out = eng.loc.step(meas, dt); eng.t += dt;
  let p3 = null;
  if (out) { const w = out.trust.map((t, j) => out.usable[j] ? t * t : 0); p3 = fix3D(S.anchors, meas, [out.pos[0], out.pos[1], S.zDev], w, { w: S.W, h: S.H, z: S.Z }, 1.3, engSigma());
    /* height changes slowly: smooth it, and only trust it when the geometry can actually observe it */
    if (p3 && p3[3] < 0.8) { S.zEst = S.zEst == null ? p3[2] : S.zEst + 0.12 * (p3[2] - S.zEst); S.zStd = p3[3]; } else { S.zEst = null; S.zStd = null; } if (!p3) { S.zEst = null; S.zStd = null; } }
  const e = q => q ? Math.hypot(q[0] - truth[0], q[1] - truth[1]) : null;
  if (p3 && S.zEst != null) p3 = [p3[0], p3[1], S.zEst, S.zStd]; else p3 = null;
  cur = { truth, meas, ls, kf, out, p3, e: { loc: out && e(out.pos), ls: e(ls), kf: e(kf) } };
  ['loc', 'ls', 'kf'].forEach(k => { if (cur.e[k] != null) { stats[k].push(cur.e[k]); if (stats[k].length > 900) stats[k].shift(); } });
  if (out) { S.estTrail = (S.estTrail || []); S.estTrail.push(out.pos.slice()); if (S.estTrail.length > 80) S.estTrail.shift(); }
  if (S.showTrail) { const t = S.trail, l = t[t.length - 1]; if (!l || Math.hypot(l[0] - truth[0], l[1] - truth[1]) > 0.04) { t.push(truth); if (t.length > 160) t.shift(); } }
  if (logRows.length < 30000 && out) logRows.push([eng.t.toFixed(1), ...truth.map(v => v.toFixed(3)), S.zDev, ...out.pos.map(v => v.toFixed(3)), p3 ? p3[2].toFixed(2) : '', ls ? ls[0].toFixed(3) : '', ls ? ls[1].toFixed(3) : '', cur.e.loc.toFixed(3), cur.e.ls == null ? '' : cur.e.ls.toFixed(3), cur.e.kf == null ? '' : cur.e.kf.toFixed(3), ...S.anchors.map((a, i) => meas[i] ? meas[i].rssi : ''), ...S.anchors.map((a, i) => out.trust[i].toFixed(2))]);
}

/* ---------- 3D rendering ---------- */
const cv = $('cv'), g = cv.getContext('2d'); let DPR = 1, V = null, vp = { cx: 0, cy: 0, cz: 0, ox: 0, oy: 0, s: 40 }, hit = [];
function fitView() { vp.cx = S.W / 2; vp.cy = S.H / 2; vp.cz = S.Z / 2; }
function resize() { DPR = Math.min(2, devicePixelRatio || 1); const r = cv.getBoundingClientRect(); cv.width = r.width * DPR; cv.height = r.height * DPR; }
function setupView() {
  const w = cv.width / DPR, h = cv.height / DPR, W = S.W, H = S.H, Z = S.Z;
  /* fit: project the room box at unit scale, then scale/centre the bounding box into the free area (below the toolbar, above the HUD) */
  const T = makeView({ tilt: S.view.tilt, yaw: S.view.yaw, cx: vp.cx, cy: vp.cy, cz: vp.cz, ox: 0, oy: 0, s: 1 });
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; [[0, 0], [W, 0], [W, H], [0, H]].forEach(c => [0, Z].forEach(z => { const p = T.P(c[0], c[1], z); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }));
  const top = w < 600 ? 96 : 58, bot = w < 600 ? 84 : 72, aw = w - 36, ah = h - top - bot;
  vp.s = S.view.zoom * Math.min(aw / Math.max(0.5, x1 - x0), ah / Math.max(0.5, y1 - y0)) * (S.view.zoom === 1 ? 1 : 1);
  vp.ox = w / 2 - (x0 + x1) / 2 * vp.s; vp.oy = top + ah / 2 - (y0 + y1) / 2 * vp.s;
  V = makeView({ tilt: S.view.tilt, yaw: S.view.yaw, cx: vp.cx, cy: vp.cy, cz: vp.cz, ox: vp.ox, oy: vp.oy, s: vp.s });
}
const P = (x, y, z) => V.P(x, y, z || 0);
function line(a, b, col, w, dash) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]); }
function dot(p, r, col, stroke) { g.beginPath(); g.arc(p[0], p[1], r, 0, 7); g.fillStyle = col; g.fill(); if (stroke) { g.lineWidth = 2; g.strokeStyle = stroke; g.stroke(); } }
function poly(pts, fill, stroke, lw) { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); } }
const trustCol = t => t > 0.7 ? '#10B981' : t > 0.4 ? '#F5A524' : '#EF6A6A';

function draw() {
  const w = cv.width / DPR, h = cv.height / DPR; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, w, h); setupView();
  const W = S.W, H = S.H, Z = S.Z, tilt = S.view.tilt;
  /* floor + grid */
  poly([P(0, 0, 0), P(W, 0, 0), P(W, H, 0), P(0, H, 0)], '#FFFFFF', '#9CCFE0', 1.5);
  g.save(); g.globalAlpha = 0.55; const step = W > 14 ? 5 : 1;
  for (let x = step; x < W; x += step) line(P(x, 0, 0), P(x, H, 0), '#DDF0F6', 1); for (let y = step; y < H; y += step) line(P(0, y, 0), P(W, y, 0), '#DDF0F6', 1); g.restore();
  if (S.space === 'hospital') ROOMS.forEach(r => { const [a, b, c, d] = r.r; poly([P(a, b, 0), P(c, b, 0), P(c, d, 0), P(a, d, 0)], r.id === 'corr' ? 'rgba(34,195,230,.07)' : 'rgba(16,185,129,.05)', null); const m = P((a + c) / 2, (b + d) / 2, 0); if (tilt > 45) { g.fillStyle = '#7A9AA6'; g.font = '600 11px Figtree'; g.textAlign = 'center'; g.fillText(r.name, m[0], m[1]); } });
  /* room box edges */
  const cs = [[0, 0], [W, 0], [W, H], [0, H]];
  if (tilt < 88) { poly(cs.map(c => P(c[0], c[1], Z)), null, 'rgba(14,157,190,.45)', 1.2); cs.forEach(c => line(P(c[0], c[1], 0), P(c[0], c[1], Z), 'rgba(14,157,190,.35)', 1.2)); }
  /* walls (translucent panels): interior walls only, far-first */
  const wl = WALLS.filter(q => !((q[1] === 0 && q[3] === 0) || (q[1] === H && q[3] === H) || (q[0] === 0 && q[2] === 0) || (q[0] === W && q[2] === W)));
  const wd = wl.map(q => ({ q, d: P((q[0] + q[2]) / 2, (q[1] + q[3]) / 2, Z / 2)[2] })).sort((a, b) => a.d - b.d);
  wd.forEach(({ q }) => { const a = P(q[0], q[1], 0), b = P(q[2], q[3], 0), c = P(q[2], q[3], Z), d = P(q[0], q[1], Z); if (tilt > 80) line(a, b, '#0E9DBE', 2.5); else poly([a, b, c, d], 'rgba(14,157,190,.16)', 'rgba(14,157,190,.55)', 1.2); });
  [[0, 0, W, 0], [W, 0, W, H], [W, H, 0, H], [0, H, 0, 0]].forEach(q => line(P(q[0], q[1], 0), P(q[2], q[3], 0), '#0E9DBE', 2.2));
  /* particles */
  const loc = eng.loc, c = cur;
  if (S.show.pt && loc.inited) { g.fillStyle = 'rgba(34,195,230,.42)'; for (let i = 0; i < loc.N; i += 3) { const p = P(loc.px[i], loc.py[i], 0); g.fillRect(p[0] - 1.2, p[1] - 1.2, 2.4, 2.4); } }
  /* 90% ellipse on the floor */
  if (S.show.locus && c && c.out) { const o = c.out, pts = []; for (let k = 0; k < 40; k++) { const t = k / 40 * 2 * Math.PI, ex = o.ell.a * Math.cos(t), ey = o.ell.b * Math.sin(t), ct = Math.cos(o.ell.th), st = Math.sin(o.ell.th); pts.push(P(o.pos[0] + ex * ct - ey * st, o.pos[1] + ex * st + ey * ct, 0)); } poly(pts, 'rgba(16,185,129,.07)', 'rgba(16,185,129,.6)', 1.5); }
  /* trails */
  const trl = (arr, col, wd) => { if (arr && arr.length > 1) { g.beginPath(); arr.forEach((q, i) => { const p = P(q[0], q[1], 0); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.strokeStyle = col; g.lineWidth = wd; g.stroke(); } };
  if (S.show.truth && S.showTrail) trl(S.trail, 'rgba(11,58,74,.35)', 2); if (S.show.locus) trl(S.estTrail, 'rgba(16,185,129,.55)', 2);
  if (target && S.src === 'touch') { const p = P(target[0], target[1], 0); g.beginPath(); g.arc(p[0], p[1], 9, 0, 7); g.strokeStyle = '#10B981'; g.lineWidth = 2; g.stroke(); }
  /* objects sorted far -> near */
  const items = [];
  S.anchors.forEach((a, i) => items.push({ d: P(a.x, a.y, a.z)[2], f: () => drawAnchor(a, i) }));
  if (c) items.push({ d: P(c.truth[0], c.truth[1], S.zDev)[2], f: drawPhone });
  if (c && c.out && S.show.locus) { const z = c.p3 ? c.p3[2] : S.zDev; items.push({ d: P(c.out.pos[0], c.out.pos[1], z)[2] + 0.001, f: () => drawEst(c.out.pos, z, COL.locus, 'LOCUS', true) }); }
  if (c && c.ls && S.show.ls) items.push({ d: P(c.ls[0], c.ls[1], S.zDev)[2] - 0.001, f: () => drawEst(c.ls, S.zDev, COL.ls, 'trilat', false) });
  if (c && c.kf && S.show.kf) items.push({ d: P(c.kf[0], c.kf[1], S.zDev)[2] - 0.002, f: () => drawEst(c.kf, S.zDev, COL.kf, 'kalman', false) });
  items.sort((a, b) => a.d - b.d).forEach(it => it.f());
  g.fillStyle = '#7A9AA6'; g.font = '600 11px Figtree'; g.textAlign = 'right'; if (w > 700) g.fillText(W.toFixed(1) + ' × ' + H.toFixed(1) + ' × ' + Z.toFixed(1) + ' m  ·  tilt ' + tilt + '°', w - 12, h - 76);
}
function drawAnchor(a, i) {
  const base = P(a.x, a.y, 0), top = P(a.x, a.y, a.z), dead = S.dead.has(a.id), ob = S.obstruct.has(a.id), dr = S.drift.has(a.id), col = dead ? COL.dead : ob ? COL.obs : dr ? COL.drift : '#0E9DBE';
  const m = cur && cur.meas[i], t = cur && cur.out ? cur.out.trust[i] : 0.8;
  if (S.view.tilt < 89) line(base, top, 'rgba(14,157,190,.35)', 1.5, [3, 3]); dot(base, 3, 'rgba(14,157,190,.35)');
  if (cur && !dead && S.show.locus) { const p = P(cur.truth[0], cur.truth[1], S.zDev); g.save(); g.globalAlpha = m ? 0.8 : 0.18; line(top, p, m ? trustCol(t) : '#9AA9B0', m ? 1 + 2 * t : 1, m ? [] : [4, 5]); g.restore();
    if (S.view.tilt < 65 && m) { const dz = a.z - S.zDev, mid = [(top[0] + p[0]) / 2, (top[1] + p[1]) / 2]; g.fillStyle = '#0E9DBE'; g.font = '700 10.5px Figtree'; g.textAlign = 'center'; g.fillText('Δz ' + (dz >= 0 ? '+' : '') + dz.toFixed(1) + ' m', mid[0], mid[1] - 4); } }
  if (i === S.sel) { g.beginPath(); g.arc(top[0], top[1], 15, 0, 7); g.strokeStyle = '#10B981'; g.lineWidth = 2; g.stroke(); }
  poly([[top[0], top[1] - 9], [top[0] + 8, top[1] - 4.5], [top[0] + 8, top[1] + 4.5], [top[0], top[1] + 9], [top[0] - 8, top[1] + 4.5], [top[0] - 8, top[1] - 4.5]], col, '#fff', 2);
  g.fillStyle = '#fff'; g.font = '700 9px Figtree'; g.textAlign = 'center'; g.fillText(a.id.replace('A', ''), top[0], top[1] + 3.2);
  g.fillStyle = col; g.font = '700 10.5px Figtree'; g.fillText((a.z).toFixed(1) + ' m', top[0], top[1] - 14);
  hit.push({ i, x: top[0], y: top[1] });
}
function drawPhone() {
  const p = cur.truth, f = P(p[0], p[1], 0), t = P(p[0], p[1], S.zDev);
  g.beginPath(); g.ellipse(f[0], f[1], 9, 9 * Math.max(0.35, Math.sin(S.view.tilt * Math.PI / 180)), 0, 0, 7); g.fillStyle = 'rgba(11,58,74,.18)'; g.fill();
  if (S.view.tilt < 89) line(f, t, COL.truth, 2.5);
  if (S.heading != null && S.src === 'phone') { const a = (S.heading - S.align - S.fine) * Math.PI / 180, q = P(p[0] + Math.sin(a) * 0.9, p[1] - Math.cos(a) * 0.9, 0); line(f, q, '#10B981', 3); }
  dot(t, 8, COL.truth, '#fff'); g.fillStyle = '#fff'; g.fillRect(t[0] - 2.4, t[1] - 4, 4.8, 8);
  g.fillStyle = COL.truth; g.font = '700 10.5px Figtree'; g.textAlign = 'center'; g.fillText('phone ' + S.zDev.toFixed(1) + ' m', t[0], t[1] - 13);
}
function drawEst(pos, z, col, label, big) {
  const f = P(pos[0], pos[1], 0), t = P(pos[0], pos[1], z);
  if (S.view.tilt < 89) line(f, t, col, 1.5, [2, 3]);
  g.beginPath(); g.arc(t[0], t[1], big ? 10 : 7, 0, 7); g.lineWidth = big ? 3 : 2.5; g.strokeStyle = col; g.stroke();
  if (big) { g.fillStyle = col; g.font = '700 10.5px Figtree'; g.textAlign = 'center'; g.fillText(label + (cur.p3 ? ' · ' + z.toFixed(1) + ' m' : ''), t[0], t[1] + 24); }
}

/* ---------- UI ---------- */
function setSeg(id, attr, val) { document.querySelectorAll('#' + id + ' button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset[attr] === val))); }
function setView(kind) { const v = { top: [90, 0], iso: [48, S.view.yaw || -28], side: [10, 0] }[kind]; animateView(v[0], kind === 'top' ? 0 : v[1]); setSeg('views', 'v', kind); }
let anim = null; function animateView(tilt, yaw) { anim = { t0: performance.now(), a: S.view.tilt, b: tilt, c: S.view.yaw, d: yaw }; }
function syncView() { $('tilt').value = S.view.tilt; $('tiltv').textContent = Math.round(S.view.tilt) + '°'; $('yaw').value = S.view.yaw; $('yawv').textContent = Math.round(S.view.yaw) + '°'; const k = S.view.tilt > 80 ? 'top' : S.view.tilt < 20 ? 'side' : 'iso'; setSeg('views', 'v', k); }
function renderAnchors() {
  $('anchors').innerHTML = S.anchors.map((a, i) => { const dz = a.z - S.zDev, st = S.dead.has(a.id) ? 'killed' : S.obstruct.has(a.id) ? 'blocked' : S.drift.has(a.id) ? 'drifting' : 'ok'; return `<div class="an${i === S.sel ? ' sel' : ''}" data-i="${i}"><header><span>${a.id}</span><span class="note">${st}</span><span class="dz">${dz >= 0 ? '↑' : '↓'} ${Math.abs(dz).toFixed(1)} m ${dz >= 0 ? 'above' : 'below'} phone</span></header>
    <div class="row"><label class="fld">x <input type="number" step="0.1" value="${a.x.toFixed(1)}" data-k="x"></label><label class="fld">y <input type="number" step="0.1" value="${a.y.toFixed(1)}" data-k="y"></label><label class="fld">height z <input type="number" step="0.1" min="0" max="${S.Z}" value="${a.z.toFixed(1)}" data-k="z"></label></div></div>`; }).join('');
  document.querySelectorAll('#anchors .an').forEach(el => {
    el.onclick = e => { if (e.target.tagName === 'INPUT') return; S.sel = +el.dataset.i; renderAnchors(); syncFaults(); };
    el.querySelectorAll('input').forEach(inp => inp.onchange = () => { const a = S.anchors[+el.dataset.i], k = inp.dataset.k, v = parseFloat(inp.value); if (isNaN(v)) return; a[k] = Math.min(k === 'x' ? S.W : k === 'y' ? S.H : S.Z, Math.max(0, v)); relayout(); });
  });
}
function relayout() { if (S.space === 'room') { setRoom(S.W, S.H, S.anchors, partitions()); } newEngine(); renderAnchors(); }
function syncFaults() { const a = S.anchors[S.sel]; if (!a) return; document.querySelectorAll('#faults button').forEach(b => { const f = b.dataset.f; b.setAttribute('aria-pressed', f === 'clear' ? 'false' : String(S[f === 'dead' ? 'dead' : f].has(a.id))); }); }
function spaceNote() {
  $('n-space').innerHTML = S.space === 'room' ? 'Your own room: set its real size, place anchors (virtual BLE beacons — or real ones later), walk with your phone.' : '<b>The 40 × 24 m hospital floor the ML model was trained on.</b> Your phone walk is scaled up (set <b>Walk scale</b> in Track, e.g. ×8) so crossing your room crosses a ward. The trained trust model is fully in-distribution here.';
  $('o-room').style.display = S.space === 'room' ? 'flex' : 'none';
  $('n-ml').innerHTML = S.scorer === 'ml' ? 'LightGBM trust model, <b>trained on ' + (TRUST_MODEL.n_train / 1000 | 0) + 'k simulated hospital readings</b> (AUC ' + TRUST_MODEL.auc.toFixed(2) + ' vs ' + TRUST_MODEL.auc_heuristic.toFixed(2) + ' for the heuristic), exported to run in your browser.' + (S.space === 'room' ? ' <b>Caution:</b> trained on a 40×24 m building; in a small room the features are out of its training range — compare with the heuristic.' : ' It detects bad readings better, but on the hidden benchmark it did not improve end-to-end position error.') : 'Hand-written scorer: residual vs motion model, jumps, variance. Default because it was equal or better end-to-end.';
}
function bindUI() {
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b))); document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 't-' + b.dataset.t)); if (b.dataset.t === 'space') renderAnchors(); });
  document.querySelectorAll('#views button').forEach(b => b.onclick = () => setView(b.dataset.v));
  $('tilt').oninput = e => { S.view.tilt = +e.target.value; anim = null; syncView(); }; $('yaw').oninput = e => { S.view.yaw = +e.target.value; anim = null; syncView(); };
  ['truth', 'locus', 'ls', 'kf', 'pt'].forEach(k => { const cb = $('L-' + k); cb.checked = S.show[k]; cb.parentElement.style.opacity = S.show[k] ? 1 : .4; cb.parentElement.onclick = e => { e.preventDefault(); S.show[k] = !S.show[k]; cb.checked = S.show[k]; cb.parentElement.style.opacity = S.show[k] ? 1 : .4; }; });
  document.querySelectorAll('#srcs button').forEach(b => b.onclick = () => setSource(b.dataset.s));
  $('b-sens').onclick = enableSensors; $('b-align').onclick = () => { if (S.heading == null) { $('n-ph').textContent = 'No heading yet - enable sensors first.'; return; } S.align = S.heading; S.fine = 0; $('i-off').value = 0; $('v-off').textContent = '0°'; };
  $('b-step').onclick = () => { S.src === 'phone' ? phoneStep() : (setSource('phone'), phoneStep()); };
  $('i-hgt').onchange = () => { S.stepLen = stepLenFromHeight(); $('i-step').value = S.stepLen.toFixed(2); save(); };
  $('i-step').onchange = e => { S.stepLen = +e.target.value; save(); }; $('i-scale').onchange = e => { S.scale = +e.target.value; save(); };
  $('i-off').oninput = e => { S.fine = +e.target.value; $('v-off').textContent = S.fine + '°'; };
  $('b-gps').onclick = startGps; $('b-gps0').onclick = () => { gpsOrigin = gpsLast ? [gpsLast.latitude, gpsLast.longitude] : null; S.pos = [S.W / 2, S.H / 2]; };
  $('b-reset').onclick = () => { S.trail = []; S.estTrail = []; }; $('b-trail').onclick = e => { S.showTrail = !S.showTrail; e.target.textContent = 'Trail: ' + (S.showTrail ? 'on' : 'off'); if (!S.showTrail) S.trail = []; };
  $('b-copy').onclick = () => { $('i-url').select(); try { navigator.clipboard.writeText($('i-url').value); } catch (e) { document.execCommand('copy'); } };
  $('b-share').onclick = () => Sync.share(); $('b-join').onclick = () => Sync.join($('i-code').value.trim()); $('b-leave').onclick = () => Sync.leave();
  document.querySelectorAll('#spaces button').forEach(b => b.onclick = () => { S.space = b.dataset.sp; setSeg('spaces', 'sp', S.space); if (S.space === 'hospital') { $('i-scale').value = S.scale = 8; S.model = 'add'; $('i-model').value = 'add'; S.sigM = 0.8; sigUI(); S.pos = [3, 12]; } else { $('i-scale').value = S.scale = 1; S.model = 'rssi'; $('i-model').value = 'rssi'; sigUI(); S.pos = [S.W / 2, S.H / 2]; S.Z = +$('i-Z').value; S.W = +$('i-W').value; S.H = +$('i-H').value; } S.dead.clear(); S.obstruct.clear(); S.drift.clear(); demoI = 0; rebuild(false); spaceNote(); renderAnchors(); });
  const sl = (id, k, fmt, after) => { $('i-' + id).oninput = e => { S[k] = +e.target.value; $('v-' + id).textContent = fmt(S[k]); after && after(); save(); }; };
  sl('W', 'W', v => v.toFixed(1), () => { rebuild(false); renderAnchors(); }); sl('H', 'H', v => v.toFixed(1), () => { rebuild(false); renderAnchors(); }); sl('Z', 'Z', v => v.toFixed(1), () => { rebuild(false); renderAnchors(); });
  $('i-n').oninput = e => { S.n = +e.target.value; $('v-n').textContent = S.n; S.anchors = S.all.slice(0, S.n); S.sel = Math.min(S.sel, S.n - 1); newEngine(); renderAnchors(); save(); };
  $('g-part').onclick = e => { S.partition = !S.partition; e.target.setAttribute('aria-pressed', S.partition); demoI = 0; rebuild(true); renderAnchors(); };
  $('i-zd').oninput = e => { S.zDev = +e.target.value; $('v-zd').textContent = S.zDev.toFixed(2) + ' m'; if (S.zKnow) { S.zAssume = S.zDev; $('i-za').value = S.zDev; $('v-za').textContent = S.zDev.toFixed(2) + ' m'; } renderAnchorsDz(); save(); };
  document.querySelectorAll('#zpre button').forEach(b => b.onclick = () => { $('i-zd').value = b.dataset.z; $('i-zd').oninput({ target: $('i-zd') }); });
  $('g-zknow').onclick = e => { S.zKnow = !S.zKnow; e.target.setAttribute('aria-pressed', S.zKnow); $('f-zas').style.display = S.zKnow ? 'none' : 'flex'; if (S.zKnow) S.zAssume = S.zDev; };
  $('i-za').oninput = e => { S.zAssume = +e.target.value; $('v-za').textContent = S.zAssume.toFixed(2) + ' m'; };
  $('i-model').onchange = e => { S.model = e.target.value; sigUI(); save(); };
  $('i-sig').oninput = e => { if (S.model === 'rssi') S.sigDb = +e.target.value; else S.sigM = +e.target.value; $('v-sig').textContent = e.target.value + (S.model === 'rssi' ? ' dB' : ' m'); save(); };
  $('i-loss').oninput = e => { S.loss = +e.target.value / 100; $('v-loss').textContent = e.target.value + '%'; save(); };
  $('i-r1').onchange = e => { S.rssi1m = +e.target.value; save(); }; $('i-pn').onchange = e => { S.pn = +e.target.value; save(); };
  document.querySelectorAll('#scorer button').forEach(b => b.onclick = () => { S.scorer = b.dataset.sc; setSeg('scorer', 'sc', S.scorer); newEngine(); spaceNote(); });
  document.querySelectorAll('#faults button').forEach(b => b.onclick = () => { const a = S.anchors[S.sel]; if (!a) return; const f = b.dataset.f; if (f === 'clear') { S.dead.clear(); S.obstruct.clear(); S.drift.clear(); } else { const s = S[f]; s.has(a.id) ? s.delete(a.id) : s.add(a.id); } syncFaults(); renderAnchors(); });
  $('b-clear').onclick = () => { stats = { loc: [], ls: [], kf: [] }; logRows = []; };
  $('b-csv').onclick = () => { const head = ['t_s', 'truth_x', 'truth_y', 'truth_z', 'locus_x', 'locus_y', 'locus_z_est', 'trilat_x', 'trilat_y', 'err_locus', 'err_trilat', 'err_kalman'].concat(S.anchors.map(a => 'rssi_' + a.id), S.anchors.map(a => 'trust_' + a.id)).join(','); const blob = new Blob([head + '\n' + logRows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'locus-room-session.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  /* canvas: orbit (drag), zoom (wheel/pinch), tap floor to walk, drag anchors */
  const ptrs = new Map(); let mode = null, st = null;
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; ptrs.set(e.pointerId, [x, y]);
    const h = hit.find(q => Math.hypot(q.x - x, q.y - y) < 18); if (ptrs.size === 1) { if (h) { S.sel = h.i; syncFaults(); renderAnchors(); mode = S.view.tilt > 25 && S.space === 'room' ? 'anchor' : null; st = { x, y, moved: 0, i: h.i }; } else { mode = 'orbit'; st = { x, y, moved: 0, tilt: S.view.tilt, yaw: S.view.yaw }; } } else { mode = 'pinch'; const p = [...ptrs.values()]; st = { d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), z: S.view.zoom }; } cv.classList.add('drag'); };
  cv.onpointermove = e => { if (!ptrs.has(e.pointerId)) return; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; ptrs.set(e.pointerId, [x, y]);
    if (mode === 'orbit') { st.moved = Math.max(st.moved, Math.hypot(x - st.x, y - st.y)); if (st.moved > 5) { S.view.yaw = ((st.yaw + (x - st.x) * 0.4 + 540) % 360) - 180; S.view.tilt = Math.min(90, Math.max(8, st.tilt - (y - st.y) * 0.35)); anim = null; syncView(); } }
    else if (mode === 'anchor') { st.moved = Math.max(st.moved, Math.hypot(x - st.x, y - st.y)); const a = S.anchors[st.i], u = V.U(x, y, a.z); a.x = Math.min(S.W - .1, Math.max(.1, u[0])); a.y = Math.min(S.H - .1, Math.max(.1, u[1])); }
    else if (mode === 'pinch' && ptrs.size === 2) { const p = [...ptrs.values()]; S.view.zoom = Math.min(4, Math.max(0.5, st.z * Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) / st.d)); } };
  cv.onpointerup = cv.onpointercancel = e => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (mode === 'anchor' && st.moved > 3) relayout();
    else if ((mode === 'orbit') && st.moved <= 5 && S.src === 'touch') { const u = V.U(x, y, 0); if (u[0] >= 0 && u[1] >= 0 && u[0] <= S.W && u[1] <= S.H) target = u; }
    ptrs.delete(e.pointerId); if (!ptrs.size) { mode = null; cv.classList.remove('drag'); } };
  cv.onwheel = e => { e.preventDefault(); S.view.zoom = Math.min(4, Math.max(0.5, S.view.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); };
  addEventListener('keydown', e => { if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true; if (S.src !== 'touch' && /^(w|a|s|d|Arrow.*)$/.test(e.key) && !e.metaKey) setSource('touch'); if (e.key.startsWith('Arrow')) e.preventDefault(); });
  addEventListener('keyup', e => { keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false; });
  const jy = $('joy'), jk = $('joyk'); let jd = false; const jm = e => { const r = jy.getBoundingClientRect(), dx = (e.clientX - r.left - 52) / 40, dy = (e.clientY - r.top - 52) / 40, L = Math.hypot(dx, dy), k = L > 1 ? 1 / L : 1; joy = { x: dx * k, y: dy * k }; jk.style.transform = `translate(${joy.x * 34}px,${joy.y * 34}px)`; };
  jy.onpointerdown = e => { jd = true; jy.setPointerCapture(e.pointerId); jm(e); }; jy.onpointermove = e => { if (jd) jm(e); }; jy.onpointerup = jy.onpointercancel = () => { jd = false; joy = { x: 0, y: 0 }; jk.style.transform = ''; };
  addEventListener('resize', resize);
}
function renderAnchorsDz() { document.querySelectorAll('#anchors .an').forEach(el => { const a = S.anchors[+el.dataset.i], dz = a.z - S.zDev, s = el.querySelector('.dz'); if (s) s.textContent = (dz >= 0 ? '↑ ' : '↓ ') + Math.abs(dz).toFixed(1) + ' m ' + (dz >= 0 ? 'above' : 'below') + ' phone'; }); }
function sigUI() { const r = S.model === 'rssi', el = $('i-sig'); el.max = r ? 10 : 3; el.step = r ? 0.5 : 0.1; el.value = r ? S.sigDb : S.sigM; $('v-sig').textContent = el.value + (r ? ' dB' : ' m'); }
function setSource(s) {
  S.src = s; setSeg('srcs', 's', s); $('o-phone').style.display = s === 'phone' ? 'flex' : 'none'; $('o-gps').style.display = s === 'gps' ? 'flex' : 'none'; $('joy').classList.toggle('on', s === 'touch');
  const names = { demo: 'Demo walker', touch: 'Tap / keys', phone: 'Phone motion', gps: 'GPS', remote: 'Synced from other device' }; $('p-src').lastElementChild.textContent = names[s]; $('p-src').className = 'pill' + (s === 'demo' ? '' : ' ok');
  if (s === 'phone' && !sensOn) $('n-sens').textContent = 'Tap "Enable phone sensors" (needed once). Then hold the phone flat in front of you and walk.';
}
function updateReport() {
  const c = cur; if (!c) return; const med = a => a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null, q95 = a => a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * .95))] : null, f = v => v == null ? '–' : v.toFixed(2) + ' m';
  $('k-m1').textContent = f(med(stats.loc)); $('k-m2').textContent = f(med(stats.ls)); $('k-m3').textContent = f(med(stats.kf)); $('k-p1').textContent = f(q95(stats.loc)); $('k-p2').textContent = f(q95(stats.ls)); $('k-n').textContent = stats.loc.length;
  $('h-err').textContent = c.e.loc == null ? '–' : c.e.loc.toFixed(2) + ' m'; $('h-ls').textContent = c.e.ls == null ? 'no fix' : c.e.ls.toFixed(2) + ' m';
  $('h-z').textContent = (c.p3 ? c.p3[2].toFixed(1) + '±' + c.p3[3].toFixed(1) : '–') + ' · ' + S.zDev.toFixed(1) + ' m'; $('h-n').textContent = c.meas.filter(Boolean).length + ' / ' + S.anchors.length;
  $('tb').innerHTML = S.anchors.map((a, i) => { const m = c.meas[i], t = c.out ? c.out.trust[i] : 0; return `<tr><td><b>${a.id}</b></td><td>${S.dead.has(a.id) ? 'off' : m ? m.rssi + ' dBm' : 'lost'}</td><td>${m ? m.r3.toFixed(1) + ' m' : '–'}</td><td><div class="tb"><i style="width:${Math.round(t * 100)}%;background:${trustCol(t)}"></i></div></td></tr>`; }).join('');
  const bad = c.out && S.anchors.map((a, i) => ({ a, t: c.out.trust[i], r: c.out.reasons[i] })).filter(x => x.t < 0.7 && x.r).sort((a, b) => a.t - b.t)[0]; $('n-reason').innerHTML = bad ? '<b>' + bad.a.id + ':</b> ' + bad.r : 'All readings look consistent.';
  const nh = c.meas.filter(Boolean).length; $('p-mode').className = 'pill ' + (nh >= 3 ? 'ok' : nh >= 1 ? 'warn' : 'bad'); $('p-mode').lastElementChild.textContent = 'Simulated radio · ' + nh + ' anchors heard';
  if (S.src === 'phone') $('n-ph').textContent = 'Steps ' + S.steps + ' · heading ' + (S.heading == null ? '–' : S.heading.toFixed(0) + '°') + ' · ' + (performance.now() - lastMotion < 1500 && lastMotion ? 'sensors live' : 'no sensor data');
  const sp = $('spark'), sg = sp.getContext('2d'), W = sp.clientWidth, Hh = sp.clientHeight; if (sp.width !== W * 2) { sp.width = W * 2; sp.height = Hh * 2; } sg.setTransform(2, 0, 0, 2, 0, 0); sg.clearRect(0, 0, W, Hh);
  const mx = Math.max(1, ...stats.loc.slice(-300), ...stats.ls.slice(-300)); [['ls', COL.ls], ['loc', COL.locus]].forEach(([k, col]) => { const a = stats[k].slice(-300); if (a.length < 2) return; sg.beginPath(); a.forEach((v, i) => { const x = i / 299 * W, y = Hh - 6 - v / mx * (Hh - 14); i ? sg.lineTo(x, y) : sg.moveTo(x, y); }); sg.strokeStyle = col; sg.lineWidth = 2; sg.stroke(); });
  sg.fillStyle = '#7A9AA6'; sg.font = '600 10px Figtree'; sg.fillText('error (m) · green LOCUS · amber trilateration · max ' + mx.toFixed(1), 6, 11);
}

/* ---------- phone <-> laptop sync (WebRTC data channel via PeerJS; no server stores anything) ----------
   Position packets: sent by whichever device has an ACTIVE source (phone/gps/tap); a device on Demo auto-follows them.
   Settings: a full snapshot is exchanged whenever it changes (last writer wins) so faults, anchors, room size etc. match.
   Each device keeps its own camera angle.                                                                              */
const remote = { pos: null, h: null, t: 0 };
function cfgSnapshot() {
  return {
    space: S.space, W: S.W, H: S.H, Z: S.Z, n: S.n, zDev: S.zDev, zKnow: S.zKnow, zAssume: S.zAssume, partition: S.partition, model: S.model, sigDb: S.sigDb, sigM: S.sigM, loss: S.loss, rssi1m: S.rssi1m, pn: S.pn, scorer: S.scorer, scale: S.scale,
    dead: [...S.dead].sort(), obstruct: [...S.obstruct].sort(), drift: [...S.drift].sort(), anchors: (S.all || []).map(a => [a.id, +a.x.toFixed(2), +a.y.toFixed(2), +a.z.toFixed(2)])
  };
}
function applyCfg(c) {
  const old = cfgSnapshot(), structural = ['space', 'W', 'H', 'Z', 'partition'].some(k => old[k] !== c[k]) || JSON.stringify(old.anchors) !== JSON.stringify(c.anchors) || old.n !== c.n;
  ['space', 'W', 'H', 'Z', 'n', 'zDev', 'zKnow', 'zAssume', 'partition', 'model', 'sigDb', 'sigM', 'loss', 'rssi1m', 'pn', 'scale'].forEach(k => S[k] = c[k]);
  S.dead = new Set(c.dead); S.obstruct = new Set(c.obstruct); S.drift = new Set(c.drift);
  const scorerChanged = S.scorer !== c.scorer; S.scorer = c.scorer;
  if (structural) {
    if (S.space === 'room') S.all = c.anchors.map(a => ({ id: a[0], x: a[1], y: a[2], z: a[3] }));
    rebuild(S.space === 'room');
    if (S.space === 'hospital') c.anchors.forEach((a, i) => { if (S.all[i]) S.all[i].z = a[3]; });
  } else if (scorerChanged) newEngine();
  syncUIFromState();
}
function syncUIFromState() {
  const set = (id, v, lab, f) => { const e = $(id); if (e) e.value = v; if (lab && $(lab)) $(lab).textContent = f ? f(v) : v; };
  set('i-W', S.W, 'v-W', v => (+v).toFixed(1)); set('i-H', S.H, 'v-H', v => (+v).toFixed(1)); set('i-Z', S.Z, 'v-Z', v => (+v).toFixed(1)); set('i-n', S.n, 'v-n'); set('i-zd', S.zDev, 'v-zd', v => (+v).toFixed(2) + ' m'); set('i-za', S.zAssume, 'v-za', v => (+v).toFixed(2) + ' m');
  set('i-loss', Math.round(S.loss * 100), 'v-loss', v => v + '%'); $('i-model').value = S.model; sigUI(); $('i-r1').value = S.rssi1m; $('i-pn').value = S.pn; $('i-scale').value = S.scale;
  $('g-part').setAttribute('aria-pressed', S.partition); $('g-zknow').setAttribute('aria-pressed', S.zKnow); $('f-zas').style.display = S.zKnow ? 'none' : 'flex';
  setSeg('spaces', 'sp', S.space); setSeg('scorer', 'sc', S.scorer); spaceNote(); renderAnchors(); syncFaults();
}
const Sync = (() => {
  let peer = null, conns = [], role = null, code = null, lastSent = '', lastRecv = '', posT = 0;
  const say = m => { $('n-sync').textContent = m; };
  const open = () => conns.filter(c => c.open);
  function ready() { if (typeof Peer === 'undefined') { say('Sync library could not load (offline?). Check your connection and reload.'); return false; } return true; }
  function wire(c) {
    c.on('open', () => {
      conns.push(c); $('b-leave').disabled = false; say('Connected (' + open().length + ' device' + (open().length > 1 ? 's' : '') + '). Pick Phone motion or Tap on the device that should move the dot.');
      if (role === 'host') { c.send({ t: 'cfg', c: cfgSnapshot() }); lastSent = JSON.stringify(cfgSnapshot()); }
    });
    c.on('data', d => {
      if (d.t === 'cfg') { lastRecv = JSON.stringify(d.c); if (lastRecv !== JSON.stringify(cfgSnapshot())) applyCfg(d.c); lastSent = JSON.stringify(cfgSnapshot()); }
      else if (d.t === 'pos') { remote.pos = d.p; remote.h = d.h; remote.t = performance.now(); if (S.src === 'demo') setSource('remote'); if (S.src === 'remote') { if (d.h != null) S.heading = d.h; if (d.st != null) S.steps = d.st; } }
    });
    c.on('close', () => { conns = conns.filter(x => x !== c); if (!open().length) { say(role === 'join' ? 'Host disconnected.' : 'Waiting for a device to join… code ' + code); if (S.src === 'remote') setSource('demo'); } });
    c.on('error', e => say('Link error: ' + (e.type || e.message || e)));
  }
  function qr(url) { try { const q = qrcode(0, 'M'); q.addData(url); q.make(); $('qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 1 }); } catch (e) { $('qr').textContent = ''; } }
  function share() {
    if (!ready()) return; leave(); code = String(1000 + Math.floor(Math.random() * 9000)); role = 'host'; say('Starting…');
    peer = new Peer('locus-rl-' + code);
    peer.on('open', () => { const url = location.href.split('#')[0] + '#join=' + code; $('o-share').style.display = 'flex'; $('n-share').innerHTML = 'Code <b style="font-size:20px;letter-spacing:.15em">' + code + '</b> — scan the QR or open the link on the other device.'; $('i-url').value = url; qr(url); $('b-leave').disabled = false; say('Waiting for a device to join… code ' + code); });
    peer.on('connection', wire); peer.on('error', e => { say(e.type === 'unavailable-id' ? 'Code clash, press Share again.' : 'Sync error: ' + e.type); });
  }
  function join(cd) {
    if (!ready()) return; if (!/^\d{4}$/.test(cd)) { say('Enter the 4-digit code shown on the other device.'); return; }
    leave(); role = 'join'; code = cd; say('Connecting to ' + cd + '…'); peer = new Peer();
    peer.on('open', () => { const c = peer.connect('locus-rl-' + cd, { reliable: true }); wire(c); setTimeout(() => { if (!open().length) say('Could not reach ' + cd + '. Same Wi-Fi? Is the code right? Or press Share on this device instead.'); }, 9000); });
    peer.on('error', e => say(e.type === 'peer-unavailable' ? 'No session with code ' + cd + '.' : 'Sync error: ' + e.type));
  }
  function leave() {
    conns.forEach(c => { try { c.close(); } catch (e) { } }); conns = []; if (peer) { try { peer.destroy(); } catch (e) { } } peer = null; role = null;
    $('b-leave').disabled = true; $('o-share').style.display = 'none'; say('Not connected.'); if (S.src === 'remote') setSource('demo');
  }
  /* called every tick (10 Hz) */
  function pump(now) {
    const oc = open(); if (!oc.length) return;
    if (S.src !== 'demo' && S.src !== 'remote') oc.forEach(c => c.send({ t: 'pos', p: S.pos, h: S.heading, st: S.steps }));
    if (now - posT > 400) { posT = now; const cur = JSON.stringify(cfgSnapshot()); if (cur !== lastSent && cur !== lastRecv) oc.forEach(c => c.send({ t: 'cfg', c: JSON.parse(cur) })); lastSent = cur; }
  }
  return { share, join, leave, pump, get active() { return open().length > 0; } };
})();

/* ---------- main loop ---------- */
let acc = 0, lastT = performance.now(), frameN = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; acc += dt;
  if (anim) { const k = Math.min(1, (now - anim.t0) / 600), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; S.view.tilt = anim.a + (anim.b - anim.a) * e; S.view.yaw = anim.c + (anim.d - anim.c) * e; syncView(); if (k >= 1) anim = null; }
  while (acc >= 0.1) { acc -= 0.1; updateTruth(0.1); tick(); Sync.pump(now); }
  hit = []; draw(); if (++frameN % 6 === 0) updateReport();
  requestAnimationFrame(loop);
}
function init() {
  $('i-W').value = S.W; $('v-W').textContent = S.W.toFixed(1); $('i-H').value = S.H; $('v-H').textContent = S.H.toFixed(1); $('i-Z').value = S.Z; $('v-Z').textContent = S.Z.toFixed(1); $('i-n').value = S.n; $('v-n').textContent = S.n;
  $('i-zd').value = S.zDev; $('v-zd').textContent = S.zDev.toFixed(2) + ' m'; S.zAssume = S.zDev; $('i-model').value = S.model; $('i-loss').value = S.loss * 100; $('v-loss').textContent = Math.round(S.loss * 100) + '%'; $('i-r1').value = S.rssi1m; $('i-pn').value = S.pn; $('i-step').value = S.stepLen; $('i-scale').value = S.scale;
  sigUI(); bindUI(); resize(); rebuild(false); spaceNote(); renderAnchors(); syncFaults(); syncView(); setSource('demo');
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
  const jm = /join=(\d{4})/.exec(location.hash); if (jm) { document.querySelector('.tabs [data-t=track]').click(); $('i-code').value = jm[1]; setTimeout(() => Sync.join(jm[1]), 400); }
  requestAnimationFrame(loop);
  window.__locus = { Sync, remote, S, tick, get cur() { return cur; }, get stats() { return stats; }, phoneStep, setSource, rebuild, onMotion, onOri };
}
init();
