import test from 'node:test';
import assert from 'node:assert/strict';
import { GravitySimulation, G, DEFAULT_STEP, blackHoleRadii, SCHWARZSCHILD_AU_PER_SOLAR_MASS } from '../js/physics.js';
import { PRESETS, barycentric } from '../js/presets.js';

const norm = (v) => Math.hypot(v.x, v.y, v.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const body = (id, mass, position, velocity, extra = {}) => ({ id, name: id, type: 'planet', mass, radius: 0, visualRadius: 0.1, position, velocity, ...extra });
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
  assert.equal(simulation.bodies.length, 9);
  assert.ok(norm(initial.momentum) < 1e-17);
  assert.ok(norm(initial.centerOfMass) < 1e-16);
  const report = simulation.advance(5, 20000);
  const after = simulation.diagnostics();
  assert.equal(report.skippedYears, 0);
  assert.equal(after.bodyCount, 9);
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
    body('a', 3, { x: -0.02, y: 0, z: 0 }, { x: 2, y: 1, z: 0 }, { radius: 0.1 }),
    body('b', 1, { x: 0.02, y: 0, z: 0 }, { x: -1, y: 3, z: 0 }, { radius: 0.1 }),
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
  simulation.bodies.push(body('incoming', 1, { x: 0.001, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }));
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
  assert.deepEqual(PRESETS.map((entry) => entry.id), ['solar', 'three-body', 'figure-eight', 'black-hole', 'binary']);
  for (const entry of PRESETS) {
    const first = entry.create();
    const second = entry.create();
    assert.notEqual(first[0].position, second[0].position);
    assert.ok(first.some((b) => b.id === entry.selectedId));
    const simulation = new GravitySimulation(first);
    assert.ok(norm(simulation.diagnostics().momentum) < 1e-13, entry.id);
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
