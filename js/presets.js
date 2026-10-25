import { G, blackHoleRadii } from './physics.js?v=2.0.0';
import { BODY_CATALOG, createBodyTemplate, physicalRadius, AU_KM } from './bodies.js?v=2.0.0';
import { DEFAULT_GALAXY, LY_AU } from './galaxy.js?v=2.0.0';

const radians = (degrees) => degrees * Math.PI / 180;
const zero = () => ({ x: 0, y: 0, z: 0 });
const axes = ['x','y','z'];

/** Put both positions and velocities in the system's center-of-mass frame. */
export function barycentric(bodies) {
  const totalMass=bodies.reduce((sum,body)=>sum+body.mass,0);
  if(!totalMass)return bodies;
  const position=zero(),velocity=zero();
  for(const body of bodies)for(const axis of axes){
    position[axis]+=body.mass*body.position[axis]/totalMass;
    velocity[axis]+=body.mass*body.velocity[axis]/totalMass;
  }
  for(const body of bodies)for(const axis of axes){body.position[axis]-=position[axis];body.velocity[axis]-=velocity[axis];}
  return bodies;
}

function star(id,name,mass,position,velocity,color='#ffbd68') {
  return createBodyTemplate('sun',{id,name,mass,radius:physicalRadius(mass,'star'),position,velocity,color,
    description:'A main-sequence star with a physical mass and approximate mass-radius relation. The surface keeps its physical AU radius; distant markers identify unresolved stars.'});
}
function world(id,name,kind,position,velocity,overrides={}) {
  return createBodyTemplate(kind,{id,name,position,velocity,...overrides});
}
/** Keplerian orbital elements at J2000, used as an illustrative initial state. */
export function keplerState(a, eccentricity, inclination, node, periapsis, meanAnomaly, centralMass = 1) {
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
  const sun=world('sun','Sun','sun',zero(),zero());
  sun.description='Our Sun and eight planets, the Moon, Pluto, four large asteroids and two representative comets. Surfaces, separations and collision radii use physical AU.';
  const elements=[
    // id, a(AU), e, i, ascending node, argument of perihelion, mean anomaly (degrees).
    ['mercury',.38709927,.20563593,7.00497902,48.33076593,29.12703035,174.79252722],
    ['venus',.72333566,.00677672,3.39467605,76.67984255,54.92262463,50.37663232],
    ['earth',1.00000261,.01671123,-.00001531,0,102.93768193,357.52688973],
    ['mars',1.52371034,.09339410,1.84969142,49.55953891,286.49683150,19.39019754],
    ['jupiter',5.20288700,.04838624,1.30439695,100.47390909,274.25457074,19.66796068],
    ['saturn',9.53667594,.05386179,2.48599187,113.66242448,338.93645383,317.35536592],
    ['uranus',19.18916464,.04725744,.77263783,74.01692503,96.93735127,142.28382821],
    ['neptune',30.06992276,.00859048,1.77004347,131.78422574,273.18053653,259.91520804],
  ];
  const planets=elements.map(([id,a,e,i,node,periapsis,mean])=>{
    const template=BODY_CATALOG[id],state=keplerState(a,e,i,node,periapsis,mean,1+template.mass);
    return world(id,template.name,id,state.position,state.velocity,{semiMajorAxis:a,orbitalPeriod:Math.sqrt(a**3/(1+template.mass)),
      description:template.name+' begins from approximate J2000 orbital elements, then responds to all other bodies. The surface radius and mass are physical; the initial state is illustrative, not a live ephemeris.'});
  });
  // Earth-Moon barycenter retains the heliocentric state while both components
  // receive their correct relative positions and velocities.
  const earth=planets.find(body=>body.id==='earth'),moonMass=BODY_CATALOG.moon.mass;
  const moonA=384400/AU_KM,moonState=keplerState(moonA,.0549,5.145,125.08,318.15,135.27,earth.mass+moonMass);
  const barycenter={position:{...earth.position},velocity:{...earth.velocity}},total=earth.mass+moonMass;
  const moon=world('moon','Moon','moon',zero(),zero(),{hostId:'earth',semiMajorAxis:moonA,orbitalPeriod:Math.sqrt(moonA**3/total),
    description:'Earth’s Moon: a physical 1,737.4-km radius and roughly 384,400-km orbital semimajor axis. Its approximate orbit is integrated with every gravitating body.'});
  for(const axis of axes){
    earth.position[axis]=barycenter.position[axis]-moonState.position[axis]*moonMass/total;
    earth.velocity[axis]=barycenter.velocity[axis]-moonState.velocity[axis]*moonMass/total;
    moon.position[axis]=barycenter.position[axis]+moonState.position[axis]*earth.mass/total;
    moon.velocity[axis]=barycenter.velocity[axis]+moonState.velocity[axis]*earth.mass/total;
  }
  const minorElements=[
    // Approximate orbit shapes and sizes, with illustrative mean anomalies.
    ['pluto','Pluto','earth',6.55e-9,1188.3,39.482,.2488,17.16,110.30,113.83,14.53,'planet','dwarf planet'],
    ['ceres','Ceres','asteroid',4.72e-10,469.7,2.7675,.0758,10.594,80.305,73.597,95.99,'asteroid','dwarf planet'],
    ['vesta','Vesta','asteroid',1.302e-10,262.7,2.361,.0887,7.14,103.85,151.20,190,'asteroid','asteroid'],
    ['pallas','Pallas','asteroid',1.025e-10,256,2.773,.230,34.84,173.09,310.17,45,'asteroid','asteroid'],
    ['hygiea','Hygiea','asteroid',4.3e-11,217,3.142,.112,3.83,283.20,312.32,300,'asteroid','asteroid'],
    ['halley','1P / Halley','comet',1.106e-16,5.5,17.834,.96714,162.26,58.42,111.33,37,'comet','comet'],
    ['67p','67P / Churyumov–Gerasimenko','comet',5.02e-18,1.65,3.463,.64,7.04,50.18,12.78,240,'comet','comet'],
  ];
  const minorBodies=minorElements.map(([id,name,kind,mass,radiusKm,a,e,i,node,periapsis,mean,type,classification])=>{
    const state=keplerState(a,e,i,node,periapsis,mean,1+mass);
    return world(id,name,kind,state.position,state.velocity,{mass,radius:radiusKm/AU_KM,type,classification,texture:'rocky',semiMajorAxis:a,
      orbitalPeriod:Math.sqrt(a**3/(1+mass)),description:name+' is an individually integrated '+classification+'. Mass, radius and orbit shape are approximate physical values; orbital phase is illustrative, not a current ephemeris.'});
  });
  return barycentric([sun,...planets,moon,...minorBodies]);
}

