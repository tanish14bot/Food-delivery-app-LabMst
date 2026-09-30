/* Runnable check for the tracking maths: `node selfcheck.js` */
const assert = require('node:assert/strict');
const { pointAt, state, clock, routeD, ROUTE, SETUP, HANDOFF } = require('./track.js');

/* ---------- route geometry ---------- */
assert.deepEqual(pointAt(0), ROUTE[0], 'rider starts at the kitchen');
assert.deepEqual(pointAt(1), ROUTE.at(-1), 'rider ends at the door');
assert.deepEqual(pointAt(-5), ROUTE[0], 'progress clamps low');
assert.deepEqual(pointAt(9), ROUTE.at(-1), 'progress clamps high');
assert.ok(routeD().startsWith('M') && routeD().includes(' L'), 'path data is well formed');

// pointAt must interpolate by distance along the polyline, not by waypoint index.
const total = ROUTE.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - ROUTE[i][0], p[1] - ROUTE[i][1]), 0);
let d = 0.5 * total, ex = ROUTE.at(-1)[0], ey = ROUTE.at(-1)[1];
for (let i = 1; i < ROUTE.length; i++) {
  const [x1, y1] = ROUTE[i - 1], [x2, y2] = ROUTE[i];
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (d <= len) { ex = x1 + (x2 - x1) * (d / len); ey = y1 + (y2 - y1) * (d / len); break; }
  d -= len;
}
const mid = pointAt(0.5);
assert.ok(Math.abs(mid[0] - ex) < 1e-9 && Math.abs(mid[1] - ey) < 1e-9, 'pointAt matches an independent walk');

for (let t = 0; t <= 1.0001; t += 0.01) {
  const [x, y] = pointAt(t);
  assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, 'position stays on the map at t=' + t.toFixed(2));
}

/* ---------- order timeline ---------- */
const MIN = 60000 / 10;                        // one simulated order-minute, in real ms
const at = mins => state({ placedAt: 0, etaMins: 30, cancelled: false }, mins * MIN);

assert.equal(at(0).key, 'confirmed');
assert.equal(at(SETUP / 60 + 0.01).key, 'prep', 'preparing after SETUP');
assert.equal(at(HANDOFF / 60 + 0.01).key, 'onway', 'out for delivery after HANDOFF');
assert.equal(at(29.9).key, 'onway', 'still riding just before the ETA');
assert.equal(at(30).key, 'delivered', 'delivered at the ETA');
assert.equal(at(99).key, 'delivered', 'stays delivered');
assert.equal(at(30).progress, 1);
assert.equal(state({ placedAt: 0, etaMins: 30, cancelled: true }, MIN).key, 'cancelled', 'cancelled wins');

assert.equal(at(0).progress, 0, 'rider waits at the kitchen while the food is prepared');
assert.ok(at(HANDOFF / 60 + 0.01).progress < 0.01, 'rider sets off from the kitchen');
assert.ok(Math.abs(at(19.2).progress - 0.5) < 0.02, 'rider is ~halfway through the ride window');

let last = Infinity;
for (let m = 0; m <= 30; m += 0.25) {
  const r = at(m).remaining;
  assert.ok(r <= last + 1e-6, 'ETA counts down at minute ' + m);
  last = r;
}
assert.equal(at(30).remaining, 0);
assert.equal(clock(0), '00:00');
assert.equal(clock(90), '01:30');
assert.equal(clock(-4), '00:00');

console.log('selfcheck: all assertions passed');
