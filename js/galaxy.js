/** Representative Milky Way model. Positions use AU; times use Julian years.
 * This is an illustrative distribution and smooth potential, not a star catalog
 * or a reconstruction of the Galaxy's measured mass distribution.
 */
export const LY_AU = 63241.07708426628;
const G = 4 * Math.PI * Math.PI;
const TAU = Math.PI * 2;
export const DEFAULT_GALAXY = Object.freeze({
  seed: 76421,
  pointCount: 16000,
  radiusAU: 50000 * LY_AU,
  solarRadiusAU: 26000 * LY_AU,
  solarPositionAU: Object.freeze({ x: 26000 * LY_AU, y: 0, z: 0 }),
  diskScaleLengthAU: 8500 * LY_AU,
  diskHeightAU: 1000 * LY_AU,
  bulgeRadiusAU: 10000 * LY_AU,
  blackHoleMass: 4.3e6,
  representative: true,
  label: '16,000 representative stars · approximate galactic structure',
  potential: Object.freeze({
    diskMass: 6e10, bulgeMass: 1e10, haloMass: 1e12,
    haloScaleRadiusAU: 100000 * LY_AU,
    description: 'Illustrative smooth disk, bulge and dark-matter halo; not a fitted Milky Way mass model.',
  }),
});

function seeded(seed) {
  return () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return (seed+.5)/4294967296; };
}

/** Miyamoto–Nagai disk + Plummer bulge + Hernquist halo + central point mass.
 * Returns acceleration in AU/year². It is finite at the exact origin.
 */
export function galaxyAcceleration(positionAU, galaxy=DEFAULT_GALAXY) {
  const {x,y,z}=positionAU;
  const model=galaxy.potential||DEFAULT_GALAXY.potential;
  const radius2=x*x+z*z, sphere2=radius2+y*y, r=Math.sqrt(sphere2);
  const a=galaxy.diskScaleLengthAU||DEFAULT_GALAXY.diskScaleLengthAU;
  const b=(galaxy.diskHeightAU||DEFAULT_GALAXY.diskHeightAU)*.3;
  const vertical=Math.sqrt(y*y+b*b);
  const diskDenominator=(radius2+(a+vertical)**2)**1.5;
  const diskFactor=-G*model.diskMass/diskDenominator;
  const bulgeScale=(galaxy.bulgeRadiusAU||DEFAULT_GALAXY.bulgeRadiusAU)*.25;
  const bulgeFactor=-G*model.bulgeMass/(sphere2+bulgeScale*bulgeScale)**1.5;
  const haloScale=model.haloScaleRadiusAU||DEFAULT_GALAXY.potential.haloScaleRadiusAU;
  const haloFactor=r>0?-G*model.haloMass/(r*(r+haloScale)**2):0;
  const blackHoleFactor=r>0?-G*(galaxy.blackHoleMass||0)/(r*r*r):0;
  const sphereFactor=bulgeFactor+haloFactor+blackHoleFactor;
  return {
    x: x*(diskFactor+sphereFactor),
    y: y*(diskFactor*(a+vertical)/vertical+sphereFactor),
    z: z*(diskFactor+sphereFactor),
  };
}

export function galaxyCircularVelocityAUPerYear(radiusAU,galaxy=DEFAULT_GALAXY) {
  if(!Number.isFinite(radiusAU)||radiusAU<=0)return 0;
  return Math.sqrt(Math.max(0,-galaxyAcceleration({x:radiusAU,y:0,z:0},galaxy).x*radiusAU));
}
export function galaxyAngularVelocity(radiusAU,galaxy=DEFAULT_GALAXY) {
  return radiusAU>0?galaxyCircularVelocityAUPerYear(radiusAU,galaxy)/radiusAU:0;
}

/** Create deterministic GPU-ready representative points, with y as disk normal.
 * angularVelocities are radians/year in the x/z plane. Points carry no N-body
 * mass; the renderer may rotate them in the illustrative analytic potential.
 */
export function createGalaxyStars(galaxy=DEFAULT_GALAXY) {
  const count=Math.max(0,Math.min(100000,Math.floor(galaxy.pointCount??16000)));
  const random=seeded(galaxy.seed??76421);
  const positionsAU=new Float64Array(count*3), colors=new Float32Array(count*3);
  const sizes=new Float32Array(count), angularVelocities=new Float32Array(count);
  const outer=galaxy.radiusAU||DEFAULT_GALAXY.radiusAU;
  const scale=galaxy.diskScaleLengthAU||DEFAULT_GALAXY.diskScaleLengthAU;
  const height=galaxy.diskHeightAU||DEFAULT_GALAXY.diskHeightAU;
  const bulge=galaxy.bulgeRadiusAU||DEFAULT_GALAXY.bulgeRadiusAU;
  const normal=()=>Math.sqrt(-2*Math.log(random()))*Math.cos(TAU*random());
  for(let i=0;i<count;i++) {
    const population=random();let x,y,z,radius;
    if(population<.74) {
      radius=Math.min(outer*.99,-scale*Math.log(random()*random()));
      const arm=Math.floor(random()*4)*Math.PI/2;
      const spiral=arm+Math.log(Math.max(radius,scale*.06)/scale)/Math.tan(.23);
      const angle=spiral+normal()*.16+(random()<.22?random()*TAU:0);
      x=Math.cos(angle)*radius;z=Math.sin(angle)*radius;
      y=normal()*height*.18*(.4+.6*radius/outer);
    } else if(population<.95) {
      radius=Math.min(bulge*1.3,-bulge*.2*Math.log(random()*random()));
      const angle=random()*TAU,vertical=random()*2-1,flat=Math.sqrt(1-vertical*vertical);
      x=Math.cos(angle)*radius*flat;z=Math.sin(angle)*radius*flat;y=radius*vertical*.65;
    } else {
      radius=outer*(.3+.7*Math.cbrt(random()));
      const angle=random()*TAU,vertical=random()*2-1,flat=Math.sqrt(1-vertical*vertical);
      x=Math.cos(angle)*radius*flat;z=Math.sin(angle)*radius*flat;y=radius*vertical*.35;
    }
    positionsAU.set([x,y,z],i*3);
    const blue=population<.74&&random()<.24;
    colors.set(blue?[.62+random()*.18,.76+random()*.17,1]:[1,.66+random()*.29,.43+random()*.38],i*3);
    sizes[i]=population>.95?.65+random()*.7:.85+random()*1.4;
    angularVelocities[i]=galaxyAngularVelocity(Math.hypot(x,z),galaxy);
  }
  return {positionsAU,colors,sizes,angularVelocities,count};
}
