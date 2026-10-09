/**
 * Downloads the planetary texture maps used by the simulation.
 *
 * Sources: Solar System Scope texture pack (CC BY 4.0), https://www.solarsystemscope.com/textures/.
 * They are not committed to the repo; run `bun run fetch-textures` after
 * `bun install`. Pass `--force` to re-download.
 */

import { mkdir } from "node:fs/promises";

const BASE = "https://www.solarsystemscope.com/textures/download";

const TEXTURES: Array<{ file: string; body: string }> = [
  { file: "2k_sun.jpg", body: "Sun" },
  { file: "2k_mercury.jpg", body: "Mercury" },
  { file: "2k_venus_surface.jpg", body: "Venus" },
  { file: "2k_venus_atmosphere.jpg", body: "Venus (atmosphere)" },
  { file: "2k_earth_daymap.jpg", body: "Earth" },
  { file: "2k_earth_nightmap.jpg", body: "Earth (city lights)" },
  { file: "2k_earth_clouds.jpg", body: "Earth (clouds)" },
  { file: "2k_moon.jpg", body: "Moon" },
  { file: "2k_mars.jpg", body: "Mars" },
  { file: "2k_jupiter.jpg", body: "Jupiter" },
  { file: "2k_saturn.jpg", body: "Saturn" },
  { file: "2k_saturn_ring_alpha.png", body: "Saturn (rings)" },
  { file: "2k_uranus.jpg", body: "Uranus" },
  { file: "2k_neptune.jpg", body: "Neptune" },
  { file: "2k_stars_milky_way.jpg", body: "Background (Milky Way)" },
];

const OUT_DIR = new URL("../public/textures/", import.meta.url).pathname;
const force = process.argv.includes("--force");

await mkdir(OUT_DIR, { recursive: true });

let downloaded = 0;
let skipped = 0;

for (const { file, body } of TEXTURES) {
  const url = `${BASE}/${file}`;
  const dest = `${OUT_DIR}${file}`;

  const exists = await Bun.file(dest).exists();
  if (exists && !force) {
    skipped++;
    continue;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${body} (${file}): HTTP ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  await Bun.write(dest, bytes);
  downloaded++;
  console.log(`fetched ${file} (${(bytes.byteLength / 1024).toFixed(0)} KB)`);
}

console.log(`\nTextures ready in public/textures (${downloaded} downloaded, ${skipped} skipped).`);
console.log("Credit: Solar System Scope, CC BY 4.0, https://www.solarsystemscope.com/textures/");
