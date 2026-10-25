import test from 'node:test';
import assert from 'node:assert/strict';
import { GravitySimulation, G, DEFAULT_STEP, blackHoleRadii, SCHWARZSCHILD_AU_PER_SOLAR_MASS } from '../js/physics.js';
import { PRESETS, barycentric } from '../js/presets.js';
import { BODY_CATALOG, createBodyTemplate, physicalRadius, JUPITER_MASS, EARTH_MASS, AU_KM, NEUTRON_STAR_LIMIT } from '../js/bodies.js';

const norm = (v) => Math.hypot(v.x, v.y, v.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const body = (id, mass, position, velocity, extra = {}) => ({ id, name: id, type: 'planet', mass, radius: 1e-12, visualRadius: 1e-12, position, velocity, ...extra });
const zero = () => ({ x: 0, y: 0, z: 0 });
const preset = (id) => PRESETS.find((entry) => entry.id === id);

function circularPair() {
  const planetMass = 3.00349e-6;
  return barycentric([
    body('sun', 1, zero(), zero(), { type: 'star' }),
    body('earth', planetMass, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: Math.sqrt(G * (1 + planetMass)) }),
  ]);
}

test('one-year circular orbit closes and conserves energy', () => {
  const simulation = new GravitySimulation(circularPair());
  const initial = simulation.bodies.map((b) => ({ ...b.position }));
  const energy = simulation.diagnostics().energy;
  const period = Math.sqrt(1 / (1 + 3.00349e-6));
  for (let i = 0; i < 4096; i += 1) simulation.step(period / 4096);
  assert.ok(distance(simulation.bodies[1].position, initial[1]) < 0.00001, 'Earth should complete an orbit');
  assert.ok(Math.abs((simulation.diagnostics().energy - energy) / energy) < 1e-9, 'energy should remain bounded');
  assert.ok(norm(simulation.diagnostics().momentum) < 1e-17);
});

test('solar preset is barycentric and its five-year integration conserves invariants', () => {
  const simulation = new GravitySimulation(preset('solar').create());
  const initial = simulation.diagnostics();
  const expectedCount = preset('solar').create().length;
  assert.ok(expectedCount >= 9);
  assert.equal(simulation.bodies.length, expectedCount);
  assert.ok(norm(initial.momentum) < 1e-17);
  assert.ok(norm(initial.centerOfMass) < 1e-16);
  const reports = Array.from({ length: 10 }, () => simulation.advance(0.5, 20000));
  const after = simulation.diagnostics();
  assert.ok(reports.every((report) => report.skippedYears === 0));
  assert.equal(after.bodyCount, expectedCount);
  assert.ok(norm(after.momentum) < 1e-15);
  assert.ok(norm(after.centerOfMass) < 1e-13);
  assert.ok(Math.abs((after.energy - initial.energy) / initial.energy) < 0.00001);
  assert.ok(distance(after.angularMomentum, initial.angularMomentum) < 1e-13);
});

test('display frame partitions produce the same fixed-step trajectory', () => {
  const together = new GravitySimulation(preset('three-body').create());
  const partitioned = new GravitySimulation(preset('three-body').create());
  together.advance(0.5, 20000);
  for (let frame = 0; frame < 60; frame += 1) partitioned.advance(0.5 / 60, 20000);
  assert.equal(together.time, partitioned.time);
  for (let i = 0; i < together.bodies.length; i += 1) {
    assert.ok(distance(together.bodies[i].position, partitioned.bodies[i].position) < 1e-13);
    assert.ok(distance(together.bodies[i].velocity, partitioned.bodies[i].velocity) < 1e-13);
  }
});

test('step budget reports dropped simulation time instead of unbounded work', () => {
  const simulation = new GravitySimulation(circularPair());
  const report = simulation.advance(100, 3);
  assert.equal(report.steps, 3);
  assert.equal(simulation.time, DEFAULT_STEP * 3);
  assert.ok(report.skippedYears > 99);
  assert.ok(report.pendingYears < report.stepSize);
  assert.equal(report.limited, true);
  assert.ok(Math.abs(report.advancedYears + report.skippedYears + report.pendingYears - 100) < 1e-12);
});

