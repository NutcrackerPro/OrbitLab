/** Newtonian N-body dynamics. Units: AU, Julian years and solar masses. */
import { blackHoleRadii, physicalRadius, classifyBody, SCHWARZSCHILD_AU_PER_SOLAR_MASS, NEUTRON_STAR_LIMIT, WHITE_DWARF_LIMIT } from './bodies.js?v=2.0.0';
export { blackHoleRadii, SCHWARZSCHILD_AU_PER_SOLAR_MASS } from './bodies.js?v=2.0.0';
export const G = 4 * Math.PI * Math.PI;
export const DEFAULT_STEP = 1 / 2048;
// This is a ceiling. Each pair uses at most 0.1% of its physical radii sum.
export const DEFAULT_SOFTENING = 0.0001;

const vector = (v = {}) => ({ x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 });
const finiteVector = (v) => v && ['x', 'y', 'z'].every((axis) => Number.isFinite(v[axis]));
const magnitude = (v) => Math.hypot(v.x, v.y, v.z);
const addCross = (out, a, b, mass) => {
  out.x += mass * (a.y * b.z - a.z * b.y);
  out.y += mass * (a.z * b.x - a.x * b.z);
  out.z += mass * (a.x * b.y - a.y * b.x);
};
const classLabel = (type) => ({ browndwarf: 'brown dwarf', neutronstar: 'neutron star', whitedwarf: 'white dwarf', blackhole: 'black hole' }[type] || type);

function normalizeBody(body, index) {
  if (!body || typeof body !== 'object') throw new TypeError('Body must be an object.');
  const mass = Number(body.mass);
  if (!Number.isFinite(mass) || mass <= 0) throw new RangeError('Body mass must be positive and finite.');
  const position = vector(body.position);
  const velocity = vector(body.velocity);
  if (!finiteVector(position) || !finiteVector(velocity)) throw new TypeError('Body coordinates must be finite.');
  const normalized = {
    ...body,
    id: String(body.id ?? `body-${index}`),
    name: body.name ?? `Body ${index + 1}`,
    type: classifyBody(mass, body.type ?? 'planet'),
    mass,
    radius: body.radius ?? physicalRadius(mass, classifyBody(mass, body.type ?? 'planet')),
    visualRadius: body.visualRadius ?? 0,
    color: body.color ?? '#a5c9ff',
    position,
    velocity,
  };
  if (!Number.isFinite(normalized.radius) || normalized.radius <= 0) throw new RangeError('Physical radius must be positive and finite.');
  if (normalized.type !== (body.type ?? 'planet') || ['blackhole', 'neutronstar', 'whitedwarf'].includes(normalized.type)) normalized.radius = physicalRadius(mass, normalized.type);
  normalized.visualRadius = normalized.radius;
  if (normalized.type === 'blackhole') Object.assign(normalized, blackHoleRadii(mass));
  if (normalized.type === 'star' && body.type !== 'star') normalized.texture = 'sun';
  return normalized;
}

export class GravitySimulation {
  constructor(bodies = [], options = {}) {
    this.fixedStep = options.fixedStep ?? DEFAULT_STEP;
    this.softening = options.softening ?? DEFAULT_SOFTENING;
    this.minStep = options.minStep ?? this.fixedStep / 2 ** 34;
    if (!Number.isFinite(this.fixedStep) || this.fixedStep <= 0 || !Number.isFinite(this.minStep) || this.minStep <= 0 || this.minStep > this.fixedStep) {
      throw new RangeError('Integrator steps must be positive, with minStep ≤ fixedStep.');
    }
    if (!Number.isFinite(this.softening) || this.softening <= 0) throw new RangeError('Softening must be positive.');
    this.setBodies(bodies);
  }

  setBodies(bodies) {
    const next = bodies.map(normalizeBody);
    if (new Set(next.map((b) => b.id)).size !== next.length) throw new Error('Body IDs must be unique.');
    this.bodies = next;
    this.time = 0;
    this.events = [];
    this.mergerCount = 0;
    this.pendingYears = 0;
    this.skippedYears = 0;
    this.lastAdvance = { steps: 0, requestedYears: 0, advancedYears: 0, skippedYears: 0, pendingYears: 0, stepSize: this.fixedStep, limited: false };
    return this;
  }

