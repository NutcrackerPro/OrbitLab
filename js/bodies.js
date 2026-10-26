/** Physical catalog: masses in M☉; all radii and positions in AU. */
export const AU_KM = 149597870.7;
export const EARTH_MASS = 3.0034896e-6;
export const JUPITER_MASS = 0.0009547919;
export const SOLAR_RADIUS = 695700 / AU_KM;
export const EARTH_RADIUS = 6371 / AU_KM;
export const JUPITER_RADIUS = 69911 / AU_KM;
export const SCHWARZSCHILD_AU_PER_SOLAR_MASS = 1.974125743e-8;
export const BROWN_DWARF_MASS = 13 * JUPITER_MASS;
export const HYDROGEN_BURNING_MASS = 80 * JUPITER_MASS;
// A chosen educational limit, not a precisely known universal TOV limit.
export const NEUTRON_STAR_LIMIT = 2.2;
export const WHITE_DWARF_LIMIT = 1.4;

function positiveMass(mass) {
  if (!Number.isFinite(mass) || mass <= 0) throw new RangeError('Mass must be positive and finite.');
  return mass;
}

/** Mass thresholds approximate fusion categories, not a model of stellar aging. */
export function classifyBody(mass, priorType = 'planet') {
  positiveMass(mass);
  if (priorType === 'blackhole' || priorType === 'ejecta') return priorType;
  if (priorType === 'neutronstar') return mass > NEUTRON_STAR_LIMIT ? 'blackhole' : 'neutronstar';
  if (priorType === 'whitedwarf') return 'whitedwarf';
  if (mass >= HYDROGEN_BURNING_MASS) return 'star';
  if (mass >= BROWN_DWARF_MASS) return 'browndwarf';
  if (['moon', 'comet', 'asteroid'].includes(priorType)) return priorType;
  return 'planet';
}

export function blackHoleRadii(mass) {
  positiveMass(mass);
  const radius = SCHWARZSCHILD_AU_PER_SOLAR_MASS * mass;
  return { radius, eventHorizonRadius: radius, visualRadius: radius };
}

/**
 * Approximate equilibrium sizes, rather than a constant-density enlargement.
 * Rocky worlds compress; ice giants gain envelopes; gas/brown-dwarf radii
 * flatten near Jupiter's size. Stellar exponents are illustrative main-sequence
 * scalings. Composition, temperature, age and relativistic structure are omitted.
 */
export function physicalRadius(mass, type = 'planet') {
  positiveMass(mass);
  if (type === 'blackhole') return blackHoleRadii(mass).radius;
  if (type === 'neutronstar') return (12 / AU_KM) * (1.4 / mass) ** 0.12;
  if (type === 'whitedwarf') {
    if (mass > WHITE_DWARF_LIMIT) throw new RangeError('A stable white dwarf must be at or below 1.4 solar masses.');
    const ratio = mass / WHITE_DWARF_LIMIT;
    return Math.max(500 / AU_KM, 0.0112 * SOLAR_RADIUS * Math.sqrt(Math.max(0.001, ratio ** (-2 / 3) - ratio ** (2 / 3))));
  }
  if (type === 'star') return SOLAR_RADIUS * (mass <= 1 ? mass ** 0.8 : mass ** 0.57);
  if (type === 'browndwarf') return JUPITER_RADIUS * Math.max(0.8, (mass / BROWN_DWARF_MASS) ** -0.08);
  const earthMasses = mass / EARTH_MASS;
  if (earthMasses <= 2) return EARTH_RADIUS * earthMasses ** (type === 'comet' ? 1 / 3 : 0.28);
  if (earthMasses <= 20) return EARTH_RADIUS * 2 ** 0.28 * (earthMasses / 2) ** 0.5;
  const radius = EARTH_RADIUS * 2 ** 0.28 * 10 ** 0.5 * (earthMasses / 20) ** 0.45;
  return Math.min(radius, JUPITER_RADIUS * (mass / JUPITER_MASS) ** -0.04);
}