export const STABLE_TRIPLE = Object.freeze({innerSeparationAU:2,outerSeparationAU:40,innerMass:1.8,tertiaryMass:.5,
  innerPeriodYears:Math.sqrt(2**3/1.8),outerPeriodYears:Math.sqrt(40**3/2.3),planetRadiusAU:7});

function stableThreeBody() {
  const {innerSeparationAU:inner,outerSeparationAU:outer,innerMass,tertiaryMass}=STABLE_TRIPLE;
  const massA=1,massB=.8,total=innerMass+tertiaryMass;
  const innerOmega=Math.sqrt(G*innerMass/inner**3),outerOmega=Math.sqrt(G*total/outer**3);
  const centerX=-outer*tertiaryMass/total,thirdX=outer*innerMass/total;
  const aX=-inner*massB/innerMass,bX=inner*massA/innerMass;
  const a=star('alpha','Alpha · 恒星 A',massA,{x:centerX+aX,y:0,z:0},{x:0,y:0,z:centerX*outerOmega+aX*innerOmega},'#ffd292');
  const b=star('beta','Beta · 恒星 B',massB,{x:centerX+bX,y:0,z:0},{x:0,y:0,z:centerX*outerOmega+bX*innerOmega},'#ffbd86');
  const c=star('gamma','Gamma · 恒星 C',tertiaryMass,{x:thirdX,y:0,z:0},{x:0,y:0,z:thirdX*outerOmega},'#ff9870');
  const planetRadius=STABLE_TRIPLE.planetRadiusAU;
  const planet=world('trisolaris','Trisolaris · 三体','earth',{x:centerX,y:0,z:planetRadius},
    {x:-Math.sqrt(G*(innerMass+BODY_CATALOG.earth.mass)/planetRadius),y:0,z:centerX*outerOmega},{hostId:'inner-binary',
      semiMajorAxis:planetRadius,description:'A fictional circumbinary world in a stable hierarchical triple inspired by 三体. A 2-AU inner pair and a 40-AU third star begin near circular, coplanar orbits. This is a designed system, not Alpha Centauri or the novel’s exact system.'});
  return barycentric([a,b,c,planet]);
}