test('near encounters subdivide the base step without introducing nonfinite state', () => {
  const simulation = new GravitySimulation([
    body('a', 1, { x: -0.025, y: 0, z: 0 }, { x: 0, y: 0, z: -8 }),
    body('b', 1, { x: 0.025, y: 0, z: 0 }, { x: 0, y: 0, z: 8 }),
  ]);
  const report = simulation.advance(0.0001, 1000);
  assert.ok(report.stepSize < DEFAULT_STEP);
  assert.ok(report.steps > 1);
  assert.ok(simulation.bodies.every((b) => Object.values(b.position).every(Number.isFinite)));
  assert.ok(norm(simulation.diagnostics().momentum) < 1e-12);
});

test('mergers conserve mass, momentum and center of mass', () => {
  const simulation = new GravitySimulation([
    body('a', 3, { x: -0.02, y: 0, z: 0 }, { x: 2, y: 1, z: 0 }, { type: 'star', radius: 0.1 }),
    body('b', 1, { x: 0.02, y: 0, z: 0 }, { x: -1, y: 3, z: 0 }, { type: 'star', radius: 0.1 }),
  ]);
  const before = simulation.diagnostics();
  const dt = 0.001;
  simulation.step(dt);
  const after = simulation.diagnostics();
  assert.equal(simulation.bodies.length, 1);
  assert.equal(after.totalMass, 4);
  assert.ok(distance(before.momentum, after.momentum) < 1e-14);
  const expectedCenter = Object.fromEntries(['x', 'y', 'z'].map((axis) => [axis, before.centerOfMass[axis] + before.momentum[axis] / before.totalMass * dt]));
  assert.ok(distance(after.centerOfMass, expectedCenter) < 1e-14);
  assert.equal(simulation.events[0].type, 'merge');
});

test('swept collision detection catches a body crossing an absorber between steps', () => {
  const simulation = new GravitySimulation([
    body('hole', 1, zero(), zero(), { type: 'blackhole' }),
    body('flyby', 1e-6, { x: -1, y: 0, z: 0 }, { x: 2000, y: 0, z: 0 }),
  ]);
  simulation.step(0.001);
  assert.equal(simulation.bodies.length, 1);
  assert.equal(simulation.bodies[0].id, 'hole');
  assert.equal(simulation.events[0].type, 'absorption');
});

test('black-hole creation, mass edits, and absorption keep every radius consistent', () => {
  const simulation = new GravitySimulation([]);
  const hole = simulation.addBlackHole(1);
  simulation.setMass(hole.id, 8);
  assert.equal(hole.radius, blackHoleRadii(8).radius);
  assert.equal(hole.visualRadius, blackHoleRadii(8).visualRadius);
  assert.equal(hole.eventHorizonRadius, 8 * SCHWARZSCHILD_AU_PER_SOLAR_MASS);
  simulation.bodies.push(body('incoming', 1, { x: 0.00000001, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }));
  const momentum = simulation.diagnostics().momentum;
  simulation.step(0.0001);
  assert.equal(hole.mass, 9);
  assert.equal(hole.radius, blackHoleRadii(9).radius);
  assert.equal(hole.visualRadius, blackHoleRadii(9).visualRadius);
  assert.equal(hole.eventHorizonRadius, 9 * SCHWARZSCHILD_AU_PER_SOLAR_MASS);
  assert.ok(distance(momentum, simulation.diagnostics().momentum) < 1e-12);
  simulation.addBlackHole(12);
  assert.equal(simulation.bodies.length, 1);
  assert.equal(hole.mass, 12);
});

test('all presets create isolated, finite, momentum-balanced scenes', () => {
  for (const id of ['solar', 'three-body', 'figure-eight', 'black-hole', 'binary']) assert.ok(PRESETS.some((entry) => entry.id === id));
  for (const entry of PRESETS) {
    const first = entry.create();
    const second = entry.create();
    assert.notEqual(first[0].position, second[0].position);
    assert.ok(first.some((b) => b.id === entry.selectedId));
    const simulation = new GravitySimulation(first);
    if (entry.id !== 'galaxy') assert.ok(norm(simulation.diagnostics().momentum) < 1e-13, entry.id);
    simulation.advance(0.05, 20000);
    assert.ok(simulation.bodies.every((b) => Object.values(b.position).every(Number.isFinite)), entry.id);
  }
});

test('figure-eight choreography returns close to its initial state after one period', () => {
  const simulation = new GravitySimulation(preset('figure-eight').create());
  const before = simulation.bodies.map((b) => ({ ...b.position }));
  const period = simulation.bodies[0].choreographyPeriod;
  const steps = Math.ceil(period / DEFAULT_STEP);
  for (let i = 0; i < steps; i += 1) simulation.step(period / steps);
  for (let i = 0; i < 3; i += 1) assert.ok(distance(simulation.bodies[i].position, before[i]) < 0.001);
});

