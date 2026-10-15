/* ===== LOCUS Phone: the mobile sensor page. Steps + compass -> position in the room -> streamed to the Live Room page ===== */
const $ = id => document.getElementById(id);
const P = { space: 'room', W: 5, H: 4, Z: 2.7, partition: false, scale: 1, zDev: 1.3, anchors: [], pos: [2.5, 2], trail: [], heading: null, align: 0, fine: 0, steps: 0, stepLen: 0.7, est: null, err: null, nHeard: null, gotCfg: false, hold: false };
const sd = new StepDetector(), hf = new HeadingFilter(0.25), diag = { motion: 0, ori: 0, rate: 0, t0: 0, n0: 0, lastStep: 0 };
let sensOn = false, lastMotion = 0, absSeen = false, wake = null;

/* ---------- space (walls only matter for sliding; the Live Room owns the simulation) ---------- */
function partitions() { return P.partition && P.space === 'room' ? [[P.W / 2, 0, P.W / 2, P.H * 0.36], [P.W / 2, P.H * 0.64, P.W / 2, P.H]] : []; }
function applyCfg(c) {
  const first = !P.gotCfg; P.gotCfg = true;
  P.space = c.space; P.W = c.W; P.H = c.H; P.Z = c.Z; P.partition = c.partition; P.anchors = c.anchors || [];
  if (c.scale != null && !P.scaleTouched) { P.scale = c.scale; $('i-scale').value = c.scale; }
  if (c.zDev != null) { P.zDev = c.zDev; document.querySelectorAll('#zpre button').forEach(b => b.classList.toggle('on', Math.abs(+b.dataset.z - P.zDev) < 0.03)); }
  if (P.space === 'hospital') { setSite('hospital'); P.W = FLOOR.w; P.H = FLOOR.h; } else setRoom(P.W, P.H, P.anchors.map(a => ({ id: a[0], x: a[1], y: a[2] })), partitions());
  if (first || P.pos[0] > P.W || P.pos[1] > P.H) P.pos = P.space === 'hospital' ? [3, 12] : [P.W / 2, P.H / 2];
  P.pos = [Math.min(P.W - .12, Math.max(.12, P.pos[0])), Math.min(P.H - .12, Math.max(.12, P.pos[1]))];
}
function stepMove(dx, dy) {
  const [x, y] = P.pos, m = 0.12; let nx = Math.min(P.W - m, Math.max(m, x + dx)), ny = Math.min(P.H - m, Math.max(m, y + dy));
  if (crossesWall(x, y, nx, ny)) { if (!crossesWall(x, y, nx, y)) ny = y; else if (!crossesWall(x, y, x, ny)) nx = x; else { nx = x; ny = y; } }
  P.pos = [nx, ny];
}
function dirNow() { const h = P.heading == null ? P.align : P.heading; return (h - P.align - P.fine) * Math.PI / 180; }
function phoneStep() { P.steps++; const a = dirNow(), L = P.stepLen * P.scale; stepMove(L * Math.sin(a), -L * Math.cos(a)); }