function chaoticThreeBody() {
  const a=star('chaos-a','Alpha · 乱纪元',1.15,{x:-2.4,y:0,z:-1.4},{x:.25,y:.08,z:-2.6},'#ffca7d');
  const b=star('chaos-b','Beta · 乱纪元',.85,{x:2.2,y:.08,z:-.7},{x:.4,y:-.12,z:2.15},'#a9d6ff');
  const c=star('chaos-c','Gamma · 乱纪元',.65,{x:.5,y:-.05,z:2.6},{x:-1.1,y:.03,z:.85},'#ff8768');
  for(const body of [a,b,c])body.description='A deliberately nonhierarchical fictional triple. Close encounters, ejections and physical collisions are allowed. Chaos is sensitive to these illustrative starting conditions; three stars are not guaranteed to remain bound.';
  return barycentric([a,b,c]);
}

function figureEight() {
  const length=2.8,speed=Math.sqrt(G/length);
  return [[-.97000436,.24308753,.466203685,.43236573],[.97000436,-.24308753,.466203685,.43236573],[0,0,-.93240737,-.86473146]].map(([x,z,vx,vz],i)=>{
    const body=star(['eight-a','eight-b','eight-c'][i],['Aster','Lyra','Cygnus'][i],1,{x:x*length,y:0,z:z*length},{x:vx*speed,y:0,z:vz*speed},['#ffbd72','#8cd7ff','#ff8f9e'][i]);
    body.description='Three equal-mass stars follow the ideal figure-eight choreography. Physical surfaces are small compared with their separation. Perturb an orbit to break its symmetry.';
    body.choreographyPeriod=6.32591398*Math.sqrt(length**3/G);return body;
  });
}

function blackHole() {
  const mass=12,hole=world('black-hole','Eventide','blackhole',zero(),zero(),{mass,...blackHoleRadii(mass),
    description:'A 12-solar-mass black hole with its physical Schwarzschild radius. Gravity is Newtonian; the disk is an illustrative luminous structure, not a ray-traced relativity solution.'});
  const orbiters=[[1.25,.45,'ember','Ember','mars'],[2.3,2.3,'vesper','Vesper','jupiter'],[3.8,4.5,'rift','Rift','neptune']].map(([r,angle,id,name,kind])=>{
    const speed=Math.sqrt(G*(mass+BODY_CATALOG[kind].mass)/r);
    return world(id,name,kind,{x:r*Math.cos(angle),y:0,z:r*Math.sin(angle)},{x:-speed*Math.sin(angle),y:0,z:speed*Math.cos(angle)},{hostId:'black-hole'});
  });
  const r=6.8,companion=star('companion','Companion star',.7,{x:-r,y:.2,z:0},{x:0,y:0,z:-Math.sqrt(G*(mass+.7)/r)},'#ffc19a');
  return barycentric([hole,...orbiters,companion]);
}

function binarySystem() {
  const massA=1.35,massB=.65,separation=2.4,omega=Math.sqrt(G*(massA+massB)/separation**3);
  const xA=-separation*massB/(massA+massB),xB=separation*massA/(massA+massB);
  const primary=star('binary-a','Helios A',massA,{x:xA,y:0,z:0},{x:0,y:0,z:xA*omega},'#ffd18a');
  const secondary=star('binary-b','Helios B',massB,{x:xB,y:0,z:0},{x:0,y:0,z:xB*omega},'#ffaf80');
  const outerRadius=8,outer=world('circumbinary','Tandem','earth',{x:0,y:0,z:outerRadius},{x:-Math.sqrt(G*(massA+massB)/outerRadius),y:0,z:0},{hostId:'binary-pair',description:'A circumbinary planet orbiting two stars. Its 8-AU initial orbit lies outside the close pair; all bodies use physical radii.'});
  const r=.24,inner=world('binary-inner','Cinder','mars',{x:xA+r,y:0,z:0},{x:0,y:0,z:primary.velocity.z+Math.sqrt(G*massA/r)},{hostId:'binary-a'});
  return barycentric([primary,secondary,outer,inner]);
}

function earthMoon() {
  const separation=384400/AU_KM,massEarth=BODY_CATALOG.earth.mass,massMoon=BODY_CATALOG.moon.mass,total=massEarth+massMoon;
  const omega=Math.sqrt(G*total/separation**3),xEarth=-separation*massMoon/total,xMoon=separation*massEarth/total;
  const earth=world('earth','Earth','earth',{x:xEarth,y:0,z:0},{x:0,y:0,z:xEarth*omega},{
    description:'A clean Earth–Moon two-body demonstration, with actual masses, radii and a 384,400-km separation. Both bodies orbit their shared center of mass. The Sun and other planets are omitted deliberately.'});
  const moon=world('moon','Moon','moon',{x:xMoon,y:0,z:0},{x:0,y:0,z:xMoon*omega},{hostId:'earth',semiMajorAxis:separation,orbitalPeriod:Math.sqrt(separation**3/total),
    description:'A physical Moon in an initially circular 384,400-km Earth-relative orbit. Change a mass or separation to see the orbit respond; no hidden force pins the Moon in place.'});
  return [earth,moon];
}

