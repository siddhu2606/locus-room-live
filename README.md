# L.O.C.U.S — Room Live

**Live demo:** https://siddhu2606.github.io/locus-room-live/ &nbsp;·&nbsp; **Live Room (laptop):** [room.html](https://siddhu2606.github.io/locus-room-live/room.html) &nbsp;·&nbsp; **Phone (mobile):** [phone.html](https://siddhu2606.github.io/locus-room-live/phone.html)

Explainable indoor positioning with a handful of cheap BLE anchors. This repo extends the original LOCUS project
([vidulaj382-sys/LOCUS](https://github.com/vidulaj382-sys/LOCUS)) with **Room Live**: walk with your phone and watch the system track you in 3D, entirely in the browser (GitHub Pages, no backend).

## What's new
| | |
|---|---|
| **Moving beacons (new, `moving.html`)** | Beacons can move (drag, simulated walking, or `update_beacon_position()` for real phone data). Every move gets an arrow, distance, bearing, dx/dy, a trail, totals and a log entry; the estimator uses the new positions with their uncertainty. Includes a fixed-vs-moving comparison. See [Moving beacons](#moving-beacons-movinghtml). |
| **Beacons tab (new)** | *Source:* **Demo (simulated receiver)** or **Receiver phone** (real BLE RSSI from the [LOCUS Beacon](https://github.com/siddhu2606/locus-beacon-live) app, polled from `http://<phone-ip>:8080/api/samples`). *Room and beacons:* width/depth, presets **2 · pair / 3 · triangle / 4 · square / 6 · ring**, a table of beacons 1-6 with on/off, x/y, live RSSI, range, trust bar and a per-beacon **1 m** calibration button, **guided calibration**, health dots + warnings (no packets for N s, weak signal, low packet rate, down-weighted, beacons in a line), trail on/off/clear and walked path length. In receiver mode, tap the floor where you really stand to log an error sample. |
| **Trust scorer (new, under the 3D view)** | Live trust (0-1) of every beacon with the reason ("Packet lost", "No packets for 2 s", "Reads +2 m beyond what the walls explain", ...), each beacon's **share of the position fix** (weight = trust²) as a stacked bar, range measured vs true, **Kill / Block** per beacon, a **20-second trust trace** with event marks and hover values, and KPIs: usable beacons, lowest trust, 90% uncertainty, LOCUS vs trilateration error. Heuristic / ML (LightGBM) switch, plus the scoring rules. Trust labels and share-weighted links are drawn on the map too. |
| **Phone-driven live simulation** | Scan the QR on `room.html` to open `phone.html` on your phone. Steps (accelerometer) + compass move the dot in your own room; the engine localises from simulated RSSI of the anchors. On the laptop: demo walker or tap-to-walk / WASD / joystick (*Beacons → Walker*). |
| **Phone ↔ laptop live sync** | The Live Room auto-hosts a session and shows a 4-digit code + QR; open it on the other device. Walk with the phone, watch the big 3D view on the laptop. Position streams phone → laptop; settings (room size, anchors, faults, scorer…) sync both ways; each device keeps its own camera angle. Direct WebRTC link via PeerJS (public signalling only; no data stored). Same Wi-Fi is most reliable. |
| **Camera angle: top ↔ side** | Top-down, angled and side-on views with tilt/turn sliders, drag to orbit, pinch/wheel to zoom. |
| **Height (3D)** | Anchors have heights; the phone has a height (floor/pocket/hand/overhead). Per-link **Δz** is drawn in the view, and with ≥4 anchors at different heights LOCUS **estimates your height** (shown with ± uncertainty, only when observable). Turn off *System knows the height* to see what a wrong assumed height costs. |
| **Trained dataset in the loop** | The LightGBM trust scorer trained on the dataset (`data/`) is exported to JSON (`scripts/export_trust_js.py`, validated to 3e-7 against LightGBM) and runs in the browser. Switch *Heuristic ↔ ML* in the Radio tab. The **Hospital** space is the exact 40×24 m map the model was trained on — scale your phone walk onto it with *Walk scale*. |
| **Realistic radio** | RSSI model with dB shadowing, 1 dB quantisation, packet loss, wall/body loss; fault injection (kill / block / drift an anchor). |
| **Report** | Live CEP50 / CEP95 for LOCUS vs trilateration vs Kalman, per-anchor RSSI/trust/reason, CSV export. |

## Two pages, in sync
* **Live Room** (`room.html`, laptop): the big 3D view. It auto-hosts a session and shows a **QR code + 4-digit code** in the corner.
* **Phone** (`phone.html`, mobile): scan the QR, tap **Enable sensors**, face the top wall, tap **Align**, walk. Your steps + compass move the dot in the Live Room; the Live Room sends back the LOCUS estimate and error, and any room change (size, Hospital map, anchors) updates the phone's map.

## Using real beacons (Receiver phone mode)
1. Install the LOCUS Beacon app on 3-6 phones; give each a number 1-6 and start it as a beacon. One more phone taps **Receiver** and shows its address.
2. Browsers block plain-http requests from an https page, so on the laptop use *Receiver phone → Download this page* (or save `room.html`) and open the file; join the receiver's hotspot / Wi-Fi.
3. *Beacons → Receiver phone*, type the address, **Connect**. Set the room size, tick the beacons you placed and type their x, y (heights in *Space*). Run **Guided calibration** (receiver 1 m from each beacon).

## Moving beacons (`moving.html`)
**Live:** [moving.html](https://siddhu2606.github.io/locus-room-live/moving.html). The beacons can move, and the dashboard shows every move as it happens.

* **Three ways to move a beacon:**
  * **drag** it on the map;
  * switch it to **Moving**: it walks to random waypoints within `motion.homeRadius` of its station, pauses, and turns;
  * call **`update_beacon_position(id, x, y, timestamp)`**, either from the console or another script, as a `postMessage({type: 'beacon_position', id, x, y, timestamp})`, or on the `BroadcastChannel('locus-beacons')`. This is the hook for real phone data. An unknown id adds the beacon.
* **True vs believed:**
  * Each beacon has a **true** position, which only the simulator uses to make the radio readings, and a **believed** position, which is all the estimator sees.
  * Fixed beacons are surveyed, so believed = true.
  * Moving beacons report their own position with noise plus a slow drift (`report.*`).
  * External updates are taken as given, with `external.posSd` uncertainty.
* **Movement display:**
  * An arrow from the previous position to the new one, labelled with distance and bearing (`1.8 m · 47° NE`).
  * A banner with the newest move: `A2 moved 1.8 m toward 47° (north-east) · dx = +1.3 m, dy = +1.2 m`.
  * A fading trail of the last 15 positions.
  * Per beacon: total distance, distance in the last 10 s, speed, and readings in the window.
  * A scrolling **movement log**.
  * Moves below `display.threshold` (0.1 m) never reach the log. One log entry covers one move: it opens when the beacon leaves its resting point, updates live, and closes when the beacon stops or turns more than 35°.
* **Bearings:** y points **north** (up on the map); bearing = degrees clockwise from north.
* **Estimator:**
  * The existing LOCUS particle filter keeps its trust scorer and dead-beacon handling. It now takes each beacon's newest believed position (`Locus.moveAnchor`). That position's uncertainty is added to the reading's tolerance and likelihood (`anchor.sd`; 0 = old behaviour).
  * Usable readings go into a **sliding window** (`estimator.windowSec`, default 4 s). A moving beacon contributes readings from several positions.
  * A weighted least-squares fit over the window refines the estimate. Weight = trust² / (σ² + beacon sd² + (object speed × age)²).
* **Controls:** pause, reset, add / remove / kill a beacon, Fixed ↔ Moving per beacon, and sliders for noise, multipath, packet loss, beacon position noise and drift, walking speed, threshold and window length.
* **Comparison:** *Does moving help?* runs every layout in `compare.layouts`, fixed vs moving. Each pair uses the same object path, radio noise and estimator.

Code: `src/moving/config.js` (**every number**), `motion.js` (displacement, bearing, movement tracker), `sim.js` (simulator), `estimator.js`, `compare.js`, `dashboard.js` (UI only).

```
python build.py && python -m http.server 8765    # open http://localhost:8765/moving.html
node scripts/test_moving.js            # maths, tracker, estimator with moving / dead beacons, API (add --compare for the full table, ~15 s)
node scripts/test_moving_browser.js    # headless Chrome: external update, mouse drag, log, controls, comparison
```

**Measured** (`node scripts/test_moving.js --compare`: 4 seeds × 90 s, 12 × 8 m room, defaults in `config.js`; mean / worst error in metres):

| Layout | Fixed | Moving | Change |
|---|---|---|---|
| 4 corners | 1.06 / 2.60 | 1.11 / 2.95 | +5 % (worse) |
| 3 corners | 1.04 / 2.51 | 1.09 / 3.29 | +4 % (worse) |
| 3 on one wall | 0.97 / 2.25 | 1.07 / 3.38 | +10 % (worse) |
| 2 beacons | 2.02 / 5.21 | 1.51 / 5.05 | **−25 % (better)** |

**What this says:**
* Moving beacons only helped where the fixed layout was weak (2 beacons).
* Where fixed beacons already surround the object, moving made things slightly worse, for two reasons:
  * The multipath bias near one spot stays correlated over the 1–2 m a beacon walks in a few seconds. Averaging 8 s of a moving beacon's readings only cut the bias spread from 0.41 to 0.33 m.
  * A moving beacon's self-reported position is uncertain (about 0.09 m here).
* Letting beacons roam the whole room (`homeRadius: 0`) was worse still: 1.25 m mean, 6.8 m worst with 4 beacons. Their geometry often collapses.
* The **sliding window did not lower the error** in these runs. It is neutral with 3–4 beacons and worse with 2 (window 0 s: fixed 1.66, moving 1.38). It is on by default because it was asked for; set *Reading window* to 0 to compare.

**Assumptions** (all simulated, none measured on hardware):
* The multipath bias is a smooth random field of both ends of the link (sd 0.9 m, correlation about 1.5 m).
* Range noise is 0.3 m and packet loss is 10 %.
* The room is open, with no interior walls.
* The object walks at 0.5 m/s and stops 6 s at each waypoint.
* Moving beacons walk at 0.6 m/s within 2 m of their station, and report their position at 5 Hz with 5 cm noise plus drift.

Real BLE (body shadowing, phone orientation, beacon phones' own positioning error) may change these numbers either way.

## Honest limits
* In Demo the radio is **simulated** from the walker's / phone's position. Receiver phone mode uses real BLE RSSI, tested here only against a mock receiver that speaks the same API (`scripts/test_room_browser.js`), not yet with real phones.
* "Truth" is dead-reckoned: step counting is ±5–10 %, indoor compass is noisy — it drifts. Press *Align* often; this is a demo of the pipeline, not a ground-truth survey.
* The ML trust scorer was trained on a 40×24 m hospital; in a small room it is out of its training range, and even in-distribution it did **not** improve end-to-end error over the heuristic (see `SETUP.md`).
* Height estimation needs ≥4 anchors at different heights and low noise; otherwise it shows "–" instead of a guess.
* Benchmark (hidden simulated set, 6 anchors): 2.7 m median, 39 % within 2 m. See `docs/SIMULATION_VS_HARDWARE.md`.

## Develop
```
python build.py                 # rebuild room.html, LOCUS-Dashboard.html, LOCUS-Staff-App.html from src/
node test.js                    # original engine benchmark
node scripts/test_room.js       # Room Live maths: steps, heading, 3D, height, ML scorer
python -m http.server 8765 &    # then:
node scripts/test_room_browser.js   # headless-Chrome end-to-end (needs Chrome)
node scripts/test_sync_browser.js   # two Live Room pages: host/join, position + settings sync (needs internet)
node scripts/test_pair_browser.js   # Live Room + Phone page paired (needs internet)
node scripts/test_moving.js         # Moving beacons: maths, tracker, estimator (--compare: fixed vs moving table)
node scripts/test_moving_browser.js # Moving beacons page end-to-end (needs Chrome)
```
Backend (optional, original LOCUS): see `SETUP.md`.
