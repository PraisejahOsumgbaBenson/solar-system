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
import { daysSinceJ2000, heliocentric } from "./physics/orbital";
import "./style.css";

const DIST_SCALE = 5;
const SIZE_SCALE = 0.8;
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
renderer.toneMappingExposure = 1.05;
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
camera.position.set(0, 22, 14);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 0.5;
controls.maxDistance = 400;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.7,
  0.7,
  0.6,
);
composer.addPass(bloom);

// ---- Lighting and the Sun ---------------------------------------------------

const sunLight = new THREE.PointLight(0xfff4e0, 9000, 0, 2);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x2a3a55, 0.7));

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
halo.scale.setScalar(SUN_SCENE_RADIUS * 2.3);
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
  return SIZE_SCALE * Math.sqrt(radiusKm / EARTH_RADIUS_KM);
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
  for (let i = 0; i < SAMPLES; i++) {
    const day = (planet.elements.period * i) / SAMPLES;
    const p = heliocentric(planet.elements, day);
    points.push(toScene(p.x, p.y, p.z));
  }
  record.orbitLine.geometry.setFromPoints(points);
  scene.add(record.orbitLine);
  scene.add(record.group);
  records.set(planet.id, record);
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
let followTarget: THREE.Vector3 | null = null;
let followOffset = new THREE.Vector3();

const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

const infoPanel = document.getElementById("info")!;
const infoBody = document.getElementById("info-body")!;
document.getElementById("info-close")?.addEventListener("click", () => {
  setInterior(false);
  focusedId = null;
  followTarget = null;
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
  const yearDays = PLANETS.find((p) => p.name === facts.name)?.elements.period;
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
    <h3>Inside</h3>
    <ul class="layers">${layers}</ul>
  `;

  document.getElementById("interior-toggle")?.addEventListener("click", () => {
    setInterior(!interiorOn);
    showFacts(facts);
  });
}

function focusOn(id: string | null): void {
  if (id === null) {
    focusedId = null;
    followTarget = null;
    setInterior(false);
    infoPanel.classList.add("hidden");
    return;
  }

  focusedId = id;
  setInterior(false);

  if (id === "sun") {
    followTarget = new THREE.Vector3(0, 0, 0);
    const dir = camera.position.clone().sub(followTarget).normalize();
    followOffset = dir.multiplyScalar(SUN_SCENE_RADIUS * 7);
    showFacts(SUN_FACTS);
  } else {
    const record = records.get(id);
    if (!record) {
      return;
    }
    followTarget = record.group.position.clone();
    const dir = camera.position.clone().sub(followTarget).normalize();
    followOffset = dir.multiplyScalar(record.sceneRadius * 7 + 0.6);
    showFacts(record.planet);
  }
  infoPanel.classList.remove("hidden");
}

// ---- Planet selector bar ----------------------------------------------------

const bar = document.getElementById("planets")!;
function addButton(id: string, name: string): void {
  const btn = document.createElement("button");
  btn.textContent = name;
  btn.addEventListener("click", () => focusOn(id));
  bar.appendChild(btn);
}
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
  daysPerSecond: 4,
  paused: false,
};

let dayOffset = 0;

const gui = new GUI({ title: "Time" });
gui.add(params, "daysPerSecond", 0, 60, 0.5).name("days per second");
gui.add(params, "paused").name("pause");
gui.add(
  {
    today: () => {
      dayOffset = daysSinceJ2000(new Date());
    },
  },
  "today",
).name("jump to today");

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
    const p = heliocentric(record.planet.elements, dayOffset);
    record.group.position.copy(toScene(p.x, p.y, p.z));
    spinPlanet(record, dayOffset);
  }

  // Camera follows the focused body.
  if (followTarget) {
    if (focusedId && focusedId !== "sun") {
      const r = records.get(focusedId);
      if (r) {
        followTarget.copy(r.group.position);
      }
    }
    controls.target.lerp(followTarget, 0.12);
    const desired = tmp.copy(followTarget).add(followOffset);
    camera.position.lerp(desired, 0.08);

    if (interiorOn && focusedId && focusedId !== "sun") {
      const r = records.get(focusedId);
      if (r) {
        const normal = tmp.copy(r.group.position).sub(camera.position).normalize();
        clipPlane.normal.copy(normal);
        clipPlane.constant = -normal.dot(r.group.position);
      }
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