/* ---------- sensors ---------- */
function onMotion(ev) {
  const a = (ev.accelerationIncludingGravity && ev.accelerationIncludingGravity.x != null) ? ev.accelerationIncludingGravity : (ev.acceleration && ev.acceleration.x != null ? ev.acceleration : null);
  if (!a) return; const now = performance.now(); lastMotion = now; diag.motion++; if (!diag.t0) diag.t0 = now;
  if (sd.push(a.x || 0, a.y || 0, a.z || 0, (ev.timeStamp && ev.timeStamp > 1) ? ev.timeStamp : now)) { diag.lastStep = now; phoneStep(); }
}
function onOri(ev) {
  diag.ori++; if (ev.type === 'deviceorientation' && absSeen) return; if (ev.type === 'deviceorientationabsolute') absSeen = true;
  let alpha = ev.alpha; if (typeof ev.webkitCompassHeading === 'number') alpha = 360 - ev.webkitCompassHeading;
  if (alpha == null || ev.beta == null) return; P.heading = hf.push(headingFromEuler(alpha, ev.beta, ev.gamma || 0));
}
async function enableSensors() {
  const note = $('n-sens');
  try {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      const r1 = await DeviceMotionEvent.requestPermission(); let r2 = 'granted'; if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) r2 = await DeviceOrientationEvent.requestPermission();
      if (r1 !== 'granted' || r2 !== 'granted') { note.textContent = 'Permission denied. iPhone: Settings → Safari → Motion & Orientation Access → on, then reload this page.'; return; }
    }
    if (!sensOn) { addEventListener('devicemotion', onMotion); addEventListener('deviceorientationabsolute', onOri, true); addEventListener('deviceorientation', onOri, true); sensOn = true; }
    try { if (navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); } catch (e) { }
    $('b-sens').textContent = 'Sensors on ✓'; note.innerHTML = 'Sensors on. Face the <b>top wall</b> of the map, tap <b>Align</b>, then walk with firm steps. Keep this screen on.';
    setTimeout(() => { if (!diag.motion) note.textContent = 'No motion data received. This browser has no motion sensors, or they are blocked (Chrome: Site settings → Motion sensors → Allow).'; }, 2000);
  } catch (e) { note.textContent = 'Could not start sensors: ' + (e && e.message || e); }
}
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && sensOn && navigator.wakeLock) { try { wake = await navigator.wakeLock.request('screen'); } catch (e) { } } });

/* ---------- link to the Live Room (PeerJS data channel) ---------- */
const Link = (() => {
  let peer = null, conn = null, code = null, want = false, retry = null;
  const pill = (cls, t) => { $('pill').className = 'pill ' + cls; $('pill-t').textContent = t; };
  const say = m => { $('n-pair').innerHTML = m; };
  function join(cd) {
    if (typeof Peer === 'undefined') { say('Sync library could not load. Check your connection and reload.'); return; }
    if (!/^[0-9]{4}$/.test(cd)) { say('Type the 4-digit code shown on the Live Room page.'); return; }
    leave(true); want = true; code = cd; pill('warn', 'Connecting…'); say('Connecting to room <b>' + cd + '</b>…');
    peer = new Peer(); peer.on('open', connect); peer.on('error', e => { if (e.type === 'peer-unavailable') { say('No Live Room with code <b>' + cd + '</b>. Open Live Room on the laptop first, and check the code.'); pill('warn', 'Not paired'); } else say('Link error: ' + e.type); schedule(); });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
  }
  function connect() {
    conn = peer.connect('locus-rl-' + code, { reliable: true });
    conn.on('open', () => { pill('ok', 'Room ' + code); say('Connected to Live Room <b>' + code + '</b>. Now enable sensors below.'); $('b-leave').disabled = false; try { localStorage.setItem('locus.phone.code', code); } catch (e) { } send({ t: 'patch', k: { zDev: P.zDev } }); });
    conn.on('data', d => { if (d.t === 'cfg') applyCfg(d.c); else if (d.t === 'est') { P.est = d.e; P.err = d.err; P.nHeard = d.n; } });
    conn.on('close', () => { pill('warn', 'Reconnecting…'); schedule(); }); conn.on('error', () => schedule());
    setTimeout(() => { if (conn && !conn.open && want) { say('Could not reach room <b>' + code + '</b>. Same Wi-Fi as the laptop? Is Live Room still open?'); } }, 9000);
  }
  function schedule() { if (!want) return; clearTimeout(retry); retry = setTimeout(() => { if (want && (!conn || !conn.open)) join(code); }, 3500); }
  function leave(quiet) { want = false; clearTimeout(retry); try { conn && conn.close(); } catch (e) { } try { peer && peer.destroy(); } catch (e) { } conn = peer = null; $('b-leave').disabled = true; if (!quiet) { pill('', 'Not paired'); say('Disconnected.'); } }
  function send(m) { if (conn && conn.open) try { conn.send(m); } catch (e) { } }
  return { join, leave, send, get open() { return !!(conn && conn.open); } };
})();