  _pairSoftening(a, b) {
    return Math.max(1e-16, Math.min(this.softening, 0.001 * (a.radius + b.radius)));
  }

  _event(event) {
    this.events.push(event);
    if (this.events.length > 64) this.events.shift();
    return event;
  }

  _accelerations() {
    const acc = new Float64Array(this.bodies.length * 3);
    for (let i = 0; i < this.bodies.length; i += 1) {
      const a = this.bodies[i];
      for (let j = i + 1; j < this.bodies.length; j += 1) {
        const b = this.bodies[j];
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const dz = b.position.z - a.position.z;
        const epsilon = this._pairSoftening(a, b);
        const r2 = dx * dx + dy * dy + dz * dz + epsilon * epsilon;
        const factor = G / (r2 * Math.sqrt(r2));
        const ai = factor * b.mass;
        const aj = factor * a.mass;
        acc[i * 3] += ai * dx;
        acc[i * 3 + 1] += ai * dy;
        acc[i * 3 + 2] += ai * dz;
        acc[j * 3] -= aj * dx;
        acc[j * 3 + 1] -= aj * dy;
        acc[j * 3 + 2] -= aj * dz;
      }
    }
    return acc;
  }

  _mergeCollisions(previousPositions = null, eventTime = this.time) {
    let merged = true;
    while (merged) {
      merged = false;
      pairs: for (let i = 0; i < this.bodies.length; i += 1) {
        for (let j = i + 1; j < this.bodies.length; j += 1) {
          const a = this.bodies[i];
          const b = this.bodies[j];
          let dx = a.position.x - b.position.x;
          let dy = a.position.y - b.position.y;
          let dz = a.position.z - b.position.z;
          if (a.collisionless || b.collisionless) continue;
          const boundary = a.radius + b.radius;
          let distance2 = dx * dx + dy * dy + dz * dz;
          const pa = previousPositions?.get(a.id);
          const pb = previousPositions?.get(b.id);
          if (pa && pb) {
            const px = pa.x - pb.x;
            const py = pa.y - pb.y;
            const pz = pa.z - pb.z;
            dx -= px; dy -= py; dz -= pz;
            const length2 = dx * dx + dy * dy + dz * dz;
            const t = length2 > 0 ? Math.max(0, Math.min(1, -(px * dx + py * dy + pz * dz) / length2)) : 0;
            distance2 = Math.min(distance2, (px + t * dx) ** 2 + (py + t * dy) ** 2 + (pz + t * dz) ** 2);
          }
          if (boundary <= 0 || distance2 > boundary * boundary) continue;
          const rank = (body) => ({ blackhole: 5, neutronstar: 4, whitedwarf: 3, star: 2, browndwarf: 1 }[body.type] || 0);
          const survivor = rank(a) > rank(b) || (rank(a) === rank(b) && a.mass >= b.mass) ? a : b;
          const absorbed = survivor === a ? b : a;
          const totalMass = a.mass + b.mass;
          for (const axis of ['x', 'y', 'z']) {
            survivor.position[axis] = (a.position[axis] * a.mass + b.position[axis] * b.mass) / totalMass;
            survivor.velocity[axis] = (a.velocity[axis] * a.mass + b.velocity[axis] * b.mass) / totalMass;
          }
          const previousType = survivor.type;
          const sourceNames = [...(a.mergedFrom || [a.name]), ...(b.mergedFrom || [b.name])];
          const sourceIds = [...(a.mergedIds || [a.id]), ...(b.mergedIds || [b.id])];
          const resultType = classifyBody(totalMass, ['moon', 'comet', 'asteroid'].includes(previousType) ? 'planet' : previousType);
          // Above the white-dwarf stability limit, represent disruption as ejecta,
          // never manufacture a neutron star by simply combining planet masses.
          const disrupted = resultType === 'whitedwarf' && totalMass > WHITE_DWARF_LIMIT;
          survivor.type = disrupted ? 'ejecta' : resultType;
          survivor.mass = totalMass;
          survivor.radius = disrupted ? Math.cbrt(a.radius ** 3 + b.radius ** 3) : physicalRadius(totalMass, survivor.type);
          survivor.visualRadius = survivor.radius;
          survivor.mergedFrom = sourceNames;
          survivor.mergedIds = sourceIds;
          survivor.mergerCount = (a.mergerCount || 0) + (b.mergerCount || 0) + 1;
          this.mergerCount += 1;
          const absorption = previousType === 'blackhole';
          if (survivor.type === 'blackhole') Object.assign(survivor, blackHoleRadii(totalMass), { texture: 'blackhole', color: '#ffbd7a' });
          else if (survivor.type === 'neutronstar') Object.assign(survivor, { texture: 'neutronstar', color: '#bde9ff' });
          else if (survivor.type === 'star') Object.assign(survivor, { texture: 'sun', color: '#ffd08f' });
          else if (survivor.type === 'planet') Object.assign(survivor, { texture: 'remnant', color: '#d97645' });
          if (!absorption) survivor.name = disrupted ? 'Disrupted white-dwarf ejecta' : `${survivor.type === 'planet' ? 'Merged world' : 'Merged ' + classLabel(survivor.type)} ${this.mergerCount}`;
          survivor.description = `${sourceNames.join(' + ')} combined. Total mass and linear momentum are conserved. The resulting ${classLabel(survivor.type)} has a physical radius estimated from its mass; this is a simplified collision model.`;
          const message = absorption ? `${survivor.name} absorbed ${absorbed.name}; mass is now ${totalMass.toPrecision(5)} M☉` : `${sourceNames.join(' + ')} → ${survivor.name}`;
          this._event({ type: absorption ? 'absorption' : 'merge', time: eventTime, bodyId: survivor.id, resultId: survivor.id, absorbedId: absorbed.id, absorbedIds: [absorbed.id], mergedFrom: sourceNames, mass: totalMass, previousType, resultType: survivor.type, position: { ...survivor.position }, radius: survivor.radius, message });
          if (previousType === 'neutronstar' && survivor.type === 'blackhole') this._event({ type: 'collapse', time: eventTime, bodyId: survivor.id, resultId: survivor.id, absorbedIds: [absorbed.id], mergedFrom: sourceNames, mass: totalMass, previousType, resultType: 'blackhole', position: { ...survivor.position }, radius: survivor.radius, message: `${survivor.name}: neutron-star mass exceeded the chosen ${NEUTRON_STAR_LIMIT} M☉ stability limit; collapsed into a black hole.` });
          this.bodies = this.bodies.filter((body) => body !== absorbed);
          // A newly merged body has no meaningful earlier position for another swept test.
          previousPositions?.delete(survivor.id);
          merged = true;
          break pairs;
        }
      }
    }
  }