function collisionLab() {
  const radius=BODY_CATALOG.earth.radius;
  const left=world('gaia-one','Gaia One','earth',{x:-3*radius,y:0,z:0},zero(),{
    description:'One of two Earth-mass worlds released from rest, six Earth radii apart. Their real gravitational attraction brings the physical surfaces into contact. The merged remnant conserves total mass and momentum.'});
  const right=world('gaia-two','Gaia Two','earth',{x:3*radius,y:0,z:0},zero(),{
    description:'This Earth-sized world falls toward its twin. A visible merger effect marks actual surface contact; no scripted collision forces the outcome. The final size follows the approximate rocky mass-radius relation.'});
  return [left,right];
}

function milkyWay() {
  return [world('sgr-a','Sagittarius A*','blackhole',zero(),zero(),{mass:DEFAULT_GALAXY.blackHoleMass,
    description:'The roughly 4.3-million-solar-mass central black hole. The surrounding 16,000 points are a representative Milky Way model in a smooth approximate potential, not every real star or planet. Explore the Solar System to enter its local N-body model.'})];
}

const camera=distanceAU=>({distance:distanceAU,distanceAU,target:{x:0,y:0,z:0}});
export const PRESETS=[
  {id:'solar',name:'Solar System',kicker:'PHYSICAL WORLDS. ACTUAL DISTANCES.',description:'Eight planets, the Moon, dwarf planets, asteroids and comets share a physical gravitational model.',scale:45,camera:camera(100),selectedId:'earth',physicalScale:true,create:solarSystem},
  {id:'three-body',name:'Three-Body · 三体',kicker:'A STABLE HIERARCHICAL TRIPLE',description:'Two close suns and a distant third star. This designed, stable hierarchy keeps all three stars bound until you disturb it.',scale:45,camera:camera(115),selectedId:'trisolaris',physicalScale:true,hierarchy:STABLE_TRIPLE,create:stableThreeBody},
  {id:'figure-eight',name:'Figure Eight',kicker:'ORDER INSIDE THE CHAOS',description:'Three equal stars follow one remarkable figure-eight choreography. A perturbation breaks the pattern.',scale:5,camera:camera(10),selectedId:'eight-a',physicalScale:true,create:figureEight},
  {id:'black-hole',name:'Black Hole',kicker:'A PHYSICAL EVENT HORIZON',description:'Explore a stellar black hole at its physical radius. The luminous disk is illustrative; the gravitational calculation remains Newtonian.',scale:9,camera:camera(18),selectedId:'black-hole',physicalScale:true,create:blackHole},
  {id:'binary',name:'Binary Stars',kicker:'TWO SUNS. ONE SKY.',description:'A planet encircles two stars, while a smaller world orbits the primary. Surface sizes and distances share the same AU scale.',scale:10,camera:camera(22),selectedId:'circumbinary',physicalScale:true,create:binarySystem},
  {id:'chaotic-three',name:'Chaotic Three-Body',kicker:'CLOSE ENCOUNTERS. REAL CONSEQUENCES.',description:'An intentionally unstable fictional triple. Ejections and physical collisions are possible; this is the chaos experiment.',scale:8,camera:camera(16),selectedId:'chaos-a',physicalScale:true,create:chaoticThreeBody},
  {id:'earth-moon',name:'Earth & Moon',kicker:'GRAVITY CLOSE TO HOME',description:'Two physical worlds orbit a shared center of mass, with a true 384,400-km separation and a clean circular starting orbit.',scale:.003,camera:camera(.008),selectedId:'earth',physicalScale:true,daysPerSecond:1,create:earthMoon},
  {id:'collision-lab',name:'Collision Lab',kicker:'TWO WORLDS. ONE REMNANT.',description:'Two Earth-mass worlds start at rest, six Earth radii apart. Watch their mutual gravity produce a physical contact and a conserved-mass remnant.',scale:.0004,camera:camera(.001),selectedId:'gaia-one',physicalScale:true,daysPerSecond:.005,create:collisionLab},
  {id:'milky-way',name:'Milky Way',kicker:'A GALAXY IN PHYSICAL SCALE',description:'A 100,000-light-year disk with 16,000 representative stars, a smooth illustrative potential and the Solar neighborhood marked at 26,000 light-years.',mode:'galaxy',renderUnitAU:LY_AU,scale:DEFAULT_GALAXY.radiusAU,camera:camera(150000*LY_AU),selectedId:'sgr-a',physicalScale:true,galaxy:DEFAULT_GALAXY,create:milkyWay},
];
