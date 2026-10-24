import { G, blackHoleRadii } from './physics.js?v=1.1.0';

const SUN_RADIUS = 0.00465047;
const radians = (degrees) => degrees * Math.PI / 180;
const zero = () => ({ x: 0, y: 0, z: 0 });

/** Put both positions and velocities in the system's center-of-mass frame. */
export function barycentric(bodies) {
  const totalMass = bodies.reduce((total, body) => total + body.mass, 0);
  const position = zero();
  const velocity = zero();
  for (const body of bodies) for (const axis of ['x', 'y', 'z']) {
    position[axis] += body.mass * body.position[axis] / totalMass;
    velocity[axis] += body.mass * body.velocity[axis] / totalMass;
  }
  for (const body of bodies) for (const axis of ['x', 'y', 'z']) {
    body.position[axis] -= position[axis];
    body.velocity[axis] -= velocity[axis];
  }
  return bodies;
}

function star(id, name, mass, position, velocity, color = '#ffbd68', visualRadius = 0.32) {
  return { id, name, type: 'star', mass, radius: SUN_RADIUS * mass ** 0.8, visualRadius, position, velocity, color, texture: 'sun', description: 'A gravitating star. Its visible sphere is enlarged so the system is easy to explore.' };
}

function planet(id, name, mass, position, velocity, color, texture = 'rocky', visualRadius = 0.13, radius = 0.0000426) {
  return { id, name, type: 'planet', mass, radius, visualRadius, position, velocity, color, texture, description: 'A freely moving body: its orbit responds to the gravity of every other object.' };
}

/** Keplerian orbital elements at J2000, used as an illustrative initial state. */
function keplerState(a, eccentricity, inclination, node, periapsis, meanAnomaly, centralMass = 1) {
  const mean = radians(meanAnomaly);
  let eccentricAnomaly = mean;
  for (let iteration = 0; iteration < 12; iteration += 1) {
    eccentricAnomaly -= (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - mean) / (1 - eccentricity * Math.cos(eccentricAnomaly));
  }
  const c = Math.cos(eccentricAnomaly);
  const s = Math.sin(eccentricAnomaly);
  const q = Math.sqrt(1 - eccentricity * eccentricity);
  const n = Math.sqrt(G * centralMass / a ** 3);
  const orbitalPosition = [a * (c - eccentricity), a * q * s];
  const orbitalVelocity = [-a * n * s / (1 - eccentricity * c), a * n * q * c / (1 - eccentricity * c)];
  const i = radians(inclination);
  const o = radians(node);
  const w = radians(periapsis);
  const transform = ([x, y]) => ({
    x: (Math.cos(o) * Math.cos(w) - Math.sin(o) * Math.sin(w) * Math.cos(i)) * x + (-Math.cos(o) * Math.sin(w) - Math.sin(o) * Math.cos(w) * Math.cos(i)) * y,
    y: Math.sin(w) * Math.sin(i) * x + Math.cos(w) * Math.sin(i) * y,
    z: (Math.sin(o) * Math.cos(w) + Math.cos(o) * Math.sin(w) * Math.cos(i)) * x + (-Math.sin(o) * Math.sin(w) + Math.cos(o) * Math.cos(w) * Math.cos(i)) * y,
  });
  return { position: transform(orbitalPosition), velocity: transform(orbitalVelocity) };
}