const zero = () => ({ x: 0, y: 0, z: 0 });
const entry = (name, type, mass, radiusKm, texture, color, description) => Object.freeze({ name, type, mass, radius: radiusKm / AU_KM, visualRadius: radiusKm / AU_KM, texture, color, description });
const catalog = {
  earth: entry('Earth', 'planet', EARTH_MASS, 6371, 'earth', '#72b8ec', 'An Earth-mass rocky world. Physical radius: 6,371 km.'),
  mars: entry('Mars', 'planet', 3.22715e-7, 3389.5, 'mars', '#d97850', 'A Mars-mass rocky world.'),
  mercury: entry('Mercury', 'planet', 1.66012e-7, 2439.7, 'mercury', '#b6a397', 'A small rocky planet.'),
  venus: entry('Venus', 'planet', 2.44784e-6, 6051.8, 'venus', '#e0b979', 'A Venus-mass terrestrial planet.'),
  jupiter: entry('Jupiter', 'planet', JUPITER_MASS, 69911, 'jupiter', '#d8b18d', 'A Jupiter-mass gas giant.'),
  saturn: entry('Saturn', 'planet', 0.000285886, 58232, 'saturn', '#dfcd9a', 'A Saturn-mass gas giant.'),
  uranus: entry('Uranus', 'planet', 0.0000436624, 25362, 'uranus', '#a2e0e3', 'An ice giant with Uranus’s mass and radius.'),
  neptune: entry('Neptune', 'planet', 0.0000515139, 24622, 'neptune', '#547fe1', 'A Neptune-mass ice giant.'),
  moon: entry('Moon', 'moon', 3.694303e-8, 1737.4, 'moon', '#c6c6c8', 'An Earth-Moon-sized satellite; place it around a selected planet.'),
  comet: entry('Comet', 'comet', 5e-17, 3, 'comet', '#b5e3e3', 'A small, low-density icy body. Its tail is a visual effect.'),
  asteroid: entry('Asteroid', 'asteroid', 1e-12, 50, 'rocky', '#a99887', 'A small gravitating rocky body.'),
  sun: entry('Sun', 'star', 1, 695700, 'sun', '#ffd590', 'A one-solar-mass main-sequence star.'),
  star: entry('Massive star', 'star', 12, physicalRadius(12, 'star') * AU_KM, 'sun', '#b9daff', 'A 12-solar-mass star. Trigger the simplified core-collapse demonstration to form a remnant.'),
  browndwarf: entry('Brown dwarf', 'browndwarf', 30 * JUPITER_MASS, physicalRadius(30 * JUPITER_MASS, 'browndwarf') * AU_KM, 'jupiter', '#b97561', 'A substellar object: above the approximate deuterium threshold, below sustained hydrogen burning.'),
  neutronstar: entry('Neutron star', 'neutronstar', 1.4, 12, 'neutronstar', '#bde9ff', 'A 1.4-solar-mass, 12-km-radius stellar remnant. It must form from a massive star, not by enlarging a planet.'),
  whitedwarf: entry('White dwarf', 'whitedwarf', 0.6, physicalRadius(0.6, 'whitedwarf') * AU_KM, 'whitedwarf', '#dcefff', 'A compact stellar remnant; this simplified model limits stable white dwarfs to 1.4 solar masses.'),
  blackhole: Object.freeze({ name: 'Black hole', type: 'blackhole', mass: 5, ...blackHoleRadii(5), texture: 'blackhole', color: '#ffbd7a', description: 'A five-solar-mass black hole with a physical Schwarzschild boundary. Gravity remains Newtonian.' }),
};
catalog.rocky = catalog.mars;
catalog.ocean = catalog.earth;
catalog.gas = catalog.jupiter;
catalog['neutron-star'] = catalog.neutronstar;
catalog['black-hole'] = catalog.blackhole;
catalog['brown-dwarf'] = catalog.browndwarf;
catalog['white-dwarf'] = catalog.whitedwarf;
export const BODY_CATALOG = Object.freeze(catalog);

export function createBodyTemplate(kind, overrides = {}) {
  const template = BODY_CATALOG[kind];
  if (!template) throw new Error(`Unknown body template: ${kind}`);
  const result = { ...template, ...overrides, position: { ...zero(), ...overrides.position }, velocity: { ...zero(), ...overrides.velocity } };
  positiveMass(result.mass);
  if (overrides.mass != null && overrides.radius == null) result.radius = physicalRadius(result.mass, classifyBody(result.mass, result.type));
  result.visualRadius = result.radius;
  if (result.type === 'blackhole') Object.assign(result, blackHoleRadii(result.mass));
  return result;
}
