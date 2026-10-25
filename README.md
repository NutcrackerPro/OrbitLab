# Orbit Lab

An interactive 3D gravity sandbox for exploring what happens when you add, move, or remove a planet, change a star’s mass, or drop a black hole into a system. Five scenarios include the Solar System, a fictional 三体-inspired triple-star world, and the figure-eight three-body choreography.

The app runs entirely in your browser with Three.js, local planet textures, and a numerical N-body simulation. No build step, account, or runtime CDN is required.

This portable edition stores its ten planet textures as base64 JavaScript modules in `assets/`; the browser reconstructs the original image bytes locally. The simulation starts with procedural surfaces, then upgrades each planet as its detailed texture arrives. Slow texture downloads do not block the controls or gravity engine. Every source file is UTF-8 text so the complete app can be published through a code editor. All graphics, libraries, and simulation code are local; only the optional Google Fonts stylesheet uses a remote service, with system-font fallbacks.


## Run locally

From this directory, start a local web server:

```sh
python3 -m http.server 8080
```

Open [localhost:8080](http://localhost:8080) in a current browser with WebGL 2 and hardware acceleration enabled. Serve the files over HTTP; opening `index.html` directly does not provide the environment required by JavaScript modules and textures.

## Explore

| Action | Control |
| --- | --- |
| Orbit the camera | Drag empty space |
| Zoom | Mouse wheel / trackpad scroll, pinch on touchscreens, or **+ / −** buttons |
| Inspect a body | Click its sphere, label, or name in the object selector |
| Add a planet | Click a planet in the tray to add it, or drag a tray planet into the scene |
| Move a body | Drag its sphere on the horizontal orbital plane through that body |
| Remove a body | Select it and choose **Remove object** or press **Delete**; while dragging, drop it into the removal zone |
| Move along any axis | Adjust the inspector’s **X / Y / Z** sliders; positions are in AU |
| Follow a body | Double-click it, choose **Close up** / **Follow object**, or press **F** |
| Fit the system | Choose **Fit system** or press **Esc** when help is closed |
| Pause or resume | **Space** or the play/pause button |
| Reset the current scenario | **R** or **Reset model** |
| Change mass | Use the mass slider or type a value in solar masses (**M☉**) |
| Change velocity | Choose a direction and strength, then **Give a nudge** |
| Add a black hole | Choose its mass and **Drop a black hole**; an existing hole’s mass is updated |
| Change simulation speed | Adjust **Time speed**, measured in simulated days per real second |

Position editing temporarily pauses the simulation, then restores its previous play/pause state. A displacement preserves the body’s velocity, so gravity determines its new trajectory. Mass changes and velocity nudges take effect immediately. Keyboard shortcuts are inactive while editing a form field or activating a focused control. The interface uses a futuristic mission-control theme; the mouse wheel zooms across the open viewer while inspector panels retain their own scroll.

Tray clicks add a planet near the most massive body; dragging from the tray places it on the orbital plane where you drop it. New planets start with an estimated circular orbital velocity around that body. This gives them a useful initial motion, but does not guarantee a stable orbit in a multi-star system. The interface supports up to 48 bodies for responsiveness and keeps at least one body when removing objects. Reset restores the scenario’s original bodies.

Use **Trails**, **Labels**, and **Velocity** to inspect motion. Trails show the path already traveled; the faint Solar System guides show the initial osculating Keplerian orbits and stay fixed after edits. They are references, not predictions of the modified system.

Try moving Earth outward without changing its speed, increasing the Sun’s mass, or disturbing one star in Figure Eight. In the 三体 scenario, follow Trisolaris and watch its three suns reshape the environment.

## Five scenarios

- **Solar System:** the Sun and eight planets, initialized from approximate J2000 orbital elements with realistic mass ratios, eccentricities, inclinations, and orbital speeds. The initial state is shifted into the system’s center-of-mass frame. The Earth uses the Earth–Moon barycenter’s orbital elements; moons are not modeled separately.
- **Three-Body · 三体:** three stars and a small planet in a fictional unstable system inspired by the novel. The initial conditions are an experiment, rather than a reconstruction of its setting.
- **Figure Eight:** three equal-mass stars initialized from the classical figure-eight choreography. This numerical realization approximates the exact Newtonian periodic solution. A small displacement breaks its precise symmetry.
- **Black Hole:** an idealized massive absorber, three orbiting worlds, and a companion star. The accretion disk and bright ring are artistic visualizations.
- **Binary Stars:** two stars orbit a shared center of mass, with an inner planet and a planet orbiting the binary pair.

The selected scenario is stored in the URL fragment, so links ending in `#solar`, `#three-body`, `#figure-eight`, `#black-hole`, or `#binary` open that model.

## Physics and scale

The simulation uses Newtonian gravity between every pair of bodies. Distances are astronomical units, time is Julian years, mass is solar masses, and the gravitational constant is `G = 4π²`. A kick–drift–kick leapfrog integrator uses fixed steps with power-of-two subdivisions during close encounters. Small gravitational softening prevents a singular force at zero separation.

Body surfaces are enlarged for visibility. Their graphical radii are separate from the physical collision radii. Initial stellar and planetary collision radii approximate their actual sizes. Collisions merge bodies while preserving total mass and linear momentum; the lost kinetic energy represents an inelastic collision.

Black holes use Newtonian attraction and an intentionally enlarged absorbing boundary of `0.025 × mass^(1/3)` AU. This makes capture explorable at Solar System scales. Their true Schwarzschild radius is retained separately as `eventHorizonRadius` metadata, and their capture and display radii update when mass changes or material is absorbed. The app does not calculate general relativity, relativistic orbits, gravitational lensing, radiation, or accretion fluid dynamics.

**Energy drift** measures the change since reset or the last manual edit. Collisions can change that value because they dissipate energy. These models are designed for interactive experiments, rather than precision ephemeris prediction.

## Performance

Rendering uses `requestAnimationFrame` and targets smooth 60 fps interaction. **Auto quality** adjusts rendering resolution to the measured frame rate; **Performance** reduces resolution further, while **High quality** favors detail. The actual frame rate depends on the GPU, browser, screen resolution, display refresh rate, and scene.

The physics work per display frame is capped. In an expensive close encounter the app may discard excess requested simulation time to stay responsive. **Elapsed time** counts only the time actually integrated, and the status indicates when the simulation is being limited. The selected days-per-second value is therefore a target, rather than a guaranteed pace during those encounters.

## Publish on GitHub Pages

Place this directory’s contents at the root of a GitHub repository and push them to `main`. In the repository, open **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, and save. GitHub displays the published site’s address when deployment is ready. No custom workflow or build command is needed. See [GitHub’s publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Tests

With Node.js installed, run:

```sh
node --test tests/*.test.mjs
```

The 15 tests cover orbit closure; Solar System energy, linear momentum, and angular momentum; independence from display frame partitions; bounded stepping; close encounters; mass and momentum conservation in mergers; swept black-hole capture; black-hole radius consistency; all presets; the figure-eight period; input validation; gravitational changes when adding or removing a body; generated body IDs and empty-scene diagnostics; and clearing pre-edit fractional time requests.

## Sources and credits

- [JPL Solar System Dynamics: Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html), Table 1 at J2000, supplies the initial Solar System orbital elements. These are approximate Keplerian elements, not a high-precision ephemeris.
- Alain Chenciner and Richard Montgomery, [A remarkable periodic solution of the three-body problem in the case of equal masses](https://arxiv.org/abs/math/0011268), *Annals of Mathematics* 152 (2000), describes the figure-eight choreography.
- [Three.js](https://threejs.org/) supplies the rendering engine; its MIT license is included in [vendor/THREE-LICENSE.txt](vendor/THREE-LICENSE.txt).
- Planetary texture assets are by Solar System Scope / INOVE, licensed under CC BY 4.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the source links and attribution.

Original application code is released under the [MIT License](LICENSE). Third-party assets retain their respective licenses.
