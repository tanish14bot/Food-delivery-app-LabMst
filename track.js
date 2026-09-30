/* Forkly — pure logic for the faked live tracking map and order timeline.
   No DOM, no storage: it can be checked with `node selfcheck.js`. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ForklyTrack = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SPEED = 10;                 // ponytail: 1 real second = 10 order-seconds, so the demo is watchable
  const SETUP = 60, HANDOFF = 480;  // order-seconds: confirmed -> preparing -> out for delivery

  // Waypoints in % of the map box, kitchen -> doorstep. Shared by the SVG path and the rider's position.
  const ROUTE = [[10, 80], [26, 80], [26, 52], [48, 52], [48, 30], [70, 30], [70, 18], [88, 18]];
  const STEPS = ['Confirmed', 'Preparing', 'On the way', 'Delivered'];

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const clock = s => {
    s = Math.max(0, Math.round(s));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  const routeD = () => 'M' + ROUTE.map(([x, y]) => x + ',' + y).join(' L');

  const SEG = (() => {
    const seg = [], len = [];
    for (let i = 1; i < ROUTE.length; i++) {
      const [x1, y1] = ROUTE[i - 1], [x2, y2] = ROUTE[i];
      seg.push([[x1, y1], [x2, y2]]);
      len.push(Math.hypot(x2 - x1, y2 - y1));
    }
    return { seg, len, total: len.reduce((a, b) => a + b, 0) };
  })();

  /** Position on the route at t (0..1), measured by distance so the rider keeps a steady pace. */
  function pointAt(t) {
    let d = clamp(t, 0, 1) * SEG.total;
    for (let i = 0; i < SEG.seg.length; i++) {
      const last = i === SEG.seg.length - 1;
      if (d <= SEG.len[i] || last) {
        const r = SEG.len[i] ? clamp(d / SEG.len[i], 0, 1) : 0;
        const [[x1, y1], [x2, y2]] = SEG.seg[i];
        return [x1 + (x2 - x1) * r, y1 + (y2 - y1) * r];
      }
      d -= SEG.len[i];
    }
    return ROUTE[ROUTE.length - 1];
  }

  /** Where an order stands right now. `now` is injectable so this stays testable. */
  function state(o, now = Date.now()) {
    if (o.cancelled) return { key: 'cancelled', label: 'Cancelled', idx: -1, remaining: 0, progress: 0 };
    const t = (now - o.placedAt) / 1000 * SPEED, dur = o.etaMins * 60;
    const base = { t, dur, remaining: Math.max(0, dur - t) };
    if (t >= dur) return { ...base, key: 'delivered', label: 'Delivered', idx: 3, remaining: 0, progress: 1 };
    if (t >= HANDOFF) return { ...base, key: 'onway', label: 'Out for delivery', idx: 2, progress: clamp((t - HANDOFF) / (dur - HANDOFF), 0, 1) };
    if (t >= SETUP) return { ...base, key: 'prep', label: 'Preparing your food', idx: 1, progress: 0 };
    return { ...base, key: 'confirmed', label: 'Order confirmed', idx: 0, progress: 0 };
  }

  const pill = key => ({ delivered: 'ok', cancelled: 'red', onway: 'info', confirmed: '', prep: '' }[key] || '');

  return { SPEED, SETUP, HANDOFF, ROUTE, STEPS, clamp, clock, routeD, pointAt, state, pill };
});