/* ---------- mini map ---------- */
const cv = $('map'), g = cv.getContext('2d');
function drawMap() {
  const w = cv.clientWidth, ar = P.W / P.H, h = Math.round(Math.min(380, Math.max(180, w / ar))), dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + 'px'; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const m = 14, s = Math.min((w - 2 * m) / P.W, (h - 2 * m) / P.H), ox = (w - P.W * s) / 2, oy = (h - P.H * s) / 2, X = x => ox + x * s, Y = y => oy + y * s;
  g.fillStyle = '#fff'; g.fillRect(X(0), Y(0), P.W * s, P.H * s);
  if (P.space === 'hospital') ROOMS.forEach(r => { const [a, b, c, d] = r.r; g.fillStyle = r.id === 'corr' ? 'rgba(34,195,230,.08)' : 'rgba(16,185,129,.05)'; g.fillRect(X(a), Y(b), (c - a) * s, (d - b) * s); });
  g.strokeStyle = '#0E9DBE'; g.lineWidth = 2; g.lineCap = 'round'; WALLS.forEach(q => { g.beginPath(); g.moveTo(X(q[0]), Y(q[1])); g.lineTo(X(q[2]), Y(q[3])); g.stroke(); });
  g.fillStyle = '#0E9DBE'; g.font = '700 9px Figtree'; g.textAlign = 'center';
  P.anchors.forEach(a => { g.beginPath(); g.arc(X(a[1]), Y(a[2]), 7, 0, 7); g.fillStyle = '#0E9DBE'; g.fill(); g.fillStyle = '#fff'; g.fillText(String(a[0]).replace('A', ''), X(a[1]), Y(a[2]) + 3); });
  if (P.trail.length > 1) { g.beginPath(); P.trail.forEach((q, i) => i ? g.lineTo(X(q[0]), Y(q[1])) : g.moveTo(X(q[0]), Y(q[1]))); g.strokeStyle = 'rgba(11,58,74,.35)'; g.lineWidth = 2; g.stroke(); }
  if (P.est) { g.beginPath(); g.arc(X(P.est[0]), Y(P.est[1]), 9, 0, 7); g.strokeStyle = '#10B981'; g.lineWidth = 3; g.stroke(); }
  const a = dirNow(), px = X(P.pos[0]), py = Y(P.pos[1]);
  g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.sin(a) * 26, py - Math.cos(a) * 26); g.strokeStyle = '#10B981'; g.lineWidth = 3.5; g.stroke();
  g.beginPath(); g.arc(px, py, 7, 0, 7); g.fillStyle = '#0B3A4A'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#7A9AA6'; g.font = '600 10px Figtree'; g.textAlign = 'right'; g.fillText(P.W.toFixed(1) + ' × ' + P.H.toFixed(1) + ' m  ·  dark = you · green ring = LOCUS estimate', w - 8, h - 5);
}
function updateText() {
  const now = performance.now(), live = lastMotion && now - lastMotion < 1500;
  if (diag.t0 && now - diag.t0 > 1000) { diag.rate = (diag.motion - diag.n0) / ((now - diag.t0) / 1000); diag.t0 = now; diag.n0 = diag.motion; }
  let hint = !sensOn ? 'Tap "Enable sensors".' : !diag.motion ? 'No motion events yet. Allow Motion sensors for this site and keep the screen on.' : !live ? 'Motion stopped - keep the screen on and this tab in front.' : P.steps === 0 ? 'Sensor is live. Walk with firm steps (or raise Step sensitivity).' : '';
  $('n-ph').innerHTML = 'Motion ' + (live ? '<b style="color:#0B8A5E">live</b>' : '<b style="color:#b13a3a">no data</b>') + ' · ' + diag.rate.toFixed(0) + ' Hz · compass ' + (P.heading == null ? '<b style="color:#b13a3a">none</b>' : '<b>' + P.heading.toFixed(0) + '°</b>') + ' · steps <b>' + P.steps + '</b>' + (hint ? '<br><span style="color:#8a5a00">' + hint + '</span>' : '');
  $('k-pos').textContent = P.pos[0].toFixed(1) + ', ' + P.pos[1].toFixed(1); $('k-err').textContent = P.err == null ? '–' : P.err.toFixed(2) + ' m'; $('k-n').textContent = P.nHeard == null ? '–' : P.nHeard;
}

