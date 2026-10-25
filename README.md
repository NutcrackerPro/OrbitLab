# OrbitLab 2

A 3D gravity laboratory with physical body sizes, interactive collisions, stable three-star systems, moons, stellar remnants and a representative Milky Way. Add or move a world, change its mass, set its orbital speed, and watch every simulated body respond.

[Open OrbitLab](https://nutcrackerpro.github.io/OrbitLab/)

## Run locally

No build step, account or runtime graphics CDN is required. From this directory, start a web server:

```sh
python3 -m http.server 8080
```

Open [localhost:8080](http://localhost:8080) in a current browser with WebGL 2 and hardware acceleration. Serve the files over HTTP; opening `index.html` directly does not provide the environment required by JavaScript modules.

All graphics libraries and texture data are bundled locally. This portable edition stores ten JPEG textures as lossless base64 JavaScript chunk modules; the simulation starts with procedural surfaces and upgrades materials as detailed textures arrive. Slow image downloads do not block the gravity engine. All source files are UTF-8 text. The interface uses local system fonts; no remote asset service is required.

## Nine models

| Model | What it demonstrates |
| --- | --- |
| **Solar System** | Seventeen individually integrated bodies: the Sun, eight planets, Moon, Pluto, Ceres, Vesta, Pallas, Hygiea, Halley and 67P. Planetary elements approximate J2000. Small-body phases are illustrative rather than current ephemerides. |
| **Three-Body · 三体** | A designed stable hierarchical triple inspired by the novel: a 1.0/0.8-solar-mass inner pair separated by 2 AU, a 0.5-solar-mass third star near 40 AU, and an Earth-mass circumbinary world near 7 AU. This fictional system is neither Alpha Centauri nor a reconstruction of the novel. |
| **Figure Eight** | Three equal-mass stars follow the classical figure-eight choreography. A displacement breaks its symmetry. |
| **Black Hole** | A 12-solar-mass black hole, three orbiting worlds and a companion star. The event horizon uses its physical radius; the bright disk is illustrative. |
| **Binary Stars** | Two stars orbit their center of mass, with a circumbinary planet and a planet near the primary. |
| **Chaotic Three-Body** | A deliberately unstable fictional triple. Close encounters, ejections and physical collisions are allowed. Three stars are not guaranteed to stay bound. |
| **Earth & Moon** | A clean, circular two-body experiment at a physical 384,400-km separation. Both bodies orbit their shared center of mass; the Sun is deliberately omitted. |
| **Collision Lab** | Two Earth-mass worlds start at rest, six Earth radii apart. Physical contact creates a named remnant in about 20 real seconds at the preset speed, conserving mass and linear momentum. |
| **Milky Way** | A roughly 100,000-light-year visible disk with 16,000 representative points, a central Sagittarius A* and a Solar neighborhood marker about 26,000 light-years from the center. |

Share a model through its URL fragment: `#solar`, `#three-body`, `#figure-eight`, `#black-hole`, `#binary`, `#chaotic-three`, `#earth-moon`, `#collision-lab` or `#milky-way`.

The stable triple is tested for 100 outer periods: approximately 16,681 simulated years and 1,012,809 integration steps at 128 steps per inner binary period. All three stars and the planet remain bound in that unmodified starting state. This numerical check does not promise stability after arbitrary edits or for all future time.

## Explore and build

| Action | Control |
| --- | --- |
| Orbit the camera | Drag empty space |
| Zoom | Wheel, trackpad, touch pinch or **+ / −** |
| Inspect | Click a surface, marker, label or object selector |
| Move a body | Drag it on its local horizontal plane, or adjust **X / Y / Z** |
| Add an object | Select its intended parent, then click or drag an object from the tray |
| Give a useful orbital speed | Choose **Orbit around**, then **Set circular orbit** |
| Start a fall | Choose **Same velocity · let it fall** before adding an object |
| Change mass | Choose Earth, Jupiter or solar mass units, then edit the value |
| Change velocity | Use the speed-up, slow-down or directional nudge |
| Follow a body | Double-click, **Close up** or **F** |
| Remove | **Remove**, **Delete**, or drag into the removal zone |
| Pause / reset | **Space** / **R** |
| Fit the model | **Fit** or **Esc** while the interface is shown |
| Hide / restore controls | **H**, **Hide UI / Show UI**, or **Esc** when hidden |

The controls hide after five seconds of inactivity. Move to the upper-right corner to reveal **Show UI**. Camera and object controls continue to work with the panels hidden.

A displacement preserves velocity; changing mass also leaves the existing velocity intact. Gravity alone does not provide the sideways motion required for an orbit. The circular-orbit action supplies the two-body starting speed relative to the chosen parent; other bodies can still perturb it. Select Earth before adding a Moon to build an Earth-bound example. New objects can instead inherit the parent's velocity and fall. The interactive limit is 64 individually simulated bodies.

**Gravity field** displays the selected object's Newtonian attraction on a nearby sample plane. All bodies exert gravity whether this visualization is enabled or not. **Trails** show past motion, and **Velocity** shows motion vectors. Initial Solar System orbit guides remain reference curves after edits.

## Physical scale and rendering

**True physical scale · 1×** uses the same AU-to-screen conversion for surface radii and distances. Earth has a radius of about 6,371 km; it does not become a giant sphere merely to fill the scene. Small objects receive selectable screen-space markers and labels. Those markers, glow, comet tails, atmospheres and event flashes are visual aids rather than physical surfaces.

The optional **Same proportions · 20× size** setting enlarges every surface by the same factor, preserving size ratios. It never changes gravity, physical positions or collision radii. Zooming to the Earth–Moon or Collision Lab models makes physical-scale interactions easier to see.

Textures, approximate stellar luminosity and inverse-square scene lighting provide visual context. The app does not perform radiative transfer, spectrally accurate photometry, ray-traced gravitational lensing or general-relativistic light propagation.

## Gravity, collisions and stellar evolution

Local models calculate Newtonian attraction between every pair of simulated bodies. Distances are AU, time is Julian years, mass is solar masses and `G = 4π²`. A kick–drift–kick leapfrog integrator uses fixed steps with power-of-two subdivisions during close encounters. Pair softening is capped to a small fraction of physical surface radii so it does not erase the Moon's gravity at its orbital distance.

Physical surface contact merges bodies. The resulting object retains combined mass and linear momentum, receives a remnant name, and uses an approximate mass-radius relation. Flash, ring and event-card effects identify the contact. This is an inelastic point-body merger, not a simulation of fragmentation, molten material, fluid impacts or ejecta hydrodynamics. Energy need not be conserved across that deliberately dissipative event.

Gas-rich bodies cross approximate brown-dwarf and sustained-hydrogen-burning thresholds near 13 and 80 Jupiter masses. These thresholds and the mass-radius relations are simplified educational rules, not a complete interior or aging model. Merely increasing a rocky world's mass never directly makes a neutron star.

**Trigger stellar core collapse** explicitly demonstrates the collapse of a star of at least eight solar masses. The chosen outcome creates a neutron-star or black-hole remnant plus two idealized ejecta packets that retain ejected mass and momentum and continue to gravitate. It does not predict stellar lifetimes or supernova hydrodynamics. The 2.2-solar-mass neutron-star stability limit is a selected model assumption; increasing a neutron star above it produces a black hole. Stable white dwarfs are capped at 1.4 solar masses in this model.

Black-hole surfaces and capture boundaries use the physical Schwarzschild radius, approximately `1.9741 × 10⁻⁸ × mass` AU. Accretion disks and luminous rings are illustrations. Motion remains Newtonian, so relativistic precession, tidal disruption, horizon physics and accurate lensing are outside the model.

## Milky Way scale and limits

The galaxy model uses actual AU/light-year ratios: one light-year is approximately 63,241.077 AU. At this scale an individual planet or stellar surface is unresolved. **Explore our Solar System** switches to its independent local N-body model; it does not imply that all real stars and planets have been enumerated.

The 16,000 deterministic points are a representative distribution of disk, bulge and halo stars with approximate spiral structure. Their colors, marker sizes and glow aid visibility. They are not a measured catalog and are not 16,000 mutually gravitating N-body particles. Sagittarius A* is the sole individually simulated central body in this overview, configured at 4.3 million solar masses.

An illustrative smooth potential combines a Miyamoto–Nagai disk, Plummer bulge, Hernquist dark halo and central point mass. Parameters are chosen for a plausible broad structure and rotation rate; they are not an observationally fitted Milky Way mass model. Differential rotation is a visualization in that approximate potential. The galactic clock is accelerated in millions of years, separately from local planetary experiments.

## Performance

Rendering uses `requestAnimationFrame` and targets smooth 60 fps interaction. **Auto quality** adjusts resolution using the measured frame rate; **Performance** favors responsiveness and **High quality** favors detail. Actual frame rate depends on the GPU, browser, screen resolution, display refresh rate and scene.

Physics work per display frame is capped. During expensive encounters the app may drop excess requested simulated time to keep interaction responsive. Elapsed time counts only integrated time, and the status reports limiting; the speed setting is a target rather than a guaranteed pace. Local scenarios use days per real second, while the galaxy uses millions of years per real second.

## Publish on GitHub Pages

Place this directory's contents at the root of a GitHub repository and push them to `main`. In the repository, open **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, and save. GitHub displays the published site's address when deployment is ready. No custom workflow or build command is needed. See [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Tests

With Node.js installed, run:

```sh
node --test tests/*.test.mjs
```

The suite covers circular orbit closure, energy/momentum invariants, frame partition independence, bounded work, close encounters, swept contacts, physical radius consistency, body creation/removal, fusion classification, circularization, stellar collapse with retained ejecta, merger conservation, one lunar orbit, the 100-outer-period stable triple, deterministic representative galaxy points, potential symmetry and the Collision Lab's actual contact. The tests validate these chosen models and invariants; they do not turn the approximations into precision astronomical predictions.

## Sources and credits

- [JPL: Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html) provides approximate J2000 planetary orbital elements. Local models are not live ephemerides.
- [JPL: Planetary Physical Parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html) provides physical size and mass references. The catalog rounds these values; minor-body phases and some uncertain properties are illustrative.
- [NASA: The Milky Way Galaxy](https://imagine.gsfc.nasa.gov/science/featured_science/milkyway/index.html) provides the broad visible-disk and Solar-neighborhood distance context.
- [NASA: What Is the Center of Our Galaxy Like?](https://science.nasa.gov/mission/webb/science-overview/science-explainers/what-is-the-center-of-our-galaxy-like/) describes the dense center and roughly four-million-solar-mass Sagittarius A*.
- [NASA: Star Lifecycle](https://science.nasa.gov/mission/webb/star-lifecycle/) explains the relationship between massive-star collapse, neutron stars and black holes. OrbitLab's thresholds and remnant choices are explicit simplifications.
- Alain Chenciner and Richard Montgomery, [A remarkable periodic solution of the three-body problem in the case of equal masses](https://arxiv.org/abs/math/0011268), *Annals of Mathematics* 152 (2000), describes the figure-eight choreography.
- [Three.js](https://threejs.org/) supplies the rendering engine; its MIT license is in [vendor/THREE-LICENSE.txt](vendor/THREE-LICENSE.txt).
- Planet textures are by Solar System Scope / INOVE under CC BY 4.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Original application code is released under the [MIT License](LICENSE). Third-party assets retain their respective licenses. NASA, JPL and the texture creators do not endorse OrbitLab.
