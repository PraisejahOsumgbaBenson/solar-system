import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import GUI from "lil-gui";
import { PLANETS } from "./physics/planets";
import type { InteriorLayer, MoonBody } from "./physics/planets";
import {
  createGlowTexture,
  createPlanet,
  createStarfield,
  createSun,
  loadTexture,
  spinPlanet,
  type BodyRecord,
} from "./scene/bodies";
import {
  daysSinceJ2000,
  longitudeDeg,
  orbitalPeriodDays,
  orbitalPosition,
  positionAt,
  velocityAt,
} from "./physics/orbital";
import "./style.css";

const DIST_SCALE = 7.5;
const DIST_POWER = 0.55;
const SIZE_SCALE = 0.5;
const SUN_SCENE_RADIUS = 1.7;
const EARTH_RADIUS_KM = 6371;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("missing #app container");
}

// ---- Renderer, scene, camera ------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x02030a, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.localClippingEnabled = true;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const bg = loadTexture("2k_stars_milky_way.jpg");
bg.mapping = THREE.EquirectangularReflectionMapping;
scene.background = bg;

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.05,
  20000,
);
camera.position.set(0, 16, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.5;
controls.maxDistance = 400;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.45,
  0.6,
  0.9,
);
composer.addPass(bloom);

// ---- Lighting and the Sun ---------------------------------------------------

// A light without distance falloff keeps every planet lit the same way, so the
// inner planets are not blown out white while the outer ones go dark.
const sunLight = new THREE.PointLight(0xfff4e0, 6.5, 0, 0);
scene.add(sunLight);
// Fill light from every direction so the night side of a planet is still
// readable, not pitch black.
const ambientLight = new THREE.AmbientLight(0x3a4a66, 0.9);
const hemiLight = new THREE.HemisphereLight(0x8899cc, 0x0a0a12, 0.6);
scene.add(ambientLight, hemiLight);

const sun = createSun(SUN_SCENE_RADIUS);
scene.add(sun);

const halo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createGlowTexture(),
    color: 0xffcf8a,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
halo.scale.setScalar(SUN_SCENE_RADIUS * 3.2);
scene.add(halo);

const starfield = createStarfield();
scene.add(starfield);

// ---- Helpers ----------------------------------------------------------------

/** Map a heliocentric ecliptic position (AU) to scene coordinates. */
function toScene(x: number, y: number, z: number): THREE.Vector3 {
  const r = Math.hypot(x, y, z) || 1e-9;
  const rc = DIST_SCALE * Math.pow(r, DIST_POWER);
  const k = rc / r;
  // Ecliptic z becomes scene up (y); ecliptic y becomes scene z.
  return new THREE.Vector3(x * k, z * k, y * k);
}

function sceneRadiusFor(radiusKm: number): number {
  // Compress large bodies more than small ones (exponent below 1/2) so gas
  // giants do not swallow the space between orbits.
  return SIZE_SCALE * Math.pow(radiusKm / EARTH_RADIUS_KM, 0.38);
}

const DEG = Math.PI / 180;
const moonScratch = new THREE.Vector3();

/**
 * Offset of a moon from its planet, in scene units. Moons with real elements
 * follow the eccentric, inclined orbit (so they speed up near perigee); the
 * rest use a uniform circle at their real period.
 */
function moonOffsetScene(
  moon: MoonBody,
  orbitScene: number,
  days: number,
  phase: number,
): THREE.Vector3 {
  if (moon.elements) {
    const el = moon.elements;
    const M = (el.M0Deg + (360 * days) / moon.periodDays) * DEG;
    const p = orbitalPosition(
      el.aKm,
      el.e,
      el.iDeg * DEG,
      el.nodeDeg * DEG,
      (el.periDeg - el.nodeDeg) * DEG,
      M,
    );
    const scale = orbitScene / el.aKm;
    // Ecliptic (x, y, z) maps to scene (x, z, y).
    return moonScratch.set(p.x * scale, p.z * scale, p.y * scale);
  }
  const angle = (days / moon.periodDays) * Math.PI * 2 + phase;
  return moonScratch.set(
    Math.cos(angle) * orbitScene,
    0,
    Math.sin(angle) * orbitScene,
  );
}

