import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import GUI from "lil-gui";
import { PLANETS } from "./physics/planets";
import type { InteriorLayer } from "./physics/planets";
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
  positionAt,
  velocityAt,
} from "./physics/orbital";
import "./style.css";

const DIST_SCALE = 6.5;
const SIZE_SCALE = 0.95;
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
scene.add(new THREE.AmbientLight(0x3a4a66, 0.9));
scene.add(new THREE.HemisphereLight(0x8899cc, 0x0a0a12, 0.6));

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

scene.add(createStarfield());

// ---- Helpers ----------------------------------------------------------------

/** Map a heliocentric ecliptic position (AU) to scene coordinates. */
function toScene(x: number, y: number, z: number): THREE.Vector3 {
  const r = Math.hypot(x, y, z) || 1e-9;
  const rc = DIST_SCALE * Math.sqrt(r);
  const k = rc / r;
  // Ecliptic z becomes scene up (y); ecliptic y becomes scene z.
  return new THREE.Vector3(x * k, z * k, y * k);
}

function sceneRadiusFor(radiusKm: number): number {
  // Compress large bodies more than small ones (exponent below 1/2) so gas
  // giants do not swallow the space between orbits.
  return SIZE_SCALE * Math.pow(radiusKm / EARTH_RADIUS_KM, 0.38);
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
  periodDays: number;
  phase: number;
  orbitScene: number;
  mesh: THREE.Mesh;
}
const moonRecords: MoonRecord[] = [];
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
    moonRecords.push({
      planetId: id,
      periodDays: moon.periodDays,
      phase: index * 1.9,
      orbitScene: record.sceneRadius * moon.orbitFactor,
      mesh,
    });
  });
}

// The main asteroid belt, between Mars and Jupiter.
const beltCount = 2200;
const beltPositions = new Float32Array(beltCount * 3);
for (let i = 0; i < beltCount; i++) {
  const rAu = 2.1 + Math.random() * 1.1;
  const rc = DIST_SCALE * Math.sqrt(rAu);
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
  camera.position.set(0, 52, 66);
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
  daysPerSecond: 2,
  paused: false,
  showAxis: true,
};

let dayOffset = daysSinceJ2000(new Date());

const gui = new GUI({ title: "Time" });
gui.add(params, "daysPerSecond", 0, 60, 0.5).name("days per second");
gui.add(params, "paused").name("pause");
gui.add(params, "showAxis").name("rotation axis");
gui.add(
  {
    today: () => {
      dayOffset = daysSinceJ2000(new Date());
    },
  },
  "today",
).name("jump to today");
gui.add({ whole: viewWholeSystem }, "whole").name("whole system view");

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

  // Moons orbit their planet.
  for (const moon of moonRecords) {
    const record = records.get(moon.planetId);
    if (!record) {
      continue;
    }
    const angle = (dayOffset / moon.periodDays) * Math.PI * 2 + moon.phase;
    moon.mesh.position.set(
      record.group.position.x + Math.cos(angle) * moon.orbitScene,
      record.group.position.y,
      record.group.position.z + Math.sin(angle) * moon.orbitScene,
    );
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
