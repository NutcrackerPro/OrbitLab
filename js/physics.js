/** Newtonian N-body dynamics. Units: AU, Julian years and solar masses. */
export const G = 4 * Math.PI * Math.PI;
export const DEFAULT_STEP = 1 / 2048;
export const DEFAULT_SOFTENING = 0.0001;
export const SCHWARZSCHILD_AU_PER_SOLAR_MASS = 1.974125743e-8;

const vector = (v = {}) => ({ x: v.x ?? 0, y: v.y ?? 0, z: v.z ?? 0 });
const finiteVector = (v) => v && ['x', 'y', 'z'].every((axis) => Number.isFinite(v[axis]));
const magnitude = (v) => Math.hypot(v.x, v.y, v.z);
const addCross = (out, a, b, mass) => {
  out.x += mass * (a.y * b.z - a.z * b.y);
  out.y += mass * (a.z * b.x - a.x * b.z);
  out.z += mass * (a.x * b.y - a.y * b.x);
};

/**
 * The absorbing boundary is enlarged for an explorable AU-scale simulation.
 * eventHorizonRadius is the actual Schwarzschild radius, for the inspector only.
 * No relativistic dynamics or light bending is calculated by this module.
 */
export function blackHoleRadii(mass) {
  const scale = Math.cbrt(mass);
  return {
    radius: 0.025 * scale,
    visualRadius: 0.15 * scale,
    eventHorizonRadius: SCHWARZSCHILD_AU_PER_SOLAR_MASS * mass,
  };
}

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
    type: body.type ?? 'planet',
    mass,
    radius: body.radius ?? 0.00004,
    visualRadius: body.visualRadius ?? 0.12,
    color: body.color ?? '#a5c9ff',
    position,
    velocity,
  };
  if (normalized.type === 'blackhole') Object.assign(normalized, blackHoleRadii(mass));
  if (![normalized.radius, normalized.visualRadius].every((r) => Number.isFinite(r) && r >= 0)) {
    throw new RangeError('Body radii must be nonnegative and finite.');
  }
  return normalized;
}

export class GravitySimulation {
  constructor(bodies = [], options = {}) {
    this.fixedStep = options.fixedStep ?? DEFAULT_STEP;
    this.softening = options.softening ?? DEFAULT_SOFTENING;
    this.minStep = options.minStep ?? this.fixedStep / 4096;
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
    this.pendingYears = 0;
    this.skippedYears = 0;
    this.lastAdvance = { steps: 0, requestedYears: 0, advancedYears: 0, skippedYears: 0, pendingYears: 0, stepSize: this.fixedStep, limited: false };
    return this;
  }

  _accelerations() {
    const acc = new Float64Array(this.bodies.length * 3);
    const eps2 = this.softening * this.softening;
    for (let i = 0; i < this.bodies.length; i += 1) {
      const a = this.bodies[i];
      for (let j = i + 1; j < this.bodies.length; j += 1) {
        const b = this.bodies[j];
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const dz = b.position.z - a.position.z;
        const r2 = dx * dx + dy * dy + dz * dz + eps2;
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
          const rank = (body) => body.type === 'blackhole' ? 2 : body.type === 'star' ? 1 : 0;
          const survivor = rank(a) > rank(b) || (rank(a) === rank(b) && a.mass >= b.mass) ? a : b;
          const absorbed = survivor === a ? b : a;
          const totalMass = a.mass + b.mass;
          for (const axis of ['x', 'y', 'z']) {
            survivor.position[axis] = (a.position[axis] * a.mass + b.position[axis] * b.mass) / totalMass;
            survivor.velocity[axis] = (a.velocity[axis] * a.mass + b.velocity[axis] * b.mass) / totalMass;
          }
          if (survivor.type === 'blackhole') {
            Object.assign(survivor, blackHoleRadii(totalMass));
          } else {
            survivor.radius = Math.cbrt(a.radius ** 3 + b.radius ** 3);
            survivor.visualRadius = Math.cbrt(a.visualRadius ** 3 + b.visualRadius ** 3);
          }
          survivor.mass = totalMass;
          const absorption = survivor.type === 'blackhole';
          const message = absorption ? `${survivor.name} absorbed ${absorbed.name}` : `${a.name} and ${b.name} merged`;
          this.events.push({ type: absorption ? 'absorption' : 'merge', time: eventTime, bodyId: survivor.id, absorbedId: absorbed.id, mass: totalMass, message });
          if (this.events.length > 32) this.events.shift();
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
        const r = Math.max(this.softening, Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z));
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
    const ratio = Math.cbrt(mass / body.mass);
    if (body.type === 'blackhole') Object.assign(body, blackHoleRadii(mass));
    else { body.radius *= ratio; body.visualRadius *= ratio; }
    body.mass = mass;
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
    return this.addBody({ id, name: 'Black hole', type: 'blackhole', mass, color: '#ffb46c', texture: 'blackhole', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, description: 'Newtonian gravity with an enlarged absorbing boundary. The accretion disk is an artistic visualization.' });
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
        const r = Math.sqrt((body.position.x - other.position.x) ** 2 + (body.position.y - other.position.y) ** 2 + (body.position.z - other.position.z) ** 2 + this.softening ** 2);
        potentialEnergy -= G * body.mass * other.mass / r;
      }
    }
    if (totalMass > 0) for (const axis of ['x', 'y', 'z']) centerOfMass[axis] /= totalMass;
    return { time: this.time, bodyCount: this.bodies.length, totalMass, energy: kineticEnergy + potentialEnergy, kineticEnergy, potentialEnergy, momentum, centerOfMass, angularMomentum, skippedYears: this.skippedYears };
  }
}