function solarSystem() {
  const sun = star('sun', 'Sun', 1, zero(), zero(), '#ffd590', 0.24);
  sun.description = 'Our Sun holds 99.86% of the Solar System’s mass. All eight planets exert their own gravitational pull.';
  const elements = [
    // id, name, mass (M☉), radius (AU), a, e, i, Ω, ω, M, color, display radius
    ['mercury', 'Mercury', 1.66012e-7, 0.00001631, 0.38709927, 0.20563593, 7.00497902, 48.33076593, 29.12703035, 174.79252722, '#b6a397', 0.105],
    ['venus', 'Venus', 2.44784e-6, 0.00004045, 0.72333566, 0.00677672, 3.39467605, 76.67984255, 54.92262463, 50.37663232, '#e0b979', 0.14],
    ['earth', 'Earth', 3.00349e-6, 0.00004259, 1.00000261, 0.01671123, -0.00001531, 0, 102.93768193, 357.52688973, '#72b8ec', 0.15],
    ['mars', 'Mars', 3.22715e-7, 0.00002266, 1.52371034, 0.09339410, 1.84969142, 49.55953891, 286.49683150, 19.39019754, '#d97850', 0.125],
    ['jupiter', 'Jupiter', 0.00095479, 0.00046733, 5.20288700, 0.04838624, 1.30439695, 100.47390909, 274.25457074, 19.66796068, '#d8b18d', 0.35],
    ['saturn', 'Saturn', 0.000285886, 0.00038926, 9.53667594, 0.05386179, 2.48599187, 113.66242448, 338.93645383, 317.35536592, '#dfcd9a', 0.3],
    ['uranus', 'Uranus', 0.0000436624, 0.00016953, 19.18916464, 0.04725744, 0.77263783, 74.01692503, 96.93735127, 142.28382821, '#a2e0e3', 0.24],
    ['neptune', 'Neptune', 0.0000515139, 0.00016459, 30.06992276, 0.00859048, 1.77004347, 131.78422574, 273.18053653, 259.91520804, '#547fe1', 0.23],
  ];
  const planets = elements.map(([id, name, mass, radius, a, e, i, o, w, m, color, displayRadius]) => {
    const state = keplerState(a, e, i, o, w, m, 1 + mass);
    const body = planet(id, name, mass, state.position, state.velocity, color, id, displayRadius, radius);
    body.semiMajorAxis = a;
    body.orbitalPeriod = Math.sqrt(a ** 3 / (1 + mass));
    body.description = `${name} begins with approximate J2000 orbital elements. Its visible size is enlarged; its mass and gravitational orbit use astronomical units.`;
    return body;
  });
  return barycentric([sun, ...planets]);
}

function threeBody() {
  const a = star('alpha', 'Alpha · 恒纪元', 1.15, { x: -2.4, y: 0, z: -1.4 }, { x: 0.25, y: 0.08, z: -2.6 }, '#ffca7d', 0.37);
  const b = star('beta', 'Beta · 乱纪元', 0.85, { x: 2.2, y: 0.08, z: -0.7 }, { x: 0.4, y: -0.12, z: 2.15 }, '#a9d6ff', 0.3);
  const c = star('gamma', 'Gamma · 三日凌空', 0.65, { x: 0.5, y: -0.05, z: 2.6 }, { x: -1.1, y: 0.03, z: 0.85 }, '#ff8768', 0.28);
  const world = planet('trisolaris', 'Trisolaris · 三体', 3.00349e-6,
    { x: a.position.x + 0.48, y: a.position.y, z: a.position.z },
    { x: a.velocity.x, y: a.velocity.y + 0.12, z: a.velocity.z + Math.sqrt(G * a.mass / 0.48) },
    '#82d3c1', 'earth', 0.12);
  world.description = 'A fictional world near Alpha in an unstable triple-star system inspired by 三体. Stable and chaotic eras emerge from this chosen initial state; this is not a reconstruction of the novel’s system.';
  return barycentric([a, b, c, world]);
}

function figureEight() {
  // Moore / Chenciner–Montgomery equal-mass figure-eight choreography, G=1.
  // Scale coordinates by L and velocities by sqrt(G/L) into AU and years.
  const length = 2.8;
  const speed = Math.sqrt(G / length);
  const initial = [
    [-0.97000436, 0.24308753, 0.466203685, 0.43236573],
    [0.97000436, -0.24308753, 0.466203685, 0.43236573],
    [0, 0, -0.93240737, -0.86473146],
  ];
  return initial.map(([x, z, vx, vz], index) => {
    const body = star(['eight-a', 'eight-b', 'eight-c'][index], ['Aster', 'Lyra', 'Cygnus'][index], 1,
      { x: x * length, y: 0, z: z * length },
      { x: vx * speed, y: 0, z: vz * speed },
      ['#ffbd72', '#8cd7ff', '#ff8f9e'][index], 0.26);
    body.description = 'One of three equal-mass stars following a remarkable figure-eight choreography. A small displacement breaks the precise symmetry.';
    body.choreographyPeriod = 6.32591398 * Math.sqrt(length ** 3 / G);
    return body;
  });
}