// ---- Planets ----------------------------------------------------------------

interface BodyFacts {
  name: string;
  radiusKm: number;
  massKg: number;
  rotationHours: number;
  tiltDeg: number;
  gravity: number;
  meanTempC: number;
  moons: number;
  atmosphere: string;
  interior: InteriorLayer[];
}

const records = new Map<string, BodyRecord>();

for (const planet of PLANETS) {
  const sceneRadius = sceneRadiusFor(planet.radiusKm);
  const record = createPlanet(planet, sceneRadius);

  // Orbit line.
  const points: THREE.Vector3[] = [];
  const SAMPLES = 256;
  const periodDays = orbitalPeriodDays(planet.elements.a);
  for (let i = 0; i < SAMPLES; i++) {
    const day = (periodDays * i) / SAMPLES;
    const p = positionAt(planet.elements, day);
    points.push(toScene(p.x, p.y, p.z));
  }
  record.orbitLine.geometry.setFromPoints(points);
  scene.add(record.orbitLine);
  scene.add(record.group);
  records.set(planet.id, record);
}

// Moons: small bodies orbiting their planet. Added to the scene directly so
// they are positioned relative to the planet each frame.
interface MoonRecord {
  planetId: string;
  moon: MoonBody;
  phase: number;
  orbitScene: number;
  mesh: THREE.Mesh;
  label: HTMLDivElement;
}
const moonRecords: MoonRecord[] = [];
const moonLabelsContainer = document.getElementById("labels")!;
for (const [id, record] of records) {
  const list = record.planet.moonList;
  if (!list) {
    continue;
  }
  list.forEach((moon, index) => {
    const moonRadius = Math.max(0.14, sceneRadiusFor(moon.radiusKm));
    const material = moon.texture
      ? new THREE.MeshStandardMaterial({
          map: loadTexture(moon.texture),
          roughness: 1,
          metalness: 0,
        })
      : new THREE.MeshStandardMaterial({
          color: moon.color,
          roughness: 0.95,
          metalness: 0,
        });
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(moonRadius, 24, 18),
      material,
    );
    scene.add(mesh);

    const label = document.createElement("div");
    label.className = "label moon-label";
    label.textContent = moon.name;
    label.style.display = "none";
    moonLabelsContainer.appendChild(label);

    moonRecords.push({
      planetId: id,
      moon,
      phase: index * 1.9,
      orbitScene: record.sceneRadius * moon.orbitFactor,
      mesh,
      label,
    });
  });
}

// The main asteroid belt, between Mars and Jupiter.
const beltCount = 2200;
const beltPositions = new Float32Array(beltCount * 3);
for (let i = 0; i < beltCount; i++) {
  const rAu = 2.1 + Math.random() * 1.1;
  const rc = DIST_SCALE * Math.pow(rAu, DIST_POWER);
  const angle = Math.random() * Math.PI * 2;
  beltPositions[i * 3] = rc * Math.cos(angle);
  beltPositions[i * 3 + 1] = (Math.random() - 0.5) * 0.7;
  beltPositions[i * 3 + 2] = rc * Math.sin(angle);
}
const beltGeometry = new THREE.BufferGeometry();
beltGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(beltPositions, 3),
);
const asteroidBelt = new THREE.Points(
  beltGeometry,
  new THREE.PointsMaterial({
    color: 0x9a9082,
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  }),
);
scene.add(asteroidBelt);

// Thin line through the poles, so the axial tilt and spin axis are visible.
const axisLines = new Map<string, THREE.Line>();
for (const [id, record] of records) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -1.4 * record.sceneRadius, 0),
    new THREE.Vector3(0, 1.4 * record.sceneRadius, 0),
  ]);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.85 }),
  );
  line.visible = false;
  record.axis.add(line);
  axisLines.set(id, line);
}

// ---- Labels -----------------------------------------------------------------

const labelsContainer = document.getElementById("labels")!;
const labelEls = new Map<string, HTMLDivElement>();
for (const planet of PLANETS) {
  const el = document.createElement("div");
  el.className = "label";
  el.textContent = planet.name;
  labelsContainer.appendChild(el);
  labelEls.set(planet.id, el);
}