/* ---------- loop: 10 Hz send, ~30 fps draw ---------- */
let lastT = performance.now(), acc = 0, k = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; acc += dt;
  if (P.hold) { const a = dirNow(), L = 1.1 * P.scale * dt; stepMove(L * Math.sin(a), -L * Math.cos(a)); }
  while (acc >= 0.1) { acc -= 0.1; const t = P.trail[P.trail.length - 1]; if (!t || Math.hypot(t[0] - P.pos[0], t[1] - P.pos[1]) > 0.04) { P.trail.push(P.pos.slice()); if (P.trail.length > 120) P.trail.shift(); } Link.send({ t: 'pos', p: P.pos, h: P.heading == null ? null : (P.heading - P.align - P.fine + 360) % 360, st: P.steps }); }
  drawMap(); if (++k % 8 === 0) updateText(); requestAnimationFrame(loop);
}

function init() {
  setRoom(P.W, P.H, [], []);
  $('b-join').onclick = () => Link.join($('code').value.trim()); $('b-leave').onclick = () => Link.leave();
  $('code').oninput = e => { e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4); if (e.target.value.length === 4) Link.join(e.target.value); };
  $('b-sens').onclick = enableSensors;
  $('b-align').onclick = () => { if (P.heading == null) { $('n-sens').textContent = 'No compass heading yet. Tap Enable sensors first (and move the phone a little).'; return; } P.align = P.heading; P.fine = 0; $('i-off').value = 0; $('v-off').textContent = '0°'; $('n-sens').innerHTML = 'Aligned. Walking forward now moves the dot toward the <b>top wall</b>.'; };
  $('b-step').onclick = phoneStep; $('b-center').onclick = () => { P.pos = P.space === 'hospital' ? [3, 12] : [P.W / 2, P.H / 2]; P.trail = []; };
  const hold = $('hold'); hold.onpointerdown = e => { P.hold = true; hold.classList.add('down'); try { hold.setPointerCapture(e.pointerId); } catch (x) { } }; hold.onpointerup = hold.onpointercancel = () => { P.hold = false; hold.classList.remove('down'); };
  $('i-hgt').onchange = () => { P.stepLen = Math.round(parseFloat($('i-hgt').value) * 0.415) / 100; $('i-step').value = P.stepLen.toFixed(2); };
  $('i-step').onchange = e => { P.stepLen = +e.target.value; }; $('i-scale').onchange = e => { P.scale = +e.target.value; P.scaleTouched = true; Link.send({ t: 'patch', k: { scale: P.scale } }); };
  $('i-sens').oninput = e => { sd.sens = +e.target.value; $('v-sens').textContent = '×' + sd.sens.toFixed(1); }; $('i-off').oninput = e => { P.fine = +e.target.value; $('v-off').textContent = P.fine + '°'; };
  document.querySelectorAll('#zpre button').forEach(b => b.onclick = () => { P.zDev = +b.dataset.z; document.querySelectorAll('#zpre button').forEach(x => x.classList.toggle('on', x === b)); Link.send({ t: 'patch', k: { zDev: P.zDev } }); });
  const m = /join=([0-9]{4})/.exec(location.hash); let saved = null; try { saved = localStorage.getItem('locus.phone.code'); } catch (e) { }
  if (m) { $('code').value = m[1]; setTimeout(() => Link.join(m[1]), 300); } else if (saved) $('code').value = saved;
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
  requestAnimationFrame(loop);
  window.__phone = { P, Link, applyCfg, onMotion, onOri, enableSensors, phoneStep };
}
init();
