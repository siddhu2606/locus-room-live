# L.O.C.U.S — Room Live

**Live demo:** https://siddhu2606.github.io/locus-room-live/ &nbsp;·&nbsp; **Live Room (laptop):** [room.html](https://siddhu2606.github.io/locus-room-live/room.html) &nbsp;·&nbsp; **Phone (mobile):** [phone.html](https://siddhu2606.github.io/locus-room-live/phone.html)

Explainable indoor positioning with a handful of cheap BLE anchors. This repo extends the original LOCUS project
([vidulaj382-sys/LOCUS](https://github.com/vidulaj382-sys/LOCUS)) with **Room Live**: walk with your phone and watch the system track you in 3D, entirely in the browser (GitHub Pages, no backend).

## What's new
| | |
|---|---|
| **Beacons tab (new)** | *Source:* **Demo (simulated receiver)** or **Receiver phone** (real BLE RSSI from the [LOCUS Beacon](https://github.com/siddhu2606/locus-beacon-live) app, polled from `http://<phone-ip>:8080/api/samples`). *Room and beacons:* width/depth, presets **2 · pair / 3 · triangle / 4 · square / 6 · ring**, a table of beacons 1-6 with on/off, x/y, live RSSI, range, trust bar and a per-beacon **1 m** calibration button, **guided calibration**, health dots + warnings (no packets for N s, weak signal, low packet rate, down-weighted, beacons in a line), trail on/off/clear and walked path length. In receiver mode, tap the floor where you really stand to log an error sample. |
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
```
Backend (optional, original LOCUS): see `SETUP.md`.
