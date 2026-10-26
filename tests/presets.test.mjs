import test from 'node:test';
import assert from 'node:assert/strict';
import {PRESETS,STABLE_TRIPLE} from '../js/presets.js';
import {GravitySimulation} from '../js/physics.js';
import {AU_KM} from '../js/bodies.js';
import {DEFAULT_GALAXY,LY_AU,createGalaxyStars,galaxyAcceleration,galaxyCircularVelocityAUPerYear} from '../js/galaxy.js';

const preset=id=>PRESETS.find(value=>value.id===id);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const center=(a,b)=>Object.fromEntries(['x','y','z'].map(axis=>[axis,(a.position[axis]*a.mass+b.position[axis]*b.mass)/(a.mass+b.mass)]));

test('all presets expose actual positive surface radii and isolated initial states',()=>{
  assert.equal(new Set(PRESETS.map(p=>p.id)).size,PRESETS.length);
  for(const p of PRESETS){
    const first=p.create(),second=p.create();
    assert.ok(first.length>0,p.id);
    for(let i=0;i<first.length;i++){
      const body=first[i];assert.ok(body.radius>0&&Number.isFinite(body.radius),body.id);
      assert.equal(body.visualRadius,body.radius,'legacy render radius must also be physical');
      assert.ok(Object.values(body.position).every(Number.isFinite));
      assert.ok(Object.values(body.velocity).every(Number.isFinite));
      assert.notEqual(body.position,second[i].position);
    }
  }
});

test('designed hierarchical triple keeps three bound stars and its planet for 100 outer periods',()=>{
  const simulation=new GravitySimulation(preset('three-body').create());
  const initialEnergy=simulation.diagnostics().energy;
  const duration=100*STABLE_TRIPLE.outerPeriodYears;
  const steps=Math.ceil(duration/(STABLE_TRIPLE.innerPeriodYears/128));
  const dt=duration/steps;
  for(let i=0;i<steps;i++){
    simulation.step(dt);
    if(i%512===0){
      assert.equal(simulation.bodies.length,4,'no star or planet may collide or escape the model');
      const [a,b,c,planet]=simulation.bodies;
      const pairCenter=center(a,b),inner=distance(a.position,b.position),outer=distance(c.position,pairCenter),world=distance(planet.position,pairCenter);
      assert.ok(inner>1.8&&inner<2.2,'inner binary remains bound near 2 AU');
      assert.ok(outer>35&&outer<45,'tertiary remains bound near 40 AU');
      assert.ok(world>5&&world<9,'circumbinary world remains near 7 AU');
    }
  }
  assert.equal(simulation.bodies.filter(body=>body.type==='star').length,3);
  assert.equal(simulation.events.length,0);
  assert.ok(Math.abs((simulation.diagnostics().energy-initialEnergy)/initialEnergy)<5e-5);
});

test('physical Moon remains in an Earth-bound orbit after one lunar period',()=>{
  const simulation=new GravitySimulation(preset('solar').create());
  const earth=simulation.bodies.find(body=>body.id==='earth'),moon=simulation.bodies.find(body=>body.id==='moon');
  assert.equal(moon.type,'moon');
  assert.ok(Math.abs(moon.radius*AU_KM-1737.4)<1e-9);
  assert.ok(Math.abs(moon.semiMajorAxis*AU_KM-384400)<1e-8);
  const period=moon.orbitalPeriod,report=simulation.advance(period,20000);
  assert.equal(report.skippedYears,0);
  const separation=distance(earth.position,moon.position);
  assert.ok(separation>.0023&&separation<.0029,'Moon should remain close to its physical orbit');
  assert.equal(simulation.bodies.length,preset('solar').create().length);
  assert.ok(simulation.bodies.some(body=>body.type==='asteroid'));
  assert.ok(simulation.bodies.filter(body=>body.type==='comet').length>=2);
});