// ---- Selection and camera focus ---------------------------------------------

const SUN_FACTS: BodyFacts = {
  name: "Sun",
  radiusKm: 696340,
  massKg: 1.989e30,
  rotationHours: 609.12,
  tiltDeg: 7.25,
  gravity: 274,
  meanTempC: 5505,
  moons: 0,
  atmosphere: "Plasma of hydrogen and helium",
  interior: [
    { name: "Core", inner: 0, outer: 0.25, color: 0xffe9a8, description: "Fusion furnace at 15 million °C." },
    { name: "Radiative zone", inner: 0.25, outer: 0.7, color: 0xffc46a, description: "Energy crawls outward as photons for 100,000 years." },
    { name: "Convective zone", inner: 0.7, outer: 0.99, color: 0xff9a3c, description: "Boiling plasma carries heat to the surface." },
    { name: "Photosphere", inner: 0.99, outer: 1, color: 0xfff2cc, description: "The visible surface, about 5,500 °C." },
  ],
};

let focusedId: string | null = null;
let interiorOn = false;
let followId: string | null = null;
const lastFollowPos = new THREE.Vector3();
const followPos = new THREE.Vector3();
const deltaVec = new THREE.Vector3();

const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

const infoPanel = document.getElementById("info")!;
const infoBody = document.getElementById("info-body")!;
document.getElementById("info-close")?.addEventListener("click", () => {
  setInterior(false);
  focusedId = null;
  followId = null;
  infoPanel.classList.add("hidden");
});

function materialsOf(record: BodyRecord): THREE.Material[] {
  const mats: THREE.Material[] = [record.mesh.material as THREE.Material];
  for (const shell of record.shells.children) {
    mats.push((shell as THREE.Mesh).material as THREE.Material);
  }
  for (const child of record.axis.children) {
    if (child !== record.mesh && (child as THREE.Mesh).material) {
      mats.push((child as THREE.Mesh).material as THREE.Material);
    }
  }
  return mats;
}

function setInterior(on: boolean): void {
  interiorOn = on;
  for (const record of records.values()) {
    const active = on && record.planet.id === focusedId;
    record.shells.visible = active;
    for (const child of record.axis.children) {
      if (child.name === "clouds") {
        child.visible = !active;
      }
    }
    for (const mat of materialsOf(record)) {
      mat.clippingPlanes = active ? [clipPlane] : [];
      mat.needsUpdate = true;
    }
  }
}

const MASS_EARTH = 5.972e24;

