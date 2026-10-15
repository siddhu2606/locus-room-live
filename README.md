# L.O.C.U.S — Room Live

**Live demo:** https://siddhu2606.github.io/locus-room-live/ &nbsp;·&nbsp; **Room Live:** https://siddhu2606.github.io/locus-room-live/room.html

Explainable indoor positioning with a handful of cheap BLE anchors. This repo extends the original LOCUS project
([vidulaj382-sys/LOCUS](https://github.com/vidulaj382-sys/LOCUS)) with **Room Live**: walk with your phone and watch the system track you in 3D, entirely in the browser (GitHub Pages, no backend).

## What's new
| | |
|---|---|
| **Phone-driven live simulation** | Open `room.html` on your phone → *Track → Phone motion*. Steps (accelerometer) + compass move the dot in your own room; the engine localises from simulated RSSI of the anchors. Also: demo walker, tap-to-walk / WASD / joystick, GPS (outdoors). |
| **Phone ↔ laptop live sync** | *Track → Share this session* on one device shows a 4-digit code + QR; open it on the other device. Walk with the phone, watch the big 3D view on the laptop. Position streams phone → laptop; settings (room size, anchors, faults, scorer…) sync both ways; each device keeps its own camera angle. Direct WebRTC link via PeerJS (public signalling only; no data stored). Same Wi-Fi is most reliable. |
| **Camera angle: top ↔ side** | Top-down, angled and side-on views with tilt/turn sliders, drag to orbit, pinch/wheel to zoom. |
| **Height (3D)** | Anchors have heights; the phone has a height (floor/pocket/hand/overhead). Per-link **Δz** is drawn in the view, and with ≥4 anchors at different heights LOCUS **estimates your height** (shown with ± uncertainty, only when observable). Turn off *System knows the height* to see what a wrong assumed height costs. |
| **Trained dataset in the loop** | The LightGBM trust scorer trained on the dataset (`data/`) is exported to JSON (`scripts/export_trust_js.py`, validated to 3e-7 against LightGBM) and runs in the browser. Switch *Heuristic ↔ ML* in the Radio tab. The **Hospital** space is the exact 40×24 m map the model was trained on — scale your phone walk onto it with *Walk scale*. |
| **Realistic radio** | RSSI model with dB shadowing, 1 dB quantisation, packet loss, wall/body loss; fault injection (kill / block / drift an anchor). |
| **Report** | Live CEP50 / CEP95 for LOCUS vs trilateration vs Kalman, per-anchor RSSI/trust/reason, CSV export. |

## Using it on a phone
1. Open the live link on your phone (HTTPS is required for sensors). 2. *Track → Phone motion → Enable phone sensors* (iPhone asks permission once).
3. Face the **top wall** of the map and tap **Align**. 4. Walk. Set *Your height* for step length; use *Walk scale* to cover a bigger space.
Set the room size in the *Space* tab to match your real room.

## Honest limits
* The radio is **simulated** from the phone's position. Nothing is measured from real beacons here (that's the Staff app's Live BLE tab, still untested against real hardware).
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
node scripts/test_sync_browser.js   # two browsers: host/join, position + settings sync (needs internet)
```
Backend (optional, original LOCUS): see `SETUP.md`.
