import { describe, expect, test } from "bun:test";
import {
  daysSinceJ2000,
  longitudeDeg,
  orbitalPeriodDays,
  positionAt,
  solveKepler,
  velocityAt,
} from "../src/physics/orbital";
import { PLANETS, planetById } from "../src/physics/planets";

const EARTH = planetById("earth")!.elements;
const MERCURY = planetById("mercury")!.elements;
const NEPTUNE = planetById("neptune")!.elements;

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

describe("Kepler's third law", () => {
  test("Earth's period is one year", () => {
    expect(orbitalPeriodDays(1)).toBeCloseTo(365.256, 2);
  });

  test("the elements are consistent with the mean-longitude rate", () => {
    // Period from the drift of L should match a^1.5.
    for (const p of PLANETS) {
      const yearsFromA = Math.pow(p.elements.a, 1.5);
      const yearsFromRate = 36000 / p.elements.LRate;
      expect(Math.abs(yearsFromA - yearsFromRate) / yearsFromA).toBeLessThan(0.02);
    }
  });

  test("orbital radii increase outward", () => {
    for (let i = 1; i < PLANETS.length; i++) {
      expect(PLANETS[i].elements.a).toBeGreaterThan(PLANETS[i - 1].elements.a);
    }
  });
});

describe("Earth's orbit", () => {
  test("is near perihelion at J2000 and aphelion half a year later", () => {
    expect(positionAt(EARTH, 0).r).toBeGreaterThan(0.98);
    expect(positionAt(EARTH, 0).r).toBeLessThan(0.99);
    expect(positionAt(EARTH, 182.6).r).toBeGreaterThan(1.01);
    expect(positionAt(EARTH, 182.6).r).toBeLessThan(1.02);
  });

  test("has heliocentric longitude near 100 degrees at J2000", () => {
    const lon = longitudeDeg(EARTH, 0);
    expect(lon).toBeGreaterThan(98);
    expect(lon).toBeLessThan(103);
  });

  test("returns to almost the same place after one year", () => {
    const a = positionAt(EARTH, 0);
    const b = positionAt(EARTH, 365.256);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(0.02);
  });
});

describe("orbital speeds", () => {
  test("Earth moves about 29.8 km/s", () => {
    const v = velocityAt(EARTH, 0).speedKmS;
    expect(v).toBeGreaterThan(29.3);
    expect(v).toBeLessThan(30.3);
  });

  test("Mercury is faster, between about 39 and 59 km/s", () => {
    const v = velocityAt(MERCURY, 0).speedKmS;
    expect(v).toBeGreaterThan(38);
    expect(v).toBeLessThan(59);
  });

  test("Neptune is slow, about 5.4 km/s", () => {
    const v = velocityAt(NEPTUNE, 0).speedKmS;
    expect(v).toBeGreaterThan(5.0);
    expect(v).toBeLessThan(5.6);
  });

  test("inner planets are faster than outer ones", () => {
    const earth = velocityAt(EARTH, 1000).speedKmS;
    const neptune = velocityAt(NEPTUNE, 1000).speedKmS;
    expect(earth).toBeGreaterThan(neptune * 3);
  });
});

describe("the model advances with the date", () => {
  test("Earth's longitude grows over a year", () => {
    const start = longitudeDeg(EARTH, daysSinceJ2000(new Date(Date.UTC(2026, 0, 1))));
    const later = longitudeDeg(EARTH, daysSinceJ2000(new Date(Date.UTC(2026, 6, 1))));
    expect(later).not.toBeCloseTo(start, 1);
  });
});

describe("planet data", () => {
  test("has the eight planets in order", () => {
    expect(PLANETS.map((p) => p.id)).toEqual([
      "mercury", "venus", "earth", "mars",
      "jupiter", "saturn", "uranus", "neptune",
    ]);
  });

  test("every interior model spans the radius without gaps", () => {
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
    expect(daysSinceJ2000(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)))).toBe(0);
  });
});