function factRow(label: string, value: string): string {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function showFacts(facts: BodyFacts): void {
  const earthMasses = facts.massKg / MASS_EARTH;
  const planet = PLANETS.find((p) => p.name === facts.name);
  const yearDays = planet ? orbitalPeriodDays(planet.elements.a) : undefined;
  const layers = [...facts.interior]
    .sort((a, b) => b.outer - a.outer)
    .map(
      (l) =>
        `<li><span class="dot" style="background:#${l.color.toString(16).padStart(6, "0")}"></span><b>${l.name}</b><span>${l.description}</span></li>`,
    )
    .join("");

  infoBody.innerHTML = `
    <h2>${facts.name}</h2>
    <button id="interior-toggle" class="${interiorOn ? "on" : ""}">
      ${interiorOn ? "Hide interior" : "Look inside"}
    </button>
    <dl>
      ${factRow("Radius", `${facts.radiusKm.toLocaleString("en-US")} km`)}
      ${factRow("Mass", earthMasses >= 1 ? `${earthMasses.toFixed(earthMasses >= 10 ? 0 : 2)} Earths` : `${(earthMasses * 1000).toFixed(0)} thousandths of Earth`)}
      ${yearDays ? factRow("Year", `${yearDays.toLocaleString("en-US", { maximumFractionDigits: 1 })} days`) : ""}
      ${factRow("Day", `${Math.abs(facts.rotationHours).toFixed(1)} h${facts.rotationHours < 0 ? " (retrograde)" : ""}`)}
      ${factRow("Axial tilt", `${facts.tiltDeg.toFixed(1)}°`)}
      ${factRow("Gravity", `${facts.gravity.toFixed(2)} m/s²`)}
      ${factRow("Mean temp", `${facts.meanTempC.toLocaleString("en-US")} °C`)}
      ${factRow("Moons", `${facts.moons}`)}
      ${factRow("Atmosphere", facts.atmosphere)}
    </dl>
    ${
      planet
        ? `<h3>Right now</h3>
    <dl>
      ${factRow("Distance from Sun", `<span id="dyn-dist">--</span>`)}
      ${factRow("Orbital speed", `<span id="dyn-speed">--</span>`)}
      ${factRow("Ecliptic longitude", `<span id="dyn-lon">--</span>`)}
    </dl>`
        : ""
    }
    <h3>Inside</h3>
    <ul class="layers">${layers}</ul>
  `;

  document.getElementById("interior-toggle")?.addEventListener("click", () => {
    setInterior(!interiorOn);
    showFacts(facts);
  });
}

function focusOn(id: string | null): void {
  setInterior(false);

  if (id === null) {
    focusedId = null;
    followId = null;
    infoPanel.classList.add("hidden");
    return;
  }

  focusedId = id;
  followId = id;

  if (id === "sun") {
    followPos.set(0, 0, 0);
    frameBody(followPos, SUN_SCENE_RADIUS);
    showFacts(SUN_FACTS);
  } else {
    const record = records.get(id);
    if (!record) {
      return;
    }
    followPos.copy(record.group.position);
    frameBody(followPos, record.sceneRadius);
    showFacts(record.planet);
  }
  infoPanel.classList.remove("hidden");
}

// Snap the camera to a comfortable distance from a body, keeping the current
// viewing direction. The camera then follows the body by translation, so the
// user can still drag to orbit it at any time.
function frameBody(position: THREE.Vector3, radius: number): void {
  const dir = camera.position.clone().sub(position);
  if (dir.lengthSq() < 1e-6) {
    dir.set(0, 0.4, 1);
  }
  dir.normalize();
  const distance = radius * 6 + 0.6;
  camera.position.copy(position).addScaledVector(dir, distance);
  controls.target.copy(position);
  controls.update();
  lastFollowPos.copy(position);
}

// A wide view that frames the whole system, out past Neptune's orbit.
function viewWholeSystem(): void {
  focusedId = null;
  followId = null;
  setInterior(false);
  infoPanel.classList.add("hidden");
  controls.target.set(0, 0, 0);
  camera.position.set(0, 72, 92);
  controls.update();
}

// ---- Planet selector bar ----------------------------------------------------

const bar = document.getElementById("planets")!;
function addButton(id: string, name: string): void {
  const btn = document.createElement("button");
  btn.textContent = name;
  btn.addEventListener("click", () => focusOn(id));
  bar.appendChild(btn);
}
const wholeButton = document.createElement("button");
wholeButton.textContent = "Whole system";
wholeButton.addEventListener("click", viewWholeSystem);
bar.appendChild(wholeButton);

const moonsButton = document.createElement("button");
moonsButton.textContent = "Moons: on";
moonsButton.addEventListener("click", () => {
  params.showMoons = !params.showMoons;
  moonsButton.textContent = params.showMoons ? "Moons: on" : "Moons: off";
});
bar.appendChild(moonsButton);

const nightButton = document.createElement("button");
nightButton.textContent = "Night: off";
nightButton.addEventListener("click", () => {
  params.night = !params.night;
  nightButton.textContent = params.night ? "Night: on" : "Night: off";
  applyNight();
});
bar.appendChild(nightButton);
addButton("sun", "Sun");
for (const p of PLANETS) {
  addButton(p.id, p.name);
}

// Clicking in the 3D view focuses a planet (ignoring drags).
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downX = 0;
let downY = 0;
renderer.domElement.addEventListener("pointerdown", (e) => {
  downX = e.clientX;
  downY = e.clientY;
});
renderer.domElement.addEventListener("pointerup", (e) => {
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) {
    return;
  }
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const meshes: THREE.Object3D[] = [sun];
  for (const r of records.values()) {
    meshes.push(r.mesh);
  }
  const hits = raycaster.intersectObjects(meshes, false);
  if (hits.length === 0) {
    focusOn(null);
    return;
  }
  const hit = hits[0].object;
  focusOn((hit.userData.planetId as string) ?? (hit === sun ? "sun" : null));
});

