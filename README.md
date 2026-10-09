# Solar system

An interactive, realistic simulation of the solar system. The eight planets
orbit the Sun on their real orbital paths, spin at their real rates, and are
tilted at their real axial tilts. Click any planet to fly to it, read a fact
sheet, and look inside with a 3D cutaway.

## Run it

```sh
bun install
bun run fetch-textures
bun run dev
```

`fetch-textures` downloads the planetary maps once into `public/textures`
(they are not committed). `bun run dev` opens the app at
http://localhost:5174. `bun test` runs the orbital mechanics tests.

## What it does

- **Real orbits**: each planet uses its J2000 Keplerian elements (semi-major
  axis, eccentricity, inclination) and real orbital period, so positions track
  the real solar system for a given date.
- **Real spin and tilt**: true rotation periods (Venus and Uranus retrograde)
  and true axial tilts, which is what drives the seasons.
- **Real textures**: photographic planetary maps, credited below.
- **Click to explore**: click a planet in the view, or use the selector bar.
  The camera flies to it and follows it, and the panel shows mass, radius, day,
  year, gravity, temperature, atmosphere, and moons.
- **Look inside**: the "Look inside" button slices the planet open with a
  clipping plane and reveals its interior layers, labelled and to scale, each
  with real depth and composition. Try Earth and Jupiter.
- **Time controls**: speed up, pause, or jump to today. The HUD shows the
  simulated date.

## Scale

The default is a **compressed** scale: distances use a square-root compression
and planet sizes are exaggerated so the whole system is explorable. Real space
is mostly emptiness; at true scale the planets would be invisible specks. A
true-scale toggle is planned.

## Physics

`src/physics/orbital.ts` solves Kepler's equation and converts orbital elements
to heliocentric positions. `src/physics/planets.ts` holds the elements and
physical data. Both are pure and unit tested in `test/orbital.test.ts`,
including Kepler's third law and the continuity of every interior model.

## Credit

Planetary textures: Solar System Scope, CC BY 4.0,
https://www.solarsystemscope.com/textures/. Orbital elements and physical data
after NASA/JPL planetary fact sheets.
