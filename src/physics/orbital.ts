/**
 * Keplerian orbital mechanics. Pure functions, SI-free: distances in AU,
 * angles in degrees in the interface and radians internally, time in days
 * since J2000 (2000-01-01 12:00 TT).
 *
 * Elements are mean ecliptic J2000 values; positions track the real solar
 * system to good accuracy for the years around J2000.
 */

export interface OrbitalElements {
  /** Semi-major axis, AU. */
  a: number;
  /** Eccentricity. */
  e: number;
  /** Inclination to the ecliptic, degrees. */
  i: number;
  /** Longitude of the ascending node, degrees. */
  om: number;
  /** Argument of perihelion, degrees. */
  w: number;
  /** Mean anomaly at J2000, degrees. */
  M0: number;
  /** Orbital period, days. */
  period: number;
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

/** Mean anomaly in radians at `days` after J2000. */
export function meanAnomaly(elements: OrbitalElements, days: number): number {
  const deg = elements.M0 + (360 * days) / elements.period;
  return deg * DEG;
}

/**
 * Solve Kepler's equation `E - e sin E = M` for the eccentric anomaly E, via
 * Newton's method. Converges in a handful of iterations for e < 1.
 */
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

/** Heliocentric ecliptic position (AU) at `days` after J2000. */
export function heliocentric(
  elements: OrbitalElements,
  days: number,
): HeliocentricPosition {
  const M = meanAnomaly(elements, days);
  const E = solveKepler(M, elements.e);

  // Position in the orbital plane.
  const xv = elements.a * (Math.cos(E) - elements.e);
  const yv = elements.a * Math.sqrt(1 - elements.e * elements.e) * Math.sin(E);
  const r = Math.hypot(xv, yv);
  const v = Math.atan2(yv, xv);

  // Rotate by argument of perihelion, inclination, then node.
  const w = elements.w * DEG;
  const inc = elements.i * DEG;
  const om = elements.om * DEG;
  const u = v + w;

  const x =
    r * (Math.cos(om) * Math.cos(u) - Math.sin(om) * Math.sin(u) * Math.cos(inc));
  const y =
    r * (Math.sin(om) * Math.cos(u) + Math.cos(om) * Math.sin(u) * Math.cos(inc));
  const z = r * (Math.sin(u) * Math.sin(inc));

  return { x, y, z, r };
}

/** Days since J2000 for a JavaScript date. */
export function daysSinceJ2000(date: Date): number {
  const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
  return (date.getTime() - j2000) / 86400000;
}