test('input edits validate numbers and do not alias preset vectors', () => {
  const bodies = circularPair();
  const simulation = new GravitySimulation(bodies);
  simulation.displace('earth', { x: 2, y: 3, z: 4 });
  assert.notEqual(bodies[1].position.x, 2);
  const oldVelocity = { ...simulation.bodies[1].velocity };
  simulation.impulse('earth', { x: 1, y: 2, z: 3 });
  assert.equal(simulation.bodies[1].velocity.z, oldVelocity.z + 3);
  assert.throws(() => simulation.setMass('earth', -1), RangeError);
  assert.throws(() => simulation.advance(NaN), RangeError);
  assert.throws(() => simulation.displace('earth', { x: Infinity, y: 0, z: 0 }), TypeError);
});

test('adding and removing a body changes the gravitational motion immediately', () => {
  const simulation = new GravitySimulation([body('primary', 1, zero(), zero(), { type: 'star' })]);
  simulation.advance(0.01, 20000);
  assert.deepEqual(simulation.bodies[0].position, zero());
  const source = body('new-planet', 0.2, { x: 1, y: 0, z: 0 }, zero());
  const added = simulation.addBody(source);
  assert.equal(added, simulation.bodies[1]);
  assert.notEqual(added.position, source.position);
  assert.notEqual(added.velocity, source.velocity);
  simulation.advance(0.01, 20000);
  const primary = simulation.bodies[0];
  assert.ok(primary.position.x > 0.0003, 'the newly added mass must pull on the original star');
  assert.ok(added.velocity.x < 0, 'the new body must also respond to gravity');
  const removed = simulation.removeBody(added.id);
  assert.equal(removed, added);
  const before = { ...primary.position };
  const velocity = { ...primary.velocity };
  const dt = 0.005;
  simulation.step(dt);
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(Math.abs(primary.position[axis] - before[axis] - velocity[axis] * dt) < 1e-14, 'removing the companion must remove its force');
  }
  assert.deepEqual(primary.velocity, velocity);
});

test('new-body validation rejects duplicates and invalid state without changing the scene', () => {
  const simulation = new GravitySimulation([body('existing', 1, zero(), zero())]);
  const candidate = body('valid', 0.001, { x: 2, y: 0, z: 0 }, zero());
  assert.throws(() => simulation.addBody({ ...candidate, id: 'existing' }), /unique/);
  assert.throws(() => simulation.addBody({ ...candidate, mass: 0 }), RangeError);
  assert.throws(() => simulation.addBody({ ...candidate, position: { x: NaN, y: 0, z: 0 } }), TypeError);
  assert.throws(() => simulation.addBody({ ...candidate, radius: -1 }), RangeError);
  assert.throws(() => simulation.addBody(null), TypeError);
  assert.throws(() => simulation.removeBody('missing'), /Unknown body/);
  assert.equal(simulation.bodies.length, 1);
  assert.equal(simulation.bodies[0].id, 'existing');
});

test('generated body IDs stay unique after removals and an empty scene remains valid', () => {
  const simulation = new GravitySimulation([]);
  const template = { mass: 0.001, position: { x: 3, y: 0, z: 0 }, velocity: zero() };
  const first = simulation.addBody(template);
  const second = simulation.addBody(template);
  simulation.removeBody(first.id);
  const third = simulation.addBody(template);
  assert.notEqual(second.id, third.id);
  simulation.removeBody(second.id);
  simulation.removeBody(third.id);
  simulation.advance(0.01);
  const diagnostics = simulation.diagnostics();
  assert.equal(diagnostics.bodyCount, 0);
  assert.equal(diagnostics.totalMass, 0);
  assert.equal(diagnostics.energy, 0);
  assert.deepEqual(diagnostics.centerOfMass, zero());
  assert.deepEqual(diagnostics.momentum, zero());
  assert.ok(Number.isFinite(diagnostics.time));
});

test('manual edits do not consume a fractional time request made before the edit', () => {
  const actions = [
    (simulation) => simulation.displace('probe', { x: 4, y: 0, z: 0 }),
    (simulation) => simulation.impulse('probe', { x: 0, y: 0, z: 0.1 }),
    (simulation) => simulation.setMass('probe', 0.002),
    (simulation) => simulation.addBody(body('other', 0.001, { x: 5, y: 0, z: 0 }, zero())),
    (simulation) => simulation.removeBody('probe'),
    (simulation) => simulation.addBlackHole(1),
  ];
  for (const edit of actions) {
    const simulation = new GravitySimulation([body('probe', 0.001, { x: 3, y: 0, z: 0 }, zero())]);
    simulation.advance(DEFAULT_STEP * 0.5);
    edit(simulation);
    const report = simulation.advance(DEFAULT_STEP * 0.6);
    assert.equal(report.steps, 0, 'pre-edit time must not be carried into the new physical state');
    assert.equal(simulation.time, 0);
  }
});

