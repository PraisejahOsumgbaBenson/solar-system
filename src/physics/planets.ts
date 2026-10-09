import type { OrbitalElements } from "./orbital";

/**
 * A layer of a planet's interior, as a shell between two radii expressed as a
 * fraction of the planet's surface radius (0 = centre, 1 = surface).
 */
export interface InteriorLayer {
  name: string;
  /** Inner boundary as a fraction of the planet radius. */
  inner: number;
  /** Outer boundary as a fraction of the planet radius. */
  outer: number;
  color: number;
  description: string;
}

export interface Planet {
  id: string;
  name: string;
  /** Texture file inside public/textures. */
  texture: string;
  /** Line and label colour, hex. */
  accent: number;
  elements: OrbitalElements;
  /** Mean radius, km. */
  radiusKm: number;
  /** Mass, kg. */
  massKg: number;
  /** Sidereal rotation period, hours. Negative means retrograde. */
  rotationHours: number;
  /** Axial tilt, degrees. */
  tiltDeg: number;
  /** Surface gravity, m s^-2. */
  gravity: number;
  /** Mean surface temperature, degrees C. */
  meanTempC: number;
  moons: number;
  atmosphere: string;
  interior: InteriorLayer[];
}

export const PLANETS: Planet[] = [
  {
    id: "mercury",
    name: "Mercury",
    texture: "2k_mercury.jpg",
    accent: 0x9c8f84,
    elements: { a: 0.3871, e: 0.2056, i: 7.005, om: 48.331, w: 29.124, M0: 174.796, period: 87.969 },
    radiusKm: 2439.7,
    massKg: 3.301e23,
    rotationHours: 1407.6,
    tiltDeg: 0.034,
    gravity: 3.7,
    meanTempC: 167,
    moons: 0,
    atmosphere: "Almost none (trace sodium)",
    interior: [
      { name: "Crust", inner: 0.96, outer: 1, color: 0x8a8078, description: "Thin, cratered silicate shell." },
      { name: "Mantle", inner: 0.42, outer: 0.96, color: 0xb0603a, description: "Silicate mantle, about 600 km thick." },
      { name: "Core", inner: 0, outer: 0.42, color: 0xffd27a, description: "Large iron core, roughly 85% of the radius." },
    ],
  },
  {
    id: "venus",
    name: "Venus",
    texture: "2k_venus_atmosphere.jpg",
    accent: 0xe6c88a,
    elements: { a: 0.7233, e: 0.0068, i: 3.395, om: 76.68, w: 54.884, M0: 50.115, period: 224.701 },
    radiusKm: 6051.8,
    massKg: 4.867e24,
    rotationHours: -5832.5,
    tiltDeg: 177.4,
    gravity: 8.87,
    meanTempC: 464,
    moons: 0,
    atmosphere: "Carbon dioxide, dense, sulfuric acid clouds",
    interior: [
      { name: "Crust", inner: 0.95, outer: 1, color: 0xc9a86a, description: "Basaltic crust, young surface." },
      { name: "Mantle", inner: 0.5, outer: 0.95, color: 0xd07a3a, description: "Silicate mantle." },
      { name: "Core", inner: 0, outer: 0.5, color: 0xffd27a, description: "Iron-nickel core, partly liquid." },
    ],
  },
  {
    id: "earth",
    name: "Earth",
    texture: "2k_earth_daymap.jpg",
    accent: 0x5aa9e6,
    elements: { a: 1.0, e: 0.0167, i: 0.0, om: 0.0, w: 102.947, M0: 357.529, period: 365.256 },
    radiusKm: 6371,
    massKg: 5.972e24,
    rotationHours: 23.934,
    tiltDeg: 23.44,
    gravity: 9.81,
    meanTempC: 15,
    moons: 1,
    atmosphere: "Nitrogen and oxygen",
    interior: [
      { name: "Crust", inner: 0.985, outer: 1, color: 0x6b8f4e, description: "Thin rocky crust, 5 to 70 km." },
      { name: "Mantle", inner: 0.546, outer: 0.985, color: 0xc65a2a, description: "Hot silicate mantle that drives plate tectonics." },
      { name: "Outer core", inner: 0.35, outer: 0.546, color: 0xff9a3c, description: "Liquid iron and nickel. Its motion makes the magnetic field." },
      { name: "Inner core", inner: 0, outer: 0.35, color: 0xffe9a8, description: "Solid iron-nickel sphere, about 5,200°C." },
    ],
  },
  {
    id: "mars",
    name: "Mars",
    texture: "2k_mars.jpg",
    accent: 0xd1603d,
    elements: { a: 1.5237, e: 0.0934, i: 1.85, om: 49.558, w: 286.502, M0: 19.373, period: 686.98 },
    radiusKm: 3389.5,
    massKg: 6.417e23,
    rotationHours: 24.623,
    tiltDeg: 25.19,
    gravity: 3.71,
    meanTempC: -65,
    moons: 2,
    atmosphere: "Carbon dioxide, thin",
    interior: [
      { name: "Crust", inner: 0.96, outer: 1, color: 0xb0552f, description: "Thick crust, iron-oxide rich." },
      { name: "Mantle", inner: 0.5, outer: 0.96, color: 0xc76a34, description: "Silicate mantle." },
      { name: "Core", inner: 0, outer: 0.5, color: 0xffd27a, description: "Iron, sulfur and nickel core, partly molten." },
    ],
  },
  {
    id: "jupiter",
    name: "Jupiter",
    texture: "2k_jupiter.jpg",
    accent: 0xd8b48a,
    elements: { a: 5.2029, e: 0.0484, i: 1.304, om: 100.464, w: 273.867, M0: 20.02, period: 4332.59 },
    radiusKm: 69911,
    massKg: 1.898e27,
    rotationHours: 9.925,
    tiltDeg: 3.13,
    gravity: 24.79,
    meanTempC: -110,
    moons: 95,
    atmosphere: "Hydrogen and helium",
    interior: [
      { name: "Atmosphere", inner: 0.9, outer: 1, color: 0xe8d9b0, description: "Molecular hydrogen and helium bands." },
      { name: "Molecular hydrogen", inner: 0.78, outer: 0.9, color: 0xd9a86a, description: "Hydrogen compressed into a fluid." },
      { name: "Metallic hydrogen", inner: 0.2, outer: 0.78, color: 0x5a7fd0, description: "Hydrogen squeezed until it conducts electricity, the source of the magnetic field." },
      { name: "Core", inner: 0, outer: 0.2, color: 0xffd27a, description: "Rock and ice core, several Earth masses." },
    ],
  },
  {
    id: "saturn",
    name: "Saturn",
    texture: "2k_saturn.jpg",
    accent: 0xe6d5a0,
    elements: { a: 9.5367, e: 0.0539, i: 2.486, om: 113.665, w: 339.392, M0: 317.02, period: 10759.22 },
    radiusKm: 58232,
    massKg: 5.683e26,
    rotationHours: 10.656,
    tiltDeg: 26.73,
    gravity: 10.44,
    meanTempC: -140,
    moons: 146,
    atmosphere: "Hydrogen and helium",
    interior: [
      { name: "Atmosphere", inner: 0.88, outer: 1, color: 0xe8dcae, description: "Hydrogen and helium, with ammonia haze." },
      { name: "Metallic hydrogen", inner: 0.2, outer: 0.88, color: 0x6a86cf, description: "Deep metallic hydrogen layer." },
      { name: "Core", inner: 0, outer: 0.2, color: 0xffd27a, description: "Rock and ice core." },
    ],
  },
  {
    id: "uranus",
    name: "Uranus",
    texture: "2k_uranus.jpg",
    accent: 0x8fd8e6,
    elements: { a: 19.1892, e: 0.0473, i: 0.773, om: 74.006, w: 96.999, M0: 142.238, period: 30688.5 },
    radiusKm: 25362,
    massKg: 8.681e25,
    rotationHours: -17.24,
    tiltDeg: 97.77,
    gravity: 8.87,
    meanTempC: -195,
    moons: 28,
    atmosphere: "Hydrogen, helium, methane",
    interior: [
      { name: "Atmosphere", inner: 0.8, outer: 1, color: 0xbfe6ea, description: "Hydrogen, helium and methane. Methane gives the blue-green colour." },
      { name: "Ice mantle", inner: 0.3, outer: 0.8, color: 0x69b8d0, description: "Hot, dense water, ammonia and methane ices." },
      { name: "Core", inner: 0, outer: 0.3, color: 0xffd27a, description: "Rocky core." },
    ],
  },
  {
    id: "neptune",
    name: "Neptune",
    texture: "2k_neptune.jpg",
    accent: 0x4c6fe0,
    elements: { a: 30.0699, e: 0.0086, i: 1.77, om: 131.784, w: 276.336, M0: 256.228, period: 60182 },
    radiusKm: 24622,
    massKg: 1.024e26,
    rotationHours: 16.11,
    tiltDeg: 28.32,
    gravity: 11.15,
    meanTempC: -200,
    moons: 16,
    atmosphere: "Hydrogen, helium, methane",
    interior: [
      { name: "Atmosphere", inner: 0.82, outer: 1, color: 0x8ea8f0, description: "Hydrogen, helium and methane, with the fastest winds in the solar system." },
      { name: "Ice mantle", inner: 0.3, outer: 0.82, color: 0x4c6fe0, description: "Water, ammonia and methane ices." },
      { name: "Core", inner: 0, outer: 0.3, color: 0xffd27a, description: "Rocky core, about the mass of Earth." },
    ],
  },
];

export function planetById(id: string): Planet | undefined {
  return PLANETS.find((p) => p.id === id);
}