function blackHole() {
  const mass = 12;
  const hole = {
    id: 'black-hole', name: 'Eventide', type: 'blackhole', mass, ...blackHoleRadii(mass),
    position: zero(), velocity: zero(), color: '#ffbc7a', texture: 'blackhole',
    description: 'A Newtonian absorber with editable mass. The capture boundary is enlarged for interaction; the disk and apparent lensing are artistic, not a general-relativity solution.',
  };
  const orbiters = [
    [1.25, 0.45, 'ember', 'Ember', 3.2e-6, '#d77c59', 'mars', 0.13],
    [2.3, 2.3, 'vesper', 'Vesper', 0.00012, '#c5b694', 'jupiter', 0.22],
    [3.8, 4.5, 'rift', 'Rift', 4.1e-6, '#82c3d6', 'neptune', 0.16],
  ].map(([r, angle, id, name, bodyMass, color, texture, displayRadius]) => {
    const speed = Math.sqrt(G * (mass + bodyMass) / r);
    return planet(id, name, bodyMass, { x: r * Math.cos(angle), y: 0, z: r * Math.sin(angle) }, { x: -speed * Math.sin(angle), y: 0, z: speed * Math.cos(angle) }, color, texture, displayRadius);
  });
  const r = 6.8;
  const companion = star('companion', 'Companion star', 0.7, { x: -r, y: 0.2, z: 0 }, { x: 0, y: 0, z: -Math.sqrt(G * (mass + 0.7) / r) }, '#97caff', 0.31);
  return barycentric([hole, ...orbiters, companion]);
}

function binarySystem() {
  const massA = 1.35;
  const massB = 0.65;
  const separation = 2.4;
  const angularSpeed = Math.sqrt(G * (massA + massB) / separation ** 3);
  const xA = -separation * massB / (massA + massB);
  const xB = separation * massA / (massA + massB);
  const primary = star('binary-a', 'Helios A', massA, { x: xA, y: 0, z: 0 }, { x: 0, y: 0, z: xA * angularSpeed }, '#ffd18a', 0.39);
  const secondary = star('binary-b', 'Helios B', massB, { x: xB, y: 0, z: 0 }, { x: 0, y: 0, z: xB * angularSpeed }, '#ff947b', 0.29);
  const outerRadius = 6.4;
  const outer = planet('circumbinary', 'Tandem', 6e-6, { x: 0, y: 0.15, z: outerRadius }, { x: -Math.sqrt(G * (massA + massB) / outerRadius), y: 0, z: 0 }, '#8ac8ed', 'earth', 0.17);
  outer.description = 'A planet orbiting the combined gravity of two stars. Try moving one star to change the balance of the entire system.';
  const innerRadius = 0.24;
  const inner = planet('binary-inner', 'Cinder', 1.8e-7, { x: xA + innerRadius, y: 0, z: 0 }, { x: 0, y: 0, z: primary.velocity.z + Math.sqrt(G * massA / innerRadius) }, '#ce9272', 'mars', 0.095, 0.00002);
  return barycentric([primary, secondary, outer, inner]);
}

export const PRESETS = [
  {
    id: 'solar', name: 'Solar System', kicker: 'OUR COSMIC NEIGHBORHOOD',
    description: 'Eight planets. One star. A delicate gravitational balance—until you change it.',
    scale: 32, camera: { distance: 12, target: { x: 0, y: 0, z: 0 } }, selectedId: 'earth', create: solarSystem,
  },
  {
    id: 'three-body', name: 'Three-Body · 三体', kicker: 'STABLE ERAS. CHAOTIC ERAS.',
    description: 'Three suns and a fragile world. Inspired by 三体, this fictional system makes chaos visible.',
    scale: 8, camera: { distance: 16, target: { x: 0, y: 0, z: 0 } }, selectedId: 'trisolaris', create: threeBody,
  },
  {
    id: 'figure-eight', name: 'Figure Eight', kicker: 'ORDER INSIDE THE CHAOS',
    description: 'Three equal stars chase a shared figure-eight. Move one, and watch the choreography unravel.',
    scale: 5, camera: { distance: 10, target: { x: 0, y: 0, z: 0 } }, selectedId: 'eight-a', create: figureEight,
  },
  {
    id: 'black-hole', name: 'Black Hole', kicker: 'THE EDGE OF RETURN',
    description: 'A luminous accretion disk surrounds a massive absorber. Explore capture, slingshots, and escape.',
    scale: 9, camera: { distance: 16, target: { x: 0, y: 0, z: 0 } }, selectedId: 'black-hole', create: blackHole,
  },
  {
    id: 'binary', name: 'Binary Stars', kicker: 'TWO SUNS. ONE SKY.',
    description: 'Two stars share a center of mass while their planets navigate a moving gravitational landscape.',
    scale: 9, camera: { distance: 16, target: { x: 0, y: 0, z: 0 } }, selectedId: 'circumbinary', create: binarySystem,
  },
];