test('Milky Way uses real AU ratios and explicitly representative deterministic points',()=>{
  const p=preset('milky-way'),g=p.galaxy;
  assert.equal(p.mode,'galaxy');assert.equal(p.renderUnitAU,LY_AU);
  assert.equal(g.radiusAU/LY_AU,50000);assert.equal(g.solarRadiusAU/LY_AU,26000);
  assert.equal(g.representative,true);
  const central=p.create();assert.equal(central.length,1);assert.equal(central[0].mass,4.3e6);
  const a=createGalaxyStars(g),b=createGalaxyStars(g);
  assert.equal(a.count,16000);assert.deepEqual(a.positionsAU,b.positionsAU);
  assert.equal(a.positionsAU.length,a.count*3);
  assert.ok(a.positionsAU.every(Number.isFinite));assert.ok(a.angularVelocities.every(value=>Number.isFinite(value)&&value>=0));
  for(let i=0;i<a.count;i++)assert.ok(Math.hypot(...a.positionsAU.subarray(i*3,i*3+3))<=g.radiusAU*1.01);
});

test('illustrative galactic potential is finite, symmetric and gives a plausible local circular speed',()=>{
  const origin=galaxyAcceleration({x:0,y:0,z:0});assert.ok(Object.values(origin).every(value=>Number.isFinite(value)&&value===0));
  const radius=DEFAULT_GALAXY.solarRadiusAU;
  const a=galaxyAcceleration({x:radius,y:0,z:0}),opposite=galaxyAcceleration({x:-radius,y:0,z:0});
  assert.ok(a.x<0);assert.equal(a.x,-opposite.x);
  const speed=galaxyCircularVelocityAUPerYear(radius)*4.74047046;
  assert.ok(speed>200&&speed<270,'illustrative rotation curve should be in the Milky Way range');
});

test('Earth–Moon close-up completes a stable physical circular orbit',()=>{
  const p=preset('earth-moon'),simulation=new GravitySimulation(p.create());
  const [earth,moon]=simulation.bodies,initial=simulation.bodies.map(body=>({...body.position}));
  assert.equal(simulation.bodies.length,2);assert.equal(earth.type,'planet');assert.equal(moon.type,'moon');
  const separation=384400/AU_KM;
  assert.ok(Math.abs(distance(earth.position,moon.position)-separation)<1e-16);
  const energy=simulation.diagnostics().energy;
  for(let i=0;i<4096;i++)simulation.step(moon.orbitalPeriod/4096);
  assert.equal(simulation.bodies.length,2);assert.equal(simulation.events.length,0);
  assert.ok(distance(moon.position,initial[1])<3e-8,'one-orbit phase error stays below 4.5 km');
  assert.ok(Math.abs((simulation.diagnostics().energy-energy)/energy)<1e-9);
  assert.ok(p.camera.distanceAU<.01,'camera should show the local Earth–Moon distance');
});

test('collision showcase merges two physical Earths and conserves mass and momentum',()=>{
  const p=preset('collision-lab'),simulation=new GravitySimulation(p.create()),initial=simulation.diagnostics();
  const earthRadius=simulation.bodies[0].radius;
  assert.ok(Math.abs(distance(simulation.bodies[0].position,simulation.bodies[1].position)-6*earthRadius)<1e-16);
  for(let i=0;i<1000&&simulation.bodies.length===2;i++)simulation.advance(.000001,100);
  assert.equal(simulation.bodies.length,1,'a physical contact must create one remnant');
  const final=simulation.diagnostics();assert.equal(final.totalMass,initial.totalMass);
  assert.ok(Math.hypot(final.momentum.x,final.momentum.y,final.momentum.z)<1e-20);
  assert.ok(simulation.bodies[0].radius>earthRadius);
  assert.equal(simulation.events.filter(event=>event.type==='merge').length,1);
  const realSeconds=simulation.time*365.25/p.daysPerSecond;
  assert.ok(realSeconds>10&&realSeconds<60,'preset speed makes the collision observable');
});