// ---- Time -------------------------------------------------------------------

const params = {
  daysPerSecond: 0.5,
  paused: false,
  showAxis: true,
  showMoons: true,
  showBelt: true,
  showStars: true,
  showOrbits: true,
  night: false,
};

let dayOffset = daysSinceJ2000(new Date());

const gui = new GUI({ title: "Time" });
const speedController = gui
  .add(params, "daysPerSecond", 0, 30, 0.01)
  .name("days per second");
function setSpeed(value: number): void {
  params.daysPerSecond = value;
  speedController.updateDisplay();
}

const speedFolder = gui.addFolder("Speed presets");
speedFolder.add({ real: () => setSpeed(1 / 86400) }, "real").name("real time (1s = 1s)");
speedFolder.add({ hour: () => setSpeed(1 / 24) }, "hour").name("1 hour / second");
speedFolder.add({ day: () => setSpeed(1) }, "day").name("1 day / second");
speedFolder.add({ week: () => setSpeed(7) }, "week").name("1 week / second");
speedFolder.add({ month: () => setSpeed(30) }, "month").name("1 month / second");

gui.add(params, "paused").name("pause");
gui.add(params, "showAxis").name("rotation axis");
gui.add(params, "night").name("night mode").onChange(applyNight);

const showFolder = gui.addFolder("Show");
showFolder.add(params, "showMoons").name("moons");
showFolder.add(params, "showBelt").name("asteroid belt");
showFolder.add(params, "showStars").name("stars");
showFolder.add(params, "showOrbits").name("orbit lines");

gui.add(
  {
    today: () => {
      dayOffset = daysSinceJ2000(new Date());
    },
  },
  "today",
).name("jump to today");
gui.add({ whole: viewWholeSystem }, "whole").name("whole system view");

// On small screens collapse the control panel to its title bar so it does not
// fight the HUD for the top of the viewport; tap the bar to reopen it.
if (window.innerWidth <= 680) {
  gui.close();
}

const earthRecord = records.get("earth");
const earthSunWorld = new THREE.Vector3();
const earthSunView = new THREE.Vector3();

/** Dim the scene and brighten the stars for the night mood. */
function applyNight(): void {
  sunLight.intensity = params.night ? 3.6 : 6.5;
  ambientLight.intensity = params.night ? 0.3 : 0.9;
  hemiLight.intensity = params.night ? 0.22 : 0.6;
  const starMaterial = starfield.material as THREE.PointsMaterial;
  starMaterial.size = params.night ? 4.5 : 3;
  starMaterial.opacity = params.night ? 1 : 0.9;
}

/** Point Earth's city lights away from the Sun, so they light the night side. */
function updateEarthNight(): void {
  if (!earthRecord) {
    return;
  }
  const material = earthRecord.mesh.material as THREE.MeshStandardMaterial;
  const shader = material.userData.shader as
    | {
        uniforms: {
          uSunDirView: { value: THREE.Vector3 };
          uNightGain: { value: number };
        };
      }
    | undefined;
  if (!shader) {
    return;
  }
  earthSunWorld.copy(earthRecord.group.position).negate().normalize();
  earthSunView.copy(earthSunWorld).transformDirection(camera.matrixWorldInverse);
  shader.uniforms.uSunDirView.value.copy(earthSunView);
  shader.uniforms.uNightGain.value = params.night ? 1.7 : 1.0;
}

const hudDate = document.getElementById("hud-date");
const hudSpeed = document.getElementById("hud-speed");

function formatDate(days: number): string {
  const j2000 = Date.UTC(2000, 0, 1, 12, 0, 0);
  const date = new Date(j2000 + days * 86400000);
  return date.toISOString().slice(0, 10);
}

// ---- Frame ------------------------------------------------------------------

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();