  /** One explicit kick-drift-kick (velocity Verlet) step. */
  step(dt = this.fixedStep) {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Step duration must be nonnegative and finite.');
    if (dt === 0) return this;
    this._mergeCollisions();
    const before = new Map();
    let acc = this._accelerations();
    for (let i = 0; i < this.bodies.length; i += 1) {
      const body = this.bodies[i];
      before.set(body.id, { ...body.position });
      body.velocity.x += acc[i * 3] * dt * 0.5;
      body.velocity.y += acc[i * 3 + 1] * dt * 0.5;
      body.velocity.z += acc[i * 3 + 2] * dt * 0.5;
      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;
      body.position.z += body.velocity.z * dt;
    }
    this._mergeCollisions(before, this.time + dt);
    acc = this._accelerations();
    for (let i = 0; i < this.bodies.length; i += 1) {
      this.bodies[i].velocity.x += acc[i * 3] * dt * 0.5;
      this.bodies[i].velocity.y += acc[i * 3 + 1] * dt * 0.5;
      this.bodies[i].velocity.z += acc[i * 3 + 2] * dt * 0.5;
    }
    this.time += dt;
    return this;
  }

  _safeStep() {
    let safe = this.fixedStep;
    for (let i = 0; i < this.bodies.length; i += 1) {
      const a = this.bodies[i];
      for (let j = i + 1; j < this.bodies.length; j += 1) {
        const b = this.bodies[j];
        const r = Math.max(this._pairSoftening(a, b), Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z));
        const speed = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y, a.velocity.z - b.velocity.z);
        const fallTime = Math.sqrt(r ** 3 / (G * (a.mass + b.mass)));
        const crossingTime = speed > 0 ? r / speed : Infinity;
        safe = Math.min(safe, 0.035 * fallTime, 0.07 * crossingTime);
      }
    }
    // Power-of-two subdivisions keep results independent of display frame timing.
    const subdivisions = Math.max(0, Math.ceil(Math.log2(this.fixedStep / Math.max(safe, this.minStep))));
    return Math.max(this.minStep, this.fixedStep / 2 ** subdivisions);
  }

  /**
   * Consume simulated time using fixed steps, subdividing close encounters.
   * Work is capped: excess whole steps are dropped and reported, never queued
   * indefinitely. The renderer can keep responding when a scene is expensive.
   */
  advance(years, maxSteps = 640) {
    if (!Number.isFinite(years) || years < 0) throw new RangeError('Advance duration must be nonnegative and finite.');
    if (!Number.isFinite(maxSteps) || maxSteps < 0) throw new RangeError('Step budget must be nonnegative and finite.');
    const budget = Math.min(20000, Math.floor(maxSteps));
    this.pendingYears += years;
    let steps = 0;
    let advancedYears = 0;
    let stepSize = this._safeStep();
    while (steps < budget && this.pendingYears + stepSize * 1e-10 >= stepSize) {
      this.step(stepSize);
      this.pendingYears = Math.max(0, this.pendingYears - stepSize);
      advancedYears += stepSize;
      steps += 1;
      stepSize = this._safeStep();
    }
    let skippedYears = 0;
    if (this.pendingYears + stepSize * 1e-10 >= stepSize) {
      skippedYears = Math.floor((this.pendingYears + stepSize * 1e-10) / stepSize) * stepSize;
      this.pendingYears = Math.max(0, this.pendingYears - skippedYears);
      this.skippedYears += skippedYears;
    }
    this.lastAdvance = { steps, requestedYears: years, advancedYears, skippedYears, pendingYears: this.pendingYears, stepSize, limited: skippedYears > 0 };
    return this.lastAdvance;
  }

  _body(id) {
    const body = this.bodies.find((candidate) => candidate.id === id);
    if (!body) throw new Error(`Unknown body: ${id}`);
    return body;
  }

  /** Set a body's absolute world-space position in AU. */
  displace(id, position) {
    if (!finiteVector(position)) throw new TypeError('Position must contain finite x, y and z coordinates.');
    const body = this._body(id);
    Object.assign(body.position, position);
    this.pendingYears = 0;
    return body;
  }

  /** Add a velocity vector in AU/year. */
  impulse(id, deltaVelocity) {
    if (!finiteVector(deltaVelocity)) throw new TypeError('Velocity must contain finite x, y and z coordinates.');
    const body = this._body(id);
    for (const axis of ['x', 'y', 'z']) body.velocity[axis] += deltaVelocity[axis];
    this.pendingYears = 0;
    return body;
  }

  setMass(id, mass) {
    if (!Number.isFinite(mass) || mass <= 0) throw new RangeError('Mass must be positive and finite.');
    const body = this._body(id);
    const previousType = body.type;
    const nextType = classifyBody(mass, body.type);
    const radius = physicalRadius(mass, nextType);
    body.mass = mass;
    body.type = nextType;
    body.radius = body.visualRadius = radius;
    if (nextType === 'blackhole') Object.assign(body, blackHoleRadii(mass), { texture: 'blackhole', color: '#ffbd7a' });
    else if (nextType === 'star') Object.assign(body, { texture: 'sun', color: '#ffd08f' });
    else if (nextType === 'browndwarf') Object.assign(body, { texture: 'jupiter', color: '#b97561' });
    if (nextType !== previousType) {
      body.description = `Mass was changed externally. Simplified mass classification: ${classLabel(nextType)}. A neutron star forms only from an explicitly collapsed massive star.`;
      this._event({ type: previousType === 'neutronstar' ? 'collapse' : 'promotion', time: this.time, bodyId: body.id, resultId: body.id, absorbedIds: [], mass, previousType, resultType: nextType, position: { ...body.position }, radius, message: `${body.name} is now a ${classLabel(nextType)} (${mass.toPrecision(5)} M☉).${previousType === 'neutronstar' ? ' The chosen neutron-star stability limit was exceeded.' : ' Fusion thresholds are approximate.'}` });
    }
    this.pendingYears = 0;
    return body;
  }

  /** Set a two-body circular orbit relative to a selected primary, in its plane. */
  circularizeOrbit(id, primaryId, options = {}) {
    const body = this._body(id);
    const primary = this._body(primaryId);
    if (body === primary) throw new RangeError('A body cannot orbit itself.');
    const normal = vector(options.normal ?? { x: 0, y: -1, z: 0 });
    if (!finiteVector(normal) || magnitude(normal) <= 0) throw new TypeError('Orbit normal must be a finite nonzero vector.');
    const length = magnitude(normal);
    for (const axis of ['x', 'y', 'z']) normal[axis] /= length;
    const radial = { x: body.position.x - primary.position.x, y: body.position.y - primary.position.y, z: body.position.z - primary.position.z };
    const distance = magnitude(radial);
    const projection = radial.x * normal.x + radial.y * normal.y + radial.z * normal.z;
    for (const axis of ['x', 'y', 'z']) radial[axis] -= projection * normal[axis];
    if (magnitude(radial) < 1e-20) {
      const candidate = Math.abs(normal.x) < 0.8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
      const dot = candidate.x * normal.x + candidate.y * normal.y + candidate.z * normal.z;
      for (const axis of ['x', 'y', 'z']) radial[axis] = candidate[axis] - dot * normal[axis];
    }
    const radialLength = magnitude(radial);
    for (const axis of ['x', 'y', 'z']) radial[axis] /= radialLength;
    const minimum = primary.radius + body.radius;
    const radius = options.radius ?? Math.max(distance, minimum * 3);
    if (!Number.isFinite(radius) || radius <= minimum) throw new RangeError('An orbit must lie outside both physical surfaces.');
    const tangent = { x: normal.y * radial.z - normal.z * radial.y, y: normal.z * radial.x - normal.x * radial.z, z: normal.x * radial.y - normal.y * radial.x };
    const speed = Math.sqrt(G * (primary.mass + body.mass) / radius) * (options.retrograde ? -1 : 1);
    for (const axis of ['x', 'y', 'z']) {
      body.position[axis] = primary.position[axis] + radial[axis] * radius;
      body.velocity[axis] = primary.velocity[axis] + tangent[axis] * speed;
    }
    body.orbitPrimaryId = primary.id;
    this.pendingYears = 0;
    return body;
  }

  /**
   * An explicit, educational core-collapse event, rather than automatic aging.
   * Two opposite collisionless ejecta packets retain the ejected mass and
   * momentum. They still gravitate; hydrodynamics and radiation are omitted.
   */
  collapseStar(id) {
    const body = this._body(id);
    if (body.type !== 'star' || body.mass < 8) throw new RangeError('Core collapse requires a star of at least 8 solar masses.');
    const initialMass = body.mass;
    const initialRadius = body.radius;
    const initialName = body.name;
    const position = { ...body.position };
    const velocity = { ...body.velocity };
    const remnantType = initialMass < 20 ? 'neutronstar' : 'blackhole';
    const remnantMass = remnantType === 'neutronstar' ? 1.4 : Math.max(3, initialMass * 0.25);
    const ejectaMass = initialMass - remnantMass;
    const separation = initialRadius * 12;
    const ejectaSpeed = 1.5 * Math.sqrt(2 * G * initialMass / separation);
    const ejectaIds = [];
    for (const sign of [-1, 1]) {
      let ejectaId = `${body.id}-ejecta-${sign > 0 ? 'a' : 'b'}`;
      let suffix = 1;
      while (this.bodies.some((candidate) => candidate.id === ejectaId)) ejectaId = `${body.id}-ejecta-${sign > 0 ? 'a' : 'b'}-${suffix++}`;
      this.addBody({ id: ejectaId, name: `${initialName} ejecta ${sign > 0 ? 'A' : 'B'}`, type: 'ejecta', mass: ejectaMass / 2, radius: initialRadius * 0.02, position: { x: position.x + sign * separation, y: position.y, z: position.z }, velocity: { x: velocity.x + sign * ejectaSpeed, y: velocity.y, z: velocity.z }, color: '#f5a164', texture: 'ejecta', collisionless: true, sourceId: body.id, description: 'An idealized expanding ejecta packet. It retains ejected mass and momentum and continues to gravitate; this is not supernova hydrodynamics.' });
      ejectaIds.push(ejectaId);
    }
    body.mass = remnantMass;
    body.type = remnantType;
    body.radius = body.visualRadius = physicalRadius(remnantMass, remnantType);
    body.name = `${initialName} remnant`;
    body.progenitorMass = initialMass;
    body.evolutionStage = 'remnant';
    body.texture = remnantType;
    body.color = remnantType === 'blackhole' ? '#ffbd7a' : '#bde9ff';
    if (remnantType === 'blackhole') Object.assign(body, blackHoleRadii(remnantMass));
    body.description = `A ${remnantMass.toPrecision(3)} M☉ ${classLabel(remnantType)} formed by an explicitly triggered, simplified collapse of a ${initialMass.toPrecision(3)} M☉ star. Ejecta packets conserve the system’s mass and linear momentum. This is an educational outcome, not a prediction from stellar evolution.`;
    this._event({ type: 'collapse', time: this.time, bodyId: body.id, resultId: body.id, absorbedIds: [], ejectaIds, mass: remnantMass, progenitorMass: initialMass, ejectedMass: ejectaMass, previousType: 'star', resultType: remnantType, position, radius: body.radius, message: `${initialName} collapsed → ${body.name} (${remnantMass.toPrecision(3)} M☉ ${classLabel(remnantType)}); ${ejectaMass.toPrecision(3)} M☉ retained as ejecta.` });
    this.pendingYears = 0;
    return body;
  }

  /** Add a validated body; coordinates are cloned and an omitted ID is generated. */
  addBody(body) {
    const normalized = normalizeBody(body, this.bodies.length);
    if (body.id == null) {
      let suffix = this.bodies.length;
      while (this.bodies.some((existing) => existing.id === normalized.id)) normalized.id = `body-${++suffix}`;
    } else if (this.bodies.some((existing) => existing.id === normalized.id)) {
      throw new Error(`Body ID must be unique: ${normalized.id}`);
    }
    this.bodies.push(normalized);
    this.pendingYears = 0;
    return normalized;
  }

  /** Remove a body without changing the states of the remaining bodies. */
  removeBody(id) {
    const body = this._body(id);
    this.bodies = this.bodies.filter((candidate) => candidate !== body);
    this.pendingYears = 0;
    return body;
  }

  addBlackHole(mass = 4) {
    if (!Number.isFinite(mass) || mass <= 0) throw new RangeError('Mass must be positive and finite.');
    const existing = this.bodies.find((body) => body.type === 'blackhole');
    if (existing) return this.setMass(existing.id, mass);
    let id = 'black-hole';
    let suffix = 1;
    while (this.bodies.some((body) => body.id === id)) id = `black-hole-${suffix++}`;
    return this.addBody({ id, name: 'Black hole', type: 'blackhole', mass, color: '#ffb46c', texture: 'blackhole', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, description: 'Newtonian gravity with a physical Schwarzschild-radius absorbing boundary. The accretion disk is artistic; relativistic motion and light bending are not calculated.' });
  }

  diagnostics() {
    const momentum = { x: 0, y: 0, z: 0 };
    const centerOfMass = { x: 0, y: 0, z: 0 };
    const angularMomentum = { x: 0, y: 0, z: 0 };
    let totalMass = 0;
    let kineticEnergy = 0;
    let potentialEnergy = 0;
    for (let i = 0; i < this.bodies.length; i += 1) {
      const body = this.bodies[i];
      totalMass += body.mass;
      kineticEnergy += 0.5 * body.mass * magnitude(body.velocity) ** 2;
      for (const axis of ['x', 'y', 'z']) {
        momentum[axis] += body.mass * body.velocity[axis];
        centerOfMass[axis] += body.mass * body.position[axis];
      }
      addCross(angularMomentum, body.position, body.velocity, body.mass);
      for (let j = i + 1; j < this.bodies.length; j += 1) {
        const other = this.bodies[j];
        const epsilon = this._pairSoftening(body, other);
        const r = Math.sqrt((body.position.x - other.position.x) ** 2 + (body.position.y - other.position.y) ** 2 + (body.position.z - other.position.z) ** 2 + epsilon ** 2);
        potentialEnergy -= G * body.mass * other.mass / r;
      }
    }
    if (totalMass > 0) for (const axis of ['x', 'y', 'z']) centerOfMass[axis] /= totalMass;
    return { time: this.time, bodyCount: this.bodies.length, totalMass, energy: kineticEnergy + potentialEnergy, kineticEnergy, potentialEnergy, momentum, centerOfMass, angularMomentum, skippedYears: this.skippedYears };
  }
}
