import { describe, expect, test } from "bun:test";
import {
  daysSinceJ2000,
  heliocentric,
  meanAnomaly,
  solveKepler,
  type OrbitalElements,
} from "../src/physics/orbital";
import { PLANETS, planetById } from "../src/physics/planets";

const EARTH: OrbitalElements = {
  a: 1.0,
  e: 0.0167,
  i: 0.0,
  om: 0.0,
  w: 102.947,
  M0: 357.529,
  period: 365.256,
};

describe("kepler solver", () => {
  test("reduces to identity for a circular orbit", () => {
    const m = 1.234;
    expect(solveKepler(m, 0)).toBeCloseTo(m, 10);
  });

  test("satisfies Kepler's equation for a high eccentricity", () => {
    const e = 0.9;
    const m = 2.0;
    const E = solveKepler(m, e);
    expect(E - e * Math.sin(E)).toBeCloseTo(m, 8);
  });
});

describe("mean anomaly", () => {
  test("equals M0 at J2000", () => {
    expect(meanAnomaly(EARTH, 0)).toBeCloseTo(EARTH.M0 * (Math.PI / 180), 10);
  });
});

describe("Earth's orbit", () => {
  test("stays near one AU over a year", () => {
    for (const day of [0, 90, 180, 270, 365]) {
      const p = heliocentric(EARTH, day);
      expect(p.r).toBeGreaterThan(0.98);
      expect(p.r).toBeLessThan(1.02);
    }
  });

  test("returns to almost the same place after one period", () => {
    const a = heliocentric(EARTH, 0);
    const b = heliocentric(EARTH, EARTH.period);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01);
  });

  test("stays in the ecliptic plane when inclination is zero", () => {
    const p = heliocentric(EARTH, 123);
    expect(Math.abs(p.z)).toBeLessThan(1e-9);
  });
});

describe("planet data", () => {
  test("has the eight planets in order", () => {
    const ids = PLANETS.map((p) => p.id);
    expect(ids).toEqual([
      "mercury",
      "venus",
      "earth",
      "mars",
      "jupiter",
      "saturn",
      "uranus",
      "neptune",
    ]);
  });

  test("orbital radii increase outward", () => {
    for (let i = 1; i < PLANETS.length; i++) {
      expect(PLANETS[i].elements.a).toBeGreaterThan(PLANETS[i - 1].elements.a);
    }
  });

  test("periods match Kepler's third law within 5 percent", () => {
    // period_years^2 = a^3
    for (const p of PLANETS) {
      const years = p.elements.period / 365.256;
      const predicted = Math.pow(p.elements.a, 1.5);
      expect(Math.abs(years - predicted) / predicted).toBeLessThan(0.05);
    }
  });

  test("every planet's interior layers span the whole radius without gaps", () => {
    for (const p of PLANETS) {
      const layers = [...p.interior].sort((x, y) => x.inner - y.inner);
      expect(layers[0].inner).toBe(0);
      expect(layers[layers.length - 1].outer).toBe(1);
      for (let i = 1; i < layers.length; i++) {
        expect(layers[i].inner).toBeCloseTo(layers[i - 1].outer, 6);
      }
    }
  });

  test("lookup by id works", () => {
    expect(planetById("earth")?.name).toBe("Earth");
    expect(planetById("pluto")).toBeUndefined();
  });
});

describe("time", () => {
  test("J2000 epoch is day zero", () => {
    const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
    expect(daysSinceJ2000(j2000)).toBe(0);
  });
});
