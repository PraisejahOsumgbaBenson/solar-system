/**
 * Heliocentric planetary positions from the JPL "approximate positions of the
 * major planets" model (E. M. Standish), the 1800 to 2050 table. Each planet
 * has six orbital elements at J2000 plus their rates of change per Julian
 * century, which is what makes the positions accurate for the current date and
 * not just at the epoch.
 *
 * Source: JPL Solar System Dynamics, ssd.jpl.nasa.gov/planets/approx_pos.html.
 * Accuracy is a few arcminutes over 1800 to 2050, which is far more than a
 * visualisation needs.
 *
 * Distances are AU, angles degrees in the interface and radians internally,
 * time is days since J2000 (2000-01-01 12:00 TT).
 */

export interface KeplerianElements {
  /** Semi-major axis, AU. */
  a: number;
  /** Eccentricity. */
  e: number;
  /** Inclination to the ecliptic, degrees. */
  i: number;
  /** Mean longitude, degrees. */
  L: number;
  /** Longitude of perihelion, degrees. */
  longPeri: number;
  /** Longitude of the ascending node, degrees. */
  longNode: number;
  /** Rate of a, AU per century. */
  aRate: number;
  eRate: number;
  iRate: number;
  /** Rate of L, degrees per century. */
  LRate: number;
  longPeriRate: number;
  longNodeRate: number;
}

export interface HeliocentricPosition {
  /** Ecliptic x, AU. */
  x: number;
  /** Ecliptic y, AU. */
  y: number;
  /** Ecliptic z, AU. */
  z: number;
  /** Distance from the Sun, AU. */
  r: number;
}

const DEG = Math.PI / 180;
const JULIAN_CENTURY_DAYS = 36525;
const AU_KM = 1.495978707e8;
const SECONDS_PER_DAY = 86400;

/** Solve Kepler's equation `E - e sin E = M` for E, via Newton's method. */
export function solveKepler(meanAnomalyRad: number, e: number): number {
  let E = meanAnomalyRad;
  for (let k = 0; k < 12; k++) {
    const f = E - e * Math.sin(E) - meanAnomalyRad;
    const fp = 1 - e * Math.cos(E);
    E -= f / fp;
    if (Math.abs(f) < 1e-12) {
      break;
    }
  }
  return E;
}

/** Orbital period in days, from the semi-major axis (Kepler's third law). */
export function orbitalPeriodDays(a: number): number {
  return 365.256898 * Math.pow(a, 1.5);
}

/**
 * Position in the plane of an orbit, rotated into the reference frame.
 * Angles in radians: inclination, ascending node, argument of perihelion, and
 * the mean anomaly. Returns coordinates in the same length unit as `a`.
 */
export function orbitalPosition(
  a: number,
  e: number,
  inc: number,
  node: number,
  argPeri: number,
  meanAnomalyRad: number,
): { x: number; y: number; z: number } {
  const E = solveKepler(meanAnomalyRad, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);

  const cosw = Math.cos(argPeri);
  const sinw = Math.sin(argPeri);
  const cosO = Math.cos(node);
  const sinO = Math.sin(node);
  const cosi = Math.cos(inc);
  const sini = Math.sin(inc);

  return {
    x:
      (cosw * cosO - sinw * sinO * cosi) * xp +
      (-sinw * cosO - cosw * sinO * cosi) * yp,
    y:
      (cosw * sinO + sinw * cosO * cosi) * xp +
      (-sinw * sinO + cosw * cosO * cosi) * yp,
    z: sinw * sini * xp + cosw * sini * yp,
  };
}

/** Heliocentric ecliptic position (AU) at `days` after J2000. */
export function positionAt(
  elements: KeplerianElements,
  days: number,
): HeliocentricPosition {
  const T = days / JULIAN_CENTURY_DAYS;

  const a = elements.a + elements.aRate * T;
  const e = elements.e + elements.eRate * T;
  const inc = (elements.i + elements.iRate * T) * DEG;
  const L = elements.L + elements.LRate * T;
  const longPeri = elements.longPeri + elements.longPeriRate * T;
  const longNode = elements.longNode + elements.longNodeRate * T;

  const argPeri = (longPeri - longNode) * DEG;
  const M = (L - longPeri) * DEG;

  const p = orbitalPosition(a, e, inc, longNode * DEG, argPeri, M);
  return { x: p.x, y: p.y, z: p.z, r: Math.hypot(p.x, p.y, p.z) };
}

/**
 * Heliocentric velocity at `days` after J2000, in AU per day, by central
 * difference. Also returns the speed in km/s.
 */
export function velocityAt(
  elements: KeplerianElements,
  days: number,
): { vx: number; vy: number; vz: number; speedKmS: number } {
  const dt = 0.01;
  const before = positionAt(elements, days - dt);
  const after = positionAt(elements, days + dt);
  const vx = (after.x - before.x) / (2 * dt);
  const vy = (after.y - before.y) / (2 * dt);
  const vz = (after.z - before.z) / (2 * dt);
  const speedAuPerDay = Math.hypot(vx, vy, vz);
  const speedKmS = (speedAuPerDay * AU_KM) / SECONDS_PER_DAY;
  return { vx, vy, vz, speedKmS };
}

/** Ecliptic longitude, degrees, at `days` after J2000. */
export function longitudeDeg(
  elements: KeplerianElements,
  days: number,
): number {
  const p = positionAt(elements, days);
  return ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360;
}

/** Days since J2000 for a JavaScript date. */
export function daysSinceJ2000(date: Date): number {
  const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
  return (date.getTime() - j2000) / 86400000;
}