function frame(): void {
  const dt = clock.getDelta();
  if (!params.paused) {
    dayOffset += dt * params.daysPerSecond;
  }

  sun.rotation.y += params.paused ? 0 : dt * 0.02;

  for (const record of records.values()) {
    const p = positionAt(record.planet.elements, dayOffset);
    record.group.position.copy(toScene(p.x, p.y, p.z));
    spinPlanet(record, dayOffset);
  }

  // Moons orbit their planet, on accurate paths where elements are known.
  for (const moon of moonRecords) {
    moon.mesh.visible = params.showMoons;
    const record = records.get(moon.planetId);
    if (!record || !params.showMoons) {
      continue;
    }
    const offset = moonOffsetScene(
      moon.moon,
      moon.orbitScene,
      dayOffset,
      moon.phase,
    );
    moon.mesh.position.copy(record.group.position).add(offset);
  }

  // Visibility toggles.
  starfield.visible = params.showStars;
  asteroidBelt.visible = params.showBelt;
  for (const record of records.values()) {
    record.orbitLine.visible = params.showOrbits;
  }

  // The asteroid belt drifts around the Sun.
  asteroidBelt.rotation.y = (dayOffset / (4.6 * 365.256)) * Math.PI * 2;

  // Live readouts for the focused planet: where it is and how fast.
  if (focusedId && focusedId !== "sun") {
    const record = records.get(focusedId);
    const distEl = document.getElementById("dyn-dist");
    if (record && distEl) {
      const p = positionAt(record.planet.elements, dayOffset);
      const v = velocityAt(record.planet.elements, dayOffset);
      const lon = longitudeDeg(record.planet.elements, dayOffset);
      distEl.textContent = `${p.r.toFixed(4)} AU (${(p.r * 149.6).toFixed(2)} million km)`;
      const speedEl = document.getElementById("dyn-speed");
      if (speedEl) {
        speedEl.textContent = `${v.speedKmS.toFixed(3)} km/s`;
      }
      const lonEl = document.getElementById("dyn-lon");
      if (lonEl) {
        lonEl.textContent = `${lon.toFixed(2)}°`;
      }
    }
  }

  // Camera follows the focused body by translation, so dragging still orbits.
  if (followId) {
    if (followId === "sun") {
      followPos.set(0, 0, 0);
    } else {
      const r = records.get(followId);
      if (r) {
        followPos.copy(r.group.position);
      }
    }
    deltaVec.copy(followPos).sub(lastFollowPos);
    camera.position.add(deltaVec);
    controls.target.add(deltaVec);
    lastFollowPos.copy(followPos);
  }

  // Show the rotation axis line for the focused body.
  for (const [id, line] of axisLines) {
    line.visible = params.showAxis && id === focusedId;
  }

  // The interior cutaway plane passes through the focused planet's centre.
  if (interiorOn && focusedId && focusedId !== "sun") {
    const r = records.get(focusedId);
    if (r) {
      const normal = tmp.copy(r.group.position).sub(camera.position).normalize();
      clipPlane.normal.copy(normal);
      clipPlane.constant = -normal.dot(r.group.position);
    }
  }

  controls.update();

  // Labels for every planet.
  for (const [id, el] of labelEls) {
    const record = records.get(id);
    if (!record) {
      continue;
    }
    const v = tmp.copy(record.group.position).project(camera);
    const visible = v.z < 1;
    el.style.display = visible ? "block" : "none";
    el.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
  }

  // Moon labels, shown only for the focused planet's system.
  for (const moon of moonRecords) {
    const show = params.showMoons && moon.planetId === focusedId;
    if (!show) {
      moon.label.style.display = "none";
      continue;
    }
    const v = tmp.copy(moon.mesh.position).project(camera);
    moon.label.style.display = v.z < 1 ? "block" : "none";
    moon.label.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
    moon.label.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
  }

  updateEarthNight();
  if (earthRecord && !params.paused) {
    const clouds = earthRecord.axis.getObjectByName("clouds");
    if (clouds) {
      clouds.rotation.y += dt * 0.01;
    }
  }

  composer.render();

  if (hudDate) {
    hudDate.textContent = formatDate(dayOffset);
  }
  if (hudSpeed) {
    hudSpeed.textContent = params.paused ? "paused" : `${params.daysPerSecond} days/s`;
  }
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(frame);
