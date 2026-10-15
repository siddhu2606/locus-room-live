# L.O.C.U.S — simulation vs. hardware

**The math is real. Only the radio signal is synthetic** (until real BLE anchors are paired).

```
 ground truth: true position (x, y, z) + known anchor layout
        |
 SIGNAL SOURCE  <- the only substituted step
   Simulated : path-loss formula + shadowing/multipath/body noise -> synthetic RSSI per anchor
   Real      : Chrome Web Bluetooth scan (Android) -> measured RSSI per anchor      (Staff app > BLE tab)
        |   same input shape either way
 SHARED ENGINE: trust scorer (heuristic or LightGBM) -> trust-weighted position estimator + particle filter
        |
 estimate (x^, y^) [+ height z^]   ->   error = distance(estimate, truth)
```

| Real, runs unchanged on hardware | Synthetic, stands in for hardware |
|---|---|
| Trust-scorer ML model and its training | The RSSI numbers themselves |
| Multilateration / filtering maths | (generated from a log-distance path-loss model + noise) |
| Benchmark & error-measurement code | |
| Phone step counter + compass (Room Live) | |
| Web Bluetooth scanning (Staff app) | |

## Honest benchmark (hidden simulated set, 6 anchors, all noise levels)
2.7 m median error · 39 % of fixes within 2 m · 85 % ellipse coverage — see `docs/benchmark_summary.txt`.

## What Room Live adds
Your phone's *real motion* supplies the ground-truth path; the radio is simulated from it. So the engine is exercised with real human movement,
but the measured accuracy is still a simulation result. "Truth" is dead-reckoned (steps + compass), so it drifts over minutes.
