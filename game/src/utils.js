// utils.js — small math and random helpers shared by every Palmera Bay module.
// Nothing here knows about three.js or the game: pure numbers, so it is easy to test.

/** Clamp a number into [lo, hi]. */
export function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Linear interpolation between a and b. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed angle from a to b, in radians, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Move angle a toward b by at most maxStep radians. */
export function angleLerp(a, b, maxStep) {
  const d = angleDelta(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

/** 2D distance between two {x, z} points. */
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * mulberry32: a tiny deterministic PRNG. The city, traffic and missions all draw
 * from one seeded stream so a screenshot seed always stages the same world.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick one element of an array with a random() stream. */
export function pick(random, array) {
  return array[Math.floor(random() * array.length)];
}

/** Integer in [lo, hi] from a random() stream. */
export function randInt(random, lo, hi) {
  return lo + Math.floor(random() * (hi - lo + 1));
}

/** Float in [lo, hi] from a random() stream. */
export function randFloat(random, lo, hi) {
  return lo + random() * (hi - lo);
}

/** Format dollars as "$1,250". */
export function money(amount) {
  return '$' + Math.round(amount).toLocaleString('en-US');
}

/** Format a speed in km/h from units-per-second. */
export function kmh(unitsPerSecond) {
  return Math.round(unitsPerSecond * 3.6);
}