test('physical catalog has positive actual radii and black-hole capture is its Schwarzschild radius', () => {
  for (const [kind, template] of Object.entries(BODY_CATALOG)) {
    assert.ok(Number.isFinite(template.mass) && template.mass > 0, kind);
    assert.ok(Number.isFinite(template.radius) && template.radius > 0, kind);
  }
  assert.ok(Math.abs(BODY_CATALOG.earth.radius * AU_KM - 6371) < 1e-10);
  assert.equal(blackHoleRadii(5).radius, 5 * SCHWARZSCHILD_AU_PER_SOLAR_MASS);
  assert.equal(blackHoleRadii(5).visualRadius, blackHoleRadii(5).radius);
  assert.throws(() => new GravitySimulation([body('zero-radius', 1e-6, zero(), zero(), { radius: 0 })]), RangeError);
  assert.throws(() => createBodyTemplate('earth', { mass: -1 }), RangeError);
});

test('colliding planets leave an identifiable composite with the combined physical mass', () => {
  const earth = createBodyTemplate('earth', { id: 'earth', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0.01, y: 0.02, z: 0 } });
  const mars = createBodyTemplate('mars', { id: 'mars', position: { x: earth.radius, y: 0, z: 0 }, velocity: { x: -0.02, y: 0.01, z: 0 } });
  const simulation = new GravitySimulation([earth, mars]);
  const before = simulation.diagnostics();
  simulation.step(1e-7);
  const result = simulation.bodies[0];
  const event = simulation.events.at(-1);
  assert.equal(simulation.bodies.length, 1);
  assert.equal(result.id, 'earth');
  assert.match(result.name, /Merged world/);
  assert.deepEqual(result.mergedFrom, ['Earth', 'Mars']);
  assert.equal(result.mass, earth.mass + mars.mass);
  assert.equal(result.radius, physicalRadius(result.mass, 'planet'));
  assert.ok(result.radius > earth.radius);
  assert.ok(distance(simulation.diagnostics().momentum, before.momentum) < 1e-18);
  assert.equal(event.resultId, result.id);
  assert.deepEqual(event.absorbedIds, ['mars']);
  assert.deepEqual(event.mergedFrom, ['Earth', 'Mars']);
  assert.ok(Object.values(event.position).every(Number.isFinite));
  assert.equal(event.resultType, 'planet');
});

test('mass growth promotes planets through fusion thresholds without creating neutron stars', () => {
  const simulation = new GravitySimulation([createBodyTemplate('earth', { id: 'world' })]);
  const world = simulation.bodies[0];
  simulation.setMass('world', 14 * JUPITER_MASS);
  assert.equal(world.type, 'browndwarf');
  assert.ok(world.radius > BODY_CATALOG.jupiter.radius * 0.8 && world.radius < BODY_CATALOG.jupiter.radius * 1.1, 'brown-dwarf radii stay close to Jupiter’s radius');
  simulation.setMass('world', 81 * JUPITER_MASS);
  assert.equal(world.type, 'star');
  assert.equal(world.texture, 'sun');
  simulation.setMass('world', 12);
  assert.equal(world.type, 'star');
  assert.equal(world.radius, physicalRadius(12, 'star'));
  assert.throws(() => simulation.setMass('world', -12), RangeError);
  assert.equal(world.mass, 12);
  assert.ok(!simulation.bodies.some((candidate) => candidate.type === 'neutronstar'));
});

