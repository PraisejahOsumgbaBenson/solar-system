import * as THREE from "three";
import type { Planet } from "../physics/planets";

/** A shared loader so textures are cached across bodies. */
export const textureLoader = new THREE.TextureLoader();

export function loadTexture(file: string): THREE.Texture {
  const texture = textureLoader.load(`/textures/${file}`);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** A soft radial glow sprite texture for the Sun's halo. */
export function createGlowTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255, 236, 190, 0.95)");
  gradient.addColorStop(0.25, "rgba(255, 190, 90, 0.5)");
  gradient.addColorStop(1, "rgba(255, 150, 60, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A rich backdrop of stars, layered over the Milky Way panorama. */
export function createStarfield(count = 2600, radius = 1200): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions[i * 3] = radius * r * Math.cos(theta);
    positions[i * 3 + 1] = radius * u;
    positions[i * 3 + 2] = radius * r * Math.sin(theta);
    tint.setHSL(0.55 + Math.random() * 0.12, 0.4, 0.6 + Math.random() * 0.4);
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 3,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  return new THREE.Points(geometry, material);
}

export interface BodyRecord {
  planet: Planet;
  /** Positioned along its orbit each frame. */
  group: THREE.Group;
  /** The sphere that spins. */
  mesh: THREE.Mesh;
  /** Scene radius, scene units. */
  sceneRadius: number;
  /** Axial tilt group. */
  axis: THREE.Group;
  /** Concentric interior shells, revealed by the cutaway. */
  shells: THREE.Group;
  orbitLine: THREE.LineLoop;
}

const TAU = Math.PI * 2;

export function createSun(sceneRadius: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(sceneRadius, 64, 64);
  const material = new THREE.MeshBasicMaterial({
    map: loadTexture("2k_sun.jpg"),
    color: 0xfff2cc,
  });
  const sun = new THREE.Mesh(geometry, material);
  sun.name = "sun";
  return sun;
}

export function createPlanet(planet: Planet, sceneRadius: number): BodyRecord {
  const group = new THREE.Group();
  group.name = planet.id;

  const axis = new THREE.Group();
  axis.rotation.z = (planet.tiltDeg * Math.PI) / 180;
  group.add(axis);

  const surfaceMaterial = new THREE.MeshStandardMaterial({
    map: loadTexture(planet.texture),
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(sceneRadius, 64, 48),
    surfaceMaterial,
  );
  mesh.userData.planetId = planet.id;
  axis.add(mesh);

  if (planet.id === "earth") {
    // City lights on the night side: an emissive map gated by the angle to the
    // Sun, so the lights fade in at the terminator instead of glowing in
    // daylight.
    surfaceMaterial.emissive = new THREE.Color(0xffffff);
    surfaceMaterial.emissiveMap = loadTexture("2k_earth_nightmap.jpg");
    surfaceMaterial.emissiveIntensity = 1;
    surfaceMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDirView = { value: new THREE.Vector3(1, 0, 0) };
      shader.uniforms.uNightGain = { value: 1 };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform vec3 uSunDirView;\nuniform float uNightGain;",
        )
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n  float nightF = smoothstep(0.15, -0.05, dot(normalize(vNormal), uSunDirView));\n  totalEmissiveRadiance *= nightF * uNightGain;",
        );
      surfaceMaterial.userData.shader = shader;
    };

    // Cloud shell, lit like the surface, drifting slowly.
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(sceneRadius * 1.015, 48, 32),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        alphaMap: loadTexture("2k_earth_clouds.jpg"),
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        roughness: 1,
        metalness: 0,
      }),
    );
    clouds.name = "clouds";
    axis.add(clouds);

    // A soft blue atmosphere rim at the limb.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(sceneRadius * 1.08, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0x5aa9ff) },
          uStrength: { value: 0.9 },
        },
        vertexShader: `
          varying vec3 vNormalW;
          varying vec3 vViewDirW;
          void main() {
            vNormalW = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vViewDirW = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uStrength;
          varying vec3 vNormalW;
          varying vec3 vViewDirW;
          void main() {
            float f = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDirW))), 2.5);
            gl_FragColor = vec4(uColor * f * uStrength, f * 0.9);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    atmosphere.name = "atmosphere";
    axis.add(atmosphere);
  }

  // Saturn's rings, in the planet's equatorial plane.
  if (planet.id === "saturn") {
    const ringTexture = loadTexture("2k_saturn_ring_alpha.png");
    const ringGeometry = new THREE.RingGeometry(
      sceneRadius * 1.16,
      sceneRadius * 1.55,
      128,
    );
    const ring = new THREE.Mesh(
      ringGeometry,
      new THREE.MeshBasicMaterial({
        map: ringTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    axis.add(ring);
  }

  // Interior shells, hidden until the cutaway is enabled.
  const shells = new THREE.Group();
  for (const layer of [...planet.interior].sort((a, b) => a.outer - b.outer)) {
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(layer.outer * sceneRadius * 0.997, 40, 32),
      new THREE.MeshStandardMaterial({
        color: layer.color,
        emissive: layer.color,
        emissiveIntensity: 0.35,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    );
    shell.userData.layerName = layer.name;
    shells.add(shell);
  }
  shells.visible = false;
  group.add(shells);

  // Orbit line, filled in by the caller via setOrbitPoints.
  const orbitLine = new THREE.LineLoop(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({
      color: planet.accent,
      transparent: true,
      opacity: 0.35,
    }),
  );

  return {
    planet,
    group,
    mesh,
    sceneRadius,
    axis,
    shells,
    orbitLine,
  };
}

/** Advance a planet's spin given days since J2000. */
export function spinPlanet(record: BodyRecord, days: number): void {
  const hours = days * 24;
  record.mesh.rotation.y = (hours / record.planet.rotationHours) * TAU;
}