test('explicit core collapse leaves a neutron star and conserves mass and momentum in ejecta', () => {
  const simulation = new GravitySimulation([createBodyTemplate('star', { id: 'progenitor', mass: 12, position: { x: 1, y: 0.2, z: -2 }, velocity: { x: 0.5, y: -0.2, z: 0.1 } })]);
  const before = simulation.diagnostics();
  const remnant = simulation.collapseStar('progenitor');
  const after = simulation.diagnostics();
  assert.equal(remnant.type, 'neutronstar');
  assert.equal(remnant.mass, 1.4);
  assert.ok(Math.abs(remnant.radius * AU_KM - 12) < 1e-10);
  assert.equal(simulation.bodies.filter((candidate) => candidate.type === 'ejecta').length, 2);
  assert.equal(after.totalMass, before.totalMass);
  assert.ok(distance(before.momentum, after.momentum) < 1e-12);
  assert.ok(distance(before.centerOfMass, after.centerOfMass) < 1e-14);
  assert.equal(simulation.events.at(-1).type, 'collapse');
  assert.equal(simulation.events.at(-1).ejectaIds.length, 2);
  simulation.advance(1e-5, 20000);
  assert.equal(simulation.bodies.length, 3, 'ejecta must not immediately re-merge into its remnant');
  const lowMass = new GravitySimulation([createBodyTemplate('sun', { id: 'sun' })]);
  assert.throws(() => lowMass.collapseStar('sun'), /at least 8/);
});

test('a massive star can explicitly collapse to a black hole and an overloaded neutron star collapses automatically', () => {
  const simulation = new GravitySimulation([createBodyTemplate('star', { id: 'massive', mass: 30 })]);
  const mass = simulation.diagnostics().totalMass;
  const remnant = simulation.collapseStar('massive');
  assert.equal(remnant.type, 'blackhole');
  assert.equal(simulation.diagnostics().totalMass, mass);
  assert.equal(remnant.radius, blackHoleRadii(remnant.mass).radius);
  const neutron = new GravitySimulation([createBodyTemplate('neutronstar', { id: 'pulsar' })]);
  neutron.setMass('pulsar', NEUTRON_STAR_LIMIT + 0.01);
  assert.equal(neutron.bodies[0].type, 'blackhole');
  assert.equal(neutron.events.at(-1).type, 'collapse');
  assert.equal(neutron.events.at(-1).previousType, 'neutronstar');
});

test('a neutron star accreting past its chosen stability limit becomes a mass-conserving black hole', () => {
  const neutron = createBodyTemplate('neutronstar', { id: 'ns', mass: 2.1 });
  const donor = createBodyTemplate('star', { id: 'donor', mass: 0.2, position: { x: 0.0001, y: 0, z: 0 }, velocity: { x: 0.1, y: 0.3, z: 0 } });
  const simulation = new GravitySimulation([neutron, donor]);
  const before = simulation.diagnostics();
  simulation.step(1e-9);
  assert.equal(simulation.bodies.length, 1);
  assert.equal(simulation.bodies[0].type, 'blackhole');
  assert.ok(Math.abs(simulation.bodies[0].mass - 2.3) < 1e-14);
  assert.ok(distance(simulation.diagnostics().momentum, before.momentum) < 1e-14);
  assert.ok(simulation.events.some((event) => event.type === 'collapse'));
});

test('a circular satellite around a moving Earth survives ten local orbits without global-softening bias', () => {
  const earth = createBodyTemplate('earth', { id: 'earth', position: { x: 1, y: 0.03, z: 0.2 }, velocity: { x: -1, y: 0.1, z: 6 } });
  const orbitalRadius = (6371 + 1000) / AU_KM;
  const satellite = body('satellite', 1e-22, { x: earth.position.x + orbitalRadius, y: earth.position.y, z: earth.position.z }, zero(), { radius: 0.003 / AU_KM, type: 'moon' });
  const simulation = new GravitySimulation([earth, satellite]);
  simulation.circularizeOrbit('satellite', 'earth', { radius: orbitalRadius });
  assert.ok(simulation.bodies[1].velocity.z > earth.velocity.z, 'velocity must be relative to the moving selected Earth');
  const initial = simulation.diagnostics();
  const period = 2 * Math.PI * Math.sqrt(orbitalRadius ** 3 / (G * (earth.mass + satellite.mass)));
  let largestError = 0;
  for (let i = 0; i < 100; i += 1) {
    const report = simulation.advance(period / 10, 20000);
    assert.equal(report.limited, false);
    largestError = Math.max(largestError, Math.abs(distance(simulation.bodies[0].position, simulation.bodies[1].position) / orbitalRadius - 1));
  }
  assert.equal(simulation.bodies.length, 2);
  assert.ok(largestError < 0.0005, `local orbit radius drift: ${largestError}`);
  assert.ok(Math.abs((simulation.diagnostics().energy - initial.energy) / initial.energy) < 1e-8);
  assert.ok(distance(simulation.diagnostics().momentum, initial.momentum) < 1e-16);
  assert.throws(() => simulation.circularizeOrbit('satellite', 'earth', { radius: earth.radius }), RangeError);
});
