import {TEXTURES,loadTexture,onTextureReady} from '../assets/textures.js?v=2.0.0';
import * as THREE from '../vendor/three.module.min.js';
import {createGalaxyStars,galaxyAngularVelocity,LY_AU} from './galaxy.js?v=2.0.0';

const TAU = Math.PI * 2;
const MAX_TRAIL = 900;
const FILE_TEXTURES=new Set(['earth','earth-clouds','mars','jupiter','saturn','neptune','mercury','venus','uranus','sun']);
const LUMINOUS_TYPES=new Set(['star','neutronstar','whitedwarf','browndwarf']);
const G = 4*Math.PI*Math.PI;
const MIN_DISTANCE = 1e-15;
const MAX_DISTANCE = 1e14;
const VERTEX = `varying vec3 vNormal; varying vec3 vPosition; varying vec2 vUv;
void main(){vUv=uv; vNormal=normalize(normalMatrix*normal); vec4 p=modelViewMatrix*vec4(position,1.); vPosition=p.xyz; gl_Position=projectionMatrix*p;}`;

function seeded(seed) { return () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; }; }

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,1)'); g.addColorStop(.07,'rgba(255,246,220,.9)');
  g.addColorStop(.2,'rgba(255,210,140,.32)'); g.addColorStop(.45,'rgba(255,164,70,.09)'); g.addColorStop(1,'rgba(255,130,40,0)');
  ctx.fillStyle=g; ctx.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
}

function proceduralTexture(kind, color) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx=c.getContext('2d'), random=seeded(kind.length*4783);
  ctx.fillStyle=color; ctx.fillRect(0,0,c.width,c.height);
  if(kind==='remnant') {
    ctx.fillStyle='#8a311a';ctx.fillRect(0,0,1024,512);
    for(let i=0;i<1600;i++){ctx.globalAlpha=.18+random()*.35;ctx.fillStyle=i%3?'#251c1c':'#e36e22';ctx.beginPath();ctx.ellipse(random()*1024,random()*512,3+random()*28,2+random()*15,random()*TAU,0,TAU);ctx.fill();}
    ctx.globalAlpha=.9;ctx.strokeStyle='#ffb24f';ctx.lineWidth=1.5;
    for(let line=0;line<23;line++){const start=random()*512,phase=random()*TAU;ctx.beginPath();for(let x=0;x<=1024;x+=16){const y=start+Math.sin(x*.021+phase)*10+Math.sin(x*.073+phase)*4;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}
  } else if (['jupiter','saturn','uranus','neptune'].includes(kind)) {
    for(let y=0;y<512;y++) {
      const b=1 + .12*Math.sin(y*.09)+.08*Math.sin(y*.24);
      ctx.globalAlpha=.15; ctx.fillStyle=b>1?'#fff3df':'#111a39';
      ctx.fillRect(0,y,1024,1);
    }
  } else {
    for(let i=0;i<3600;i++) {
      ctx.globalAlpha=.03+random()*.13;
      ctx.fillStyle=i%2?'#0b1525':'#e3bc83';
      ctx.beginPath();ctx.ellipse(random()*1024,random()*512,2+random()*30,2+random()*16,random()*TAU,0,TAU);ctx.fill();
    }
  }
  ctx.globalAlpha=1;
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}

export class OrbitScene {
  constructor(canvas, {onSelect=()=>{}, onDisplace=()=>{}, onDragStart=()=>{}, onDragEnd=()=>{}, onExploreSolar=null}={}) {
    this.canvas=canvas;this.onSelect=onSelect;this.onDisplace=onDisplace;this.onDragStart=onDragStart;this.onDragEnd=onDragEnd;this.onExploreSolar=onExploreSolar;
    this.canvas.tabIndex=0;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x04070d); this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(44,1,.001,6000);
    this.ambientLight=new THREE.AmbientLight(0x9fb6e2,.24);this.scene.add(this.ambientLight);
    // Neutral inspection lighting is nonphysical and is used only in systems
    // with no luminous body, so isolated Earth/Moon and merger surfaces resolve.
    this.studioLight=new THREE.DirectionalLight(0xffffff,.7);this.studioLight.visible=false;this.scene.add(this.studioLight,this.studioLight.target);this.inspectionLightActive=false;
    this.content=new THREE.Group();this.scene.add(this.content);
    this.entries=new Map();this.textures=new Map();this.glow=glowTexture();
    this.cloudTexture=null;this.cloudTextureReady=false;
    this.textureLoads=new Set();this.resolvedTextures=new Set();
    this.textureReadyUnsubscribe=onTextureReady((kind,dataURL)=>this.upgradeTexture(kind,dataURL));
    this.sphere=new THREE.SphereGeometry(1,64,40);
    this.target=new THREE.Vector3();this.desiredTarget=new THREE.Vector3();
    this.distance=11;this.desiredDistance=11;this.theta=.45;this.phi=.77;
    this.selectedId=null;this.followId=null;this.labels=true;this.trails=true;this.vectors=false;this.field=false;this.quality='auto';
    this.renderUnitAU=1;this.sizeMode='true';this.sizeBoost=1;this.eventEffects=[];this.seenEvents=new WeakSet();this.galaxyTime=0;this.galaxyTimeOverride=null;
    this.pixelRatio=Math.min(window.devicePixelRatio||1,1.5);this.renderer.setPixelRatio(this.pixelRatio);
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.frame=0;
    this.labelLayer=document.createElement('div');this.labelLayer.className='scene-label-layer';
    this.labelLayer.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2';canvas.after(this.labelLayer);
    this.makeBackground();this.makeSelection();this.makeField();this.attachControls();
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();
  }

  resize() {const r=this.canvas.getBoundingClientRect();this.width=r.width;this.height=r.height;this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();}

  makeBackground() {
    const random=seeded(74562), p=[], colors=[], sizes=[];
    for(let i=0;i<5600;i++) {
      let x,y,z;
      if(i<2200){const a=random()*TAU; x=Math.cos(a);z=Math.sin(a);y=(random()-.5)*.18;}
      else {const a=random()*TAU, b=Math.acos(2*random()-1);x=Math.sin(b)*Math.cos(a);y=Math.cos(b);z=Math.sin(b)*Math.sin(a);}
      p.push(x*1600,y*1600,z*1600);const tint=random();
      colors.push(tint>.86?1:.52+random()*.48,.55+random()*.45,tint>.86?.65:1);
      sizes.push(random()>.98?3:random()*1.3+.3);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('size',new THREE.Float32BufferAttribute(sizes,1));
    const material=new THREE.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,uniforms:{ratio:{value:this.pixelRatio}},
      vertexShader:`attribute float size; varying vec3 vColor; uniform float ratio; void main(){vColor=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=size*ratio;}`,
      fragmentShader:`varying vec3 vColor;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(vColor,pow(1.-d*2.,1.4)*.78);}`});
    this.starfield=new THREE.Points(geometry,material);this.starfield.rotation.set(.34,.2,-.4);this.scene.add(this.starfield);
  }

  makeSelection() {
    const pts=[];for(let i=0;i<96;i++){const a=i/96*TAU;pts.push(new THREE.Vector3(Math.cos(a),0,Math.sin(a)));}
    this.selection=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x67e8f9,transparent:true,opacity:.7,depthTest:false}));
    this.selection.renderOrder=8;this.scene.add(this.selection);
  }

  makeField() {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(121*6*3),3));
    geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(121*6*3),3));geometry.setDrawRange(0,0);
    this.fieldLines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.52,depthWrite:false}));
    this.fieldLines.frustumCulled=false;this.fieldLines.visible=false;this.scene.add(this.fieldLines);
  }

  updateField() {
    const entry=this.entries.get(this.selectedId),body=this.bodies?.find(b=>b.id===this.selectedId);
    this.fieldLines.visible=!!(this.field&&entry&&body);if(!this.fieldLines.visible)return;
    this.fieldLines.position.copy(entry.group.position);
    if(this.frame%6!==0&&this.lastFieldBody===body.id)return;this.lastFieldBody=body.id;
    const positions=this.fieldLines.geometry.attributes.position,colors=this.fieldLines.geometry.attributes.color;
    const span=Math.max(this.distance*.45,entry.radius*8),step=span/5,head=step*.12;
    const reference=G*body.mass/((span*this.renderUnitAU)**2),massGain=.35+.65*Math.min(1.4,Math.log1p(body.mass*1e6)/Math.log1p(1e6));let count=0,maxAcceleration=0;
    const write=(x,y,z,red,green,blue)=>{positions.setXYZ(count,x,y,z);colors.setXYZ(count,red,green,blue);count++;};
    for(let ix=-5;ix<=5;ix++)for(let iz=-5;iz<=5;iz++) {
      const x=ix*step,z=iz*step,r=Math.hypot(x,z);if(r<entry.radius*1.5||r===0)continue;
      const acceleration=G*body.mass/((r*this.renderUnitAU)**2);maxAcceleration=Math.max(maxAcceleration,acceleration);
      const strength=Math.min(1,Math.log1p(acceleration/reference)/Math.log(28));
      const length=step*(.2+.65*strength)*massGain,dx=-x/r,dz=-z/r,tipX=x+dx*length,tipZ=z+dz*length;
      const red=.18+.35*strength,green=.48+.40*strength,blue=.73+.25*strength;
      write(x,0,z,red,green,blue);write(tipX,0,tipZ,red,green,blue);
      write(tipX,0,tipZ,red,green,blue);write(tipX-dx*head-dz*head*.5,0,tipZ-dz*head+dx*head*.5,red,green,blue);
      write(tipX,0,tipZ,red,green,blue);write(tipX-dx*head+dz*head*.5,0,tipZ-dz*head-dx*head*.5,red,green,blue);
    }
    this.fieldMaxAccelerationAUPerYear2=maxAcceleration;positions.needsUpdate=true;colors.needsUpdate=true;this.fieldLines.geometry.setDrawRange(0,count);
  }

  makeGalaxy(preset) {
    this.galaxy=preset.galaxy;const data=createGalaxyStars(this.galaxy),unit=this.renderUnitAU,geometry=new THREE.BufferGeometry();
    const positions=new Float32Array(data.count*3);for(let i=0;i<positions.length;i++)positions[i]=data.positionsAU[i]/unit;
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(data.colors,3));
    geometry.setAttribute('size',new THREE.BufferAttribute(data.sizes,1));geometry.setAttribute('omega',new THREE.BufferAttribute(data.angularVelocities,1));
    const material=new THREE.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      uniforms:{years:{value:0},ratio:{value:this.pixelRatio}},
      vertexShader:`attribute float size;attribute float omega;uniform float years;uniform float ratio;varying vec3 vColor;void main(){float a=mod(omega*years,6.283185);float c=cos(a),s=sin(a);vec3 p=vec3(c*position.x-s*position.z,position.y,s*position.x+c*position.z);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(size*ratio,1.,5.);vColor=color;}`,
      fragmentShader:`varying vec3 vColor;void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;gl_FragColor=vec4(vColor,pow(1.-r,1.35)*.85);}`});
    this.galaxyGroup=new THREE.Group();this.galaxyPoints=new THREE.Points(geometry,material);this.galaxyPoints.frustumCulled=false;this.galaxyGroup.add(this.galaxyPoints);
    const diskMaterial=new THREE.ShaderMaterial({transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:'varying vec2 uvDisk;void main(){uvDisk=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec2 uvDisk;void main(){vec2 p=(uvDisk-.5)*2.;float r=length(p);if(r>1.)discard;float arms=.45+.55*pow(.5+.5*cos(atan(p.y,p.x)*4.-log(r+.045)*7.),3.);float density=exp(-r*3.2)*(1.-smoothstep(.75,1.,r));vec3 tint=mix(vec3(.55,.39,.21),vec3(.22,.36,.7),smoothstep(.05,.65,r));gl_FragColor=vec4(tint,density*(.035+.045*arms));}`});
    const disk=new THREE.Mesh(new THREE.PlaneGeometry(2,2),diskMaterial);disk.rotation.x=-Math.PI/2;disk.scale.setScalar(this.galaxy.radiusAU/unit);this.galaxyGroup.add(disk);
    const bulge=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:0xffcf9e,transparent:true,opacity:.24,blending:THREE.AdditiveBlending,depthWrite:false}));bulge.scale.setScalar(this.galaxy.bulgeRadiusAU/unit*2.6);this.galaxyGroup.add(bulge);
    this.scene.add(this.galaxyGroup);
    this.solarPositionAU=preset.solarPositionAU||this.galaxy.solarPositionAU||{x:this.galaxy.solarRadiusAU,y:0,z:0};
    this.solarOmega=galaxyAngularVelocity(Math.hypot(this.solarPositionAU.x,this.solarPositionAU.z),this.galaxy);
    this.solarMarker=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:0x78e8ff,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}));this.solarMarker.renderOrder=9;this.scene.add(this.solarMarker);
    this.solarLabel=document.createElement('button');this.solarLabel.className='body-label selected galaxy-solar-label';this.solarLabel.textContent='Solar System ↗';this.solarLabel.type='button';
    this.solarLabel.style.cssText='position:absolute;pointer-events:auto;color:#8feaff';this.solarLabel.title='Solar neighborhood marker. Open the actual Solar System model; individual planets cannot be resolved at galactic scale.';
    this.solarLabel.addEventListener('click',()=>{if(this.onExploreSolar)this.onExploreSolar();else this.canvas.dispatchEvent(new CustomEvent('explore-solar',{bubbles:true}));});this.labelLayer.append(this.solarLabel);
  }

  setGalaxyTime(years) {if(Number.isFinite(years)){this.galaxyTimeOverride=years;this.galaxyTime=years;}}

  updateGalaxy() {
    if(!this.galaxy)return;
    this.galaxyPoints.material.uniforms.years.value=this.galaxyTime;this.galaxyPoints.material.uniforms.ratio.value=this.pixelRatio;
    const a=this.solarOmega*this.galaxyTime,c=Math.cos(a),s=Math.sin(a),position=this.solarPositionAU;
    this.solarMarker.position.set((c*position.x-s*position.z)/this.renderUnitAU,position.y/this.renderUnitAU,(s*position.x+c*position.z)/this.renderUnitAU);
    this.solarMarker.scale.setScalar(this.worldPerPixel(this.solarMarker.position)*13);
    const point=this.solarMarker.position.clone().project(this.camera),x=(point.x*.5+.5)*this.width,y=(-point.y*.5+.5)*this.height;
    const visible=point.z>-1&&point.z<1&&x>15&&x<this.width-15&&y>50&&y<this.height-110;
    this.solarMarker.visible=visible;this.solarLabel.hidden=!(visible&&this.labels);if(visible)this.solarLabel.style.transform=`translate(${x+10}px,${y-8}px)`;
  }

  clearGalaxy() {
    if(this.galaxyGroup){this.scene.remove(this.galaxyGroup);this.galaxyGroup.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});}
    if(this.solarMarker){this.scene.remove(this.solarMarker);this.solarMarker.material.dispose();}this.solarLabel?.remove();
    this.galaxy=null;this.galaxyGroup=null;this.galaxyPoints=null;this.solarMarker=null;this.solarLabel=null;
  }

  showEvent(event) {
    if(!event||typeof event!=='object'||this.seenEvents.has(event))return;this.seenEvents.add(event);
    const result=this.entries.get(event.resultId||event.bodyId),position=event.positionAU||event.position;
    const point=position?new THREE.Vector3(position.x/this.renderUnitAU,position.y/this.renderUnitAU,position.z/this.renderUnitAU):result?.group.position.clone();if(!point)return;
    const color=event.type==='absorption'?0xffc587:event.type==='collapse'?0xb8a1ff:0x78edff;
    const group=new THREE.Group();group.position.copy(point);
    const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,opacity:.9}));group.add(glow);
    const points=[];for(let i=0;i<80;i++){const angle=i/80*TAU;points.push(new THREE.Vector3(Math.cos(angle),Math.sin(angle),0));}
    const ring=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:true,opacity:.9,depthTest:false,depthWrite:false}));group.add(ring);group.renderOrder=15;this.scene.add(group);
    const label=document.createElement('div');label.className='body-label event-label';label.textContent=(event.type==='absorption'?'CAPTURE':event.type==='collapse'?'COLLAPSE':event.type==='promotion'?'PROMOTION':['type-change','typechange'].includes(event.type)?'TYPE CHANGE':event.type==='merge'?'MERGER':String(event.type||'EVENT').toUpperCase())+' · '+(event.message||'Bodies combined');
    label.title='Transient event marker; the burst is illustrative and does not alter the physical size.';label.style.cssText='position:absolute;pointer-events:none;color:#b5edff;font-size:10px;max-width:330px;white-space:normal;line-height:1.4';this.labelLayer.append(label);
    this.eventEffects.push({group,glow,ring,label,start:performance.now(),point});if(this.eventEffects.length>5)this.removeEffect(this.eventEffects.shift());
  }

  updateEffects() {
    const now=performance.now();
    for(const effect of [...this.eventEffects]) {
      const age=(now-effect.start)/1000;if(age>3){this.removeEffect(effect);this.eventEffects=this.eventEffects.filter(item=>item!==effect);continue;}
      const fade=Math.max(0,1-age/3),pixel=this.worldPerPixel(effect.point),radius=pixel*(12+age*40);
      effect.glow.scale.setScalar(radius*3);effect.glow.material.opacity=fade*.7;effect.ring.scale.setScalar(radius);effect.ring.quaternion.copy(this.camera.quaternion);effect.ring.material.opacity=fade*.9;
      const p=effect.point.clone().project(this.camera),x=(p.x*.5+.5)*this.width,y=(-p.y*.5+.5)*this.height;effect.label.hidden=p.z<-1||p.z>1;
      effect.label.style.transform=`translate(${x+14}px,${y-36}px)`;effect.label.style.opacity=String(fade);
    }
  }

  removeEffect(effect) {if(!effect)return;this.scene.remove(effect.group);effect.ring.geometry.dispose();effect.ring.material.dispose();effect.glow.material.dispose();effect.label.remove();}
  clearEffects() {for(const effect of this.eventEffects)this.removeEffect(effect);this.eventEffects=[];this.seenEvents=new WeakSet();}

  getTexture(kind,color) {
    if(!this.textures.has(kind))this.textures.set(kind,proceduralTexture(kind,color));
    if(TEXTURES[kind])this.upgradeTexture(kind,TEXTURES[kind]);
    else if(FILE_TEXTURES.has(kind))loadTexture(kind).catch(()=>{});
    return this.textures.get(kind);
  }

  upgradeTexture(kind,dataURL) {
    if(!dataURL)return;
    if(kind==='earth-clouds') {
      if(this.cloudTexture)return;
      this.cloudTexture=new THREE.TextureLoader().load(dataURL,t=>{
        this.cloudTexture=t;this.cloudTextureReady=true;
        for(const e of this.entries.values())if(e.group.userData.clouds){
          const clouds=e.group.userData.clouds;
          clouds.material.alphaMap=t;clouds.material.needsUpdate=true;clouds.visible=true;
        }
      },undefined,()=>{this.cloudTexture?.dispose();this.cloudTexture=null;this.cloudTextureReady=false;});
      return;
    }
    if(!this.textures.has(kind)||this.resolvedTextures.has(kind)||this.textureLoads.has(kind))return;
    this.textureLoads.add(kind);
    new THREE.TextureLoader().load(dataURL,t=>{
      t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
      const previous=this.textures.get(kind);this.textures.set(kind,t);
      this.resolvedTextures.add(kind);this.textureLoads.delete(kind);
      for(const e of this.entries.values())if(e.textureKind===kind){
        if(e.mesh.material.map){e.mesh.material.map=t;e.mesh.material.color.set(0xffffff);e.mesh.material.needsUpdate=true;}
        if(e.mesh.material.uniforms?.surface)e.mesh.material.uniforms.surface.value=t;
      }
      if(previous&&previous!==t)previous.dispose();
    },undefined,()=>{this.textureLoads.delete(kind);});
  }

  physicalRadiusAU(body) {
    const radius=body.type==='blackhole'?(body.eventHorizonRadius??body.radius):body.radius;
    return Number.isFinite(radius)&&radius>0?radius:1e-15;
  }

  surfaceRadius(body) {return this.physicalRadiusAU(body)/this.renderUnitAU*this.sizeBoost;}

  createBody(body) {
    const group=new THREE.Group(),type=body.type,radius=this.surfaceRadius(body);
    let mesh,light=null,glow=null;
    const color=new THREE.Color(body.color||'#8bb7ef');
    const luminous=LUMINOUS_TYPES.has(type);
    if(luminous) {
      if(type==='neutronstar')mesh=new THREE.Mesh(this.sphere,new THREE.MeshBasicMaterial({color:body.color||'#d6f4ff'}));
      else {
        const material=new THREE.ShaderMaterial({uniforms:{time:{value:0},tint:{value:color},surface:{value:this.getTexture('sun','#d49c51')}},vertexShader:VERTEX,
          fragmentShader:`varying vec3 vNormal;varying vec3 vPosition;varying vec2 vUv;uniform float time;uniform vec3 tint;uniform sampler2D surface;
          float noise(vec2 p){return sin(p.x*51.+sin(p.y*42.+time*.2))*sin(p.y*63.-time*.15)+sin(p.x*130.+p.y*98.)*.25;}
          void main(){float n=noise(vUv*2.)*.07;float tex=dot(texture2D(surface,vUv).rgb,vec3(.333));gl_FragColor=vec4(tint*(.8+tex*.9+n),1.);}`});
        mesh=new THREE.Mesh(this.sphere,material);
      }
      glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.8}));group.add(glow);
      const luminosity=type==='neutronstar'?.08:type==='browndwarf'?.015:Math.min(500,Math.max(.03,body.mass**3.5));
      light=new THREE.PointLight(color,luminosity*3/(this.renderUnitAU**2),0,2);group.add(light);
      if(type==='neutronstar') {
        const jets=new THREE.Group();jets.rotation.z=.42;
        for(const sign of [-1,1]) {
          const material=new THREE.MeshBasicMaterial({color:0x77caff,transparent:true,opacity:.2,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
          const beam=new THREE.Mesh(new THREE.ConeGeometry(3,42,20,1,true),material);beam.position.y=sign*22;beam.rotation.z=sign>0?Math.PI:0;jets.add(beam);
        }
        group.add(jets);group.userData.jets=jets;
      }
    } else if(type==='blackhole') {
      mesh=new THREE.Mesh(this.sphere,new THREE.MeshBasicMaterial({color:0x000000}));
      const diskMaterial=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:VERTEX,transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,
        fragmentShader:`varying vec2 vUv;uniform float time;void main(){float r=vUv.x;float a=vUv.y*6.28318;float bands=.68+.32*sin(r*145.-a*4.+time*1.2+sin(a*7.+r*12.)*.8);float edge=smoothstep(0.,.08,r)*(1.-smoothstep(.45,1.,r));vec3 hot=mix(vec3(1.,.94,.72),vec3(.83,.18,.025),pow(r,.55));gl_FragColor=vec4(hot*bands*(.55+.45*pow(.5+.5*sin(a),2.))*1.5,edge*.8);}`});
      const diskGeometry=new THREE.RingGeometry(3,30,160,40),pos=diskGeometry.attributes.position,uv=diskGeometry.attributes.uv;
      for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);uv.setXY(i,(Math.hypot(x,y)-3)/27,(Math.atan2(y,x)+Math.PI)/TAU);}
      const disk=new THREE.Mesh(diskGeometry,diskMaterial);disk.rotation.x=-Math.PI/2;group.add(disk);group.userData.disk=disk;
      const photon=new THREE.Mesh(new THREE.TorusGeometry(1.5,.025,10,128),new THREE.MeshBasicMaterial({color:0xffdf9e}));group.add(photon);group.userData.photon=photon;
      glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:0xffad52,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.35}));group.add(glow);
    } else {
      mesh=new THREE.Mesh(this.sphere,new THREE.MeshPhongMaterial({map:this.getTexture(body.texture||'rock',body.color||'#8bb7ef'),color:0xffffff,shininess:body.texture==='earth'?25:5,specular:body.texture==='earth'?0x384654:0x111111,emissive:body.texture==='remnant'?0xc84612:0x000000,emissiveIntensity:body.texture==='remnant'?.12:0}));
      if(['earth','neptune','venus','uranus'].includes(body.texture)) {
        const atmosphere=new THREE.Mesh(this.sphere,new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:`varying vec3 vNormal;varying vec3 vPosition;uniform vec3 tint;void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(-vPosition))),3.5);gl_FragColor=vec4(tint,rim*.35);}`,uniforms:{tint:{value:new THREE.Color(body.texture==='venus'?0xf2c89b:0x579cff)}},transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
        group.add(atmosphere);group.userData.atmosphere=atmosphere;
      }
      if(body.texture==='earth') {
        const clouds=new THREE.Mesh(this.sphere,new THREE.MeshPhongMaterial({color:0xffffff,alphaMap:this.cloudTexture,transparent:true,opacity:.8,depthWrite:false}));clouds.visible=this.cloudTextureReady;group.add(clouds);group.userData.clouds=clouds;
        if(TEXTURES['earth-clouds'])this.upgradeTexture('earth-clouds',TEXTURES['earth-clouds']);else loadTexture('earth-clouds').catch(()=>{});
      }
      if(body.texture==='saturn') {
        const rings=new THREE.Mesh(new THREE.RingGeometry(1.35,2.4,128,1),new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:`varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float stripe=.58+.3*sin(r*150.)+.12*sin(r*390.);float gap=1.-smoothstep(.70,.71,r)*(1.-smoothstep(.74,.75,r));gl_FragColor=vec4(vec3(.70,.61,.45)*stripe,gap*.7);}`,side:THREE.DoubleSide,transparent:true,depthWrite:false}));rings.rotation.x=Math.PI*.38;group.add(rings);group.userData.rings=rings;
      }
    }
    mesh.userData.bodyId=body.id;group.add(mesh);this.content.add(group);
    const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color,transparent:true,depthWrite:false,depthTest:false,opacity:.95,blending:THREE.AdditiveBlending}));marker.renderOrder=7;this.scene.add(marker);
    const label=document.createElement('button');label.className='body-label';label.textContent=body.name;label.type='button';label.style.cssText='position:absolute;pointer-events:auto;';
    label.title='Screen marker for a physical-size object. Double-click to resolve its surface.'+(type==='blackhole'?' Accretion disk is illustrative.':type==='neutronstar'?' Pulsar beams are illustrative.':'');
    label.classList.toggle('selected',body.id===this.selectedId);label.setAttribute('aria-label','Inspect '+body.name);label.addEventListener('click',()=>this.onSelect(body.id));label.addEventListener('dblclick',()=>{this.onSelect(body.id);this.focus(body.id);});this.labelLayer.append(label);
    const positions=new Float32Array(MAX_TRAIL*3),trailGeo=new THREE.BufferGeometry();trailGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));trailGeo.setDrawRange(0,0);
    const trail=new THREE.Line(trailGeo,new THREE.LineBasicMaterial({color,transparent:true,opacity:.45}));trail.frustumCulled=false;this.scene.add(trail);
    const arrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),1,color,.09,.04);this.scene.add(arrow);arrow.visible=false;
    const entry={id:body.id,type,textureKind:luminous?'sun':body.texture||'rock',group,mesh,label,light,glow,marker,radius,physicalRadiusAU:this.physicalRadiusAU(body),trail,positions,trailCount:0,lastTrail:new THREE.Vector3(Infinity,0,0),arrow};
    this.entries.set(body.id,entry);this.resizeBody(entry,body);return entry;
  }

  resizeBody(entry,body) {
    const r=this.surfaceRadius(body);entry.radius=r;entry.physicalRadiusAU=this.physicalRadiusAU(body);entry.mesh.scale.setScalar(r);
    const data=entry.group.userData;
    if(entry.glow)entry.glow.scale.setScalar(r*(entry.type==='blackhole'?25:8));
    if(data.atmosphere)data.atmosphere.scale.setScalar(r*1.04);
    if(data.clouds)data.clouds.scale.setScalar(r*1.012);
    if(data.rings)data.rings.scale.setScalar(r);
    if(data.disk)data.disk.scale.setScalar(r);
    if(data.photon)data.photon.scale.setScalar(r);
    if(data.jets)data.jets.scale.setScalar(r);
  }

  removeBody(entry) {
    this.content.remove(entry.group);this.scene.remove(entry.trail);this.scene.remove(entry.arrow);this.scene.remove(entry.marker);entry.marker.material.dispose();entry.label.remove();
    entry.group.traverse(o=>{if(o.geometry&&o.geometry!==this.sphere)o.geometry.dispose();if(o.material)o.material.dispose();});entry.trail.geometry.dispose();entry.trail.material.dispose();entry.arrow.dispose();this.entries.delete(entry.id);
  }

  loadBodies(bodies,preset) {
    for(const e of [...this.entries.values()])this.removeBody(e);
    if(this.guides){this.scene.remove(this.guides);this.guides.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
    this.clearGalaxy();this.clearEffects();this.preset=preset;this.renderUnitAU=Number(preset.renderUnitAU)||1;this.galaxyTime=0;this.galaxyTimeOverride=null;
    this.guides=new THREE.Group();this.scene.add(this.guides);
    if(preset.id==='solar'){
      for(const b of bodies.filter(b=>b.type==='planet')){
        const sun=bodies.find(body=>body.id==='sun');
        const center=new THREE.Vector3(sun.position.x,sun.position.y,sun.position.z);
        const r=new THREE.Vector3(b.position.x,b.position.y,b.position.z).sub(center);
        const v=new THREE.Vector3(b.velocity.x-sun.velocity.x,b.velocity.y-sun.velocity.y,b.velocity.z-sun.velocity.z);
        const mu=4*Math.PI*Math.PI*(sun.mass+b.mass),h=new THREE.Vector3().crossVectors(r,v);
        const eccentricity=new THREE.Vector3().crossVectors(v,h).divideScalar(mu).sub(r.clone().normalize());
        const e=eccentricity.length(),a=1/(2/r.length()-v.lengthSq()/mu);
        const u=e>1e-5?eccentricity.normalize():r.clone().normalize();const w=new THREE.Vector3().crossVectors(h.clone().normalize(),u).normalize(),pts=[];
        for(let i=0;i<256;i++){const angle=i/256*TAU;const radius=a*(1-e*e)/(1+e*Math.cos(angle));pts.push(center.clone().addScaledVector(u,Math.cos(angle)*radius).addScaledVector(w,Math.sin(angle)*radius));}
        const orbit=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x63758b,transparent:true,opacity:.16}));this.guides.add(orbit);
      }
    }
    this.guides.scale.setScalar(1/this.renderUnitAU);
    this.followId=null;const cameraTarget=preset.camera?.targetAU||preset.camera?.target||{x:0,y:0,z:0};this.target.set(cameraTarget.x/this.renderUnitAU,cameraTarget.y/this.renderUnitAU,cameraTarget.z/this.renderUnitAU);this.desiredTarget.copy(this.target);
    this.distance=this.desiredDistance=Math.max(MIN_DISTANCE,(preset.camera?.distanceAU??preset.camera?.distance??((preset.scale||6)*2))/this.renderUnitAU/Math.min(1,this.camera.aspect));this.followPreviousPosition=null;this.lastFieldBody=null;
    if(preset.mode==='galaxy')this.makeGalaxy(preset);
    this.phi=['black-hole','three-body'].includes(preset.id)?1.12:.82;this.theta=.38;
    for(const b of bodies)this.createBody(b);
    this.syncBodies(bodies,0,false);this.updateCamera(1);
  }

  syncBodies(bodies,time,record=true) {
    this.bodies=bodies;if(this.galaxy)this.galaxyTime=this.galaxyTimeOverride??time;this.updateInspectionLight(bodies);
    for(const entry of [...this.entries.values()])if(!bodies.some(body=>body.id===entry.id))this.removeBody(entry);
    for(const body of bodies) {
      let entry=this.entries.get(body.id);if(!entry)entry=this.createBody(body);
      const textureKind=LUMINOUS_TYPES.has(body.type)?'sun':body.texture||'rock';
      if(entry.type!==body.type||entry.textureKind!==textureKind){this.removeBody(entry);entry=this.createBody(body);}
      this.resizeBody(entry,body);entry.group.position.set(body.position.x/this.renderUnitAU,body.position.y/this.renderUnitAU,body.position.z/this.renderUnitAU);
      if(entry.label.textContent!==body.name){entry.label.textContent=body.name;entry.label.setAttribute('aria-label','Inspect '+body.name);}
      entry.mesh.rotation.y=time*TAU*3;
      if(entry.group.userData.clouds)entry.group.userData.clouds.rotation.y=time*TAU*3.1;
      const threshold=Math.max(1e-22,(this.distance*.0004)**2);
      if(record&&entry.group.position.distanceToSquared(entry.lastTrail)>threshold) {
        if(entry.trailCount===MAX_TRAIL){entry.positions.copyWithin(0,3);entry.trailCount--;}
        entry.group.position.toArray(entry.positions,entry.trailCount*3);entry.trailCount++;entry.lastTrail.copy(entry.group.position);entry.trail.geometry.attributes.position.needsUpdate=true;entry.trail.geometry.setDrawRange(0,entry.trailCount);
      }
      entry.trail.visible=this.trails;entry.arrow.visible=this.vectors;
      if(this.vectors) {
        const v=new THREE.Vector3(body.velocity.x,body.velocity.y,body.velocity.z),length=v.length();entry.arrow.position.copy(entry.group.position);
        if(length>1e-16){entry.arrow.setDirection(v.divideScalar(length));const size=Math.min(length/this.renderUnitAU*.065,this.distance*.25);entry.arrow.setLength(Math.max(size,this.distance*.012),this.distance*.008,this.distance*.004);}else entry.arrow.visible=false;
      }
      if(entry.mesh.material.uniforms?.time)entry.mesh.material.uniforms.time.value=performance.now()/1000;
      if(entry.group.userData.disk)entry.group.userData.disk.material.uniforms.time.value=performance.now()/1000;
    }
  }

  updateInspectionLight(bodies) {
    this.inspectionLightActive=!bodies.some(body=>LUMINOUS_TYPES.has(body.type));
    if(this.ambientLight){this.ambientLight.intensity=this.inspectionLightActive?.8:.24;this.ambientLight.color.setHex(this.inspectionLightActive?0xc8d9e8:0x9fb6e2);}
    if(this.studioLight)this.studioLight.visible=this.inspectionLightActive;
  }

  clearTrails(id=null) {for(const e of this.entries.values()){if(id&&e.id!==id)continue;e.trailCount=0;e.trail.geometry.setDrawRange(0,0);e.lastTrail.set(Infinity,0,0);}}
  setSelected(id) {this.selectedId=id;for(const e of this.entries.values())e.label.classList.toggle('selected',e.id===id);}
  zoom(factor) {if(Number.isFinite(factor)&&factor>0)this.desiredDistance=THREE.MathUtils.clamp(this.desiredDistance*factor,MIN_DISTANCE,MAX_DISTANCE);}
  get distanceAU() {return this.distance*this.renderUnitAU;}
  setSizeMode(mode) {this.sizeMode=mode==='enhanced'?'enhanced':'true';this.sizeBoost=this.sizeMode==='enhanced'?20:1;for(const body of this.bodies||[]){const entry=this.entries.get(body.id);if(entry)this.resizeBody(entry,body);}}

  focus(id) {
    const entry=this.entries.get(id);if(!entry)return;this.followId=id;this.desiredTarget.copy(entry.group.position);this.followPreviousPosition=entry.group.position.clone();
    const multiplier=entry.type==='blackhole'?110:entry.type==='neutronstar'?30:9;
    this.desiredDistance=THREE.MathUtils.clamp(entry.radius*multiplier,MIN_DISTANCE,MAX_DISTANCE);
  }

  fit() {
    this.followId=null;
    if(this.galaxy){const vfov=this.camera.fov*Math.PI/180,hfov=2*Math.atan(Math.tan(vfov/2)*this.camera.aspect);this.desiredTarget.set(0,0,0);this.desiredDistance=this.galaxy.radiusAU/this.renderUnitAU/Math.sin(Math.min(vfov,hfov)/2)*1.15;return;}
    const box=new THREE.Box3();for(const entry of this.entries.values())box.expandByPoint(entry.group.position);if(box.isEmpty())return;
    box.getCenter(this.desiredTarget);let radius=0;
    for(const entry of this.entries.values())radius=Math.max(radius,entry.group.position.distanceTo(this.desiredTarget)+entry.radius*(entry.type==='blackhole'?30:2.5));
    const vfov=this.camera.fov*Math.PI/180,hfov=2*Math.atan(Math.tan(vfov/2)*this.camera.aspect);
    this.desiredDistance=THREE.MathUtils.clamp(Math.max(radius,1e-15)/Math.sin(Math.min(vfov,hfov)/2)*1.2,MIN_DISTANCE,MAX_DISTANCE);
  }

  setQuality(value) {this.quality=value;this.pixelRatio=value==='high'?Math.min(devicePixelRatio,2):value==='performance'?.8:Math.min(devicePixelRatio,1.5);this.renderer.setPixelRatio(this.pixelRatio);this.resize();}
  adapt(fps) {if(this.quality!=='auto')return;if(fps<49&&this.pixelRatio>.7)this.pixelRatio=Math.max(.7,this.pixelRatio-.15);else if(fps>58&&this.pixelRatio<Math.min(devicePixelRatio,1.5))this.pixelRatio=Math.min(Math.min(devicePixelRatio,1.5),this.pixelRatio+.05);else return;this.renderer.setPixelRatio(this.pixelRatio);this.resize();}

  updateCamera(dt) {
    if(this.followId&&this.entries.has(this.followId)){
      const position=this.entries.get(this.followId).group.position;
      // Carry the observer with the moving body; smoothing a tiny planet's
      // position in a world frame would leave it outside a close-up view.
      if(this.followPreviousPosition)this.target.add(position.clone().sub(this.followPreviousPosition));
      this.followPreviousPosition=position.clone();this.desiredTarget.copy(position);
    }
    const factor=1-Math.exp(-dt*8);this.target.lerp(this.desiredTarget,factor);
    // Interpolate logarithmically so a close-up can cross astronomical scales smoothly.
    this.distance=Math.exp(THREE.MathUtils.lerp(Math.log(Math.max(this.distance,MIN_DISTANCE)),Math.log(Math.max(this.desiredDistance,this.followId?this.target.distanceTo(this.desiredTarget)*3:0,MIN_DISTANCE)),factor));
    this.camera.position.set(Math.sin(this.phi)*Math.sin(this.theta),Math.cos(this.phi),Math.sin(this.phi)*Math.cos(this.theta)).multiplyScalar(this.distance).add(this.target);
    this.camera.near=Math.max(this.distance*.001,1e-20);this.camera.far=Math.max(this.distance*4000,this.camera.near*1e5);
    this.camera.setViewOffset(this.width,this.height,this.width>1050?-this.width*.025:0,this.width>740&&this.width<=1050?this.height*.18:0,this.width,this.height);
    this.camera.lookAt(this.target);this.camera.updateMatrixWorld();
    if(this.studioLight?.visible){this.studioLight.position.copy(this.camera.position);this.studioLight.target.position.copy(this.target);}
    // The distant sky is an observer-centered background, never a physical body.
    this.starfield.position.copy(this.camera.position);this.starfield.scale.setScalar(this.distance*.05);this.starfield.material.uniforms.ratio.value=this.pixelRatio;
  }

  render(dt) {
    this.frame++;this.updateCamera(dt);
    const selected=this.entries.get(this.selectedId);this.selection.visible=!!selected;
    if(selected){this.selection.position.copy(selected.group.position);this.selection.scale.setScalar(Math.max(selected.radius*1.65,this.worldPerPixel(selected.group.position)*11));this.selection.quaternion.copy(this.camera.quaternion);this.selection.rotateX(Math.PI/2);}
    const projected=new THREE.Vector3(),occupied=[];
    const ordered=[...this.entries.values()].sort((a,b)=>(b.id===this.selectedId?1:0)-(a.id===this.selectedId?1:0));
    for(const entry of ordered) {
      if(entry.group.userData.photon)entry.group.userData.photon.quaternion.copy(this.camera.quaternion);
      if(entry.group.userData.jets)entry.group.userData.jets.rotation.y=performance.now()*.0007;
      projected.copy(entry.group.position).project(this.camera);const x=(projected.x*.5+.5)*this.width,y=(-projected.y*.5+.5)*this.height;
      const inView=projected.z<1&&projected.z>-1&&x>12&&x<this.width-12&&y>40&&y<this.height-90;
      const worldPixel=this.worldPerPixel(entry.group.position),pixels=entry.radius/worldPixel;
      entry.marker.visible=inView&&pixels<2;entry.marker.position.copy(entry.group.position);entry.marker.scale.setScalar(worldPixel*9);entry.marker.material.opacity=entry.id===this.selectedId?1:.8;
      entry.label.hidden=!(this.labels&&inView);
      if(!entry.label.hidden){
        const left=x+Math.max(pixels,5)+8,width=Math.min(190,entry.label.textContent.length*6+16);let top=y-9;
        for(const offset of [-9,8,-26,25,-43,42,-60,59]){const candidate=y+offset;if(!occupied.some(rect=>left<rect.right&&left+width>rect.left&&candidate<rect.bottom&&candidate+14>rect.top)){top=candidate;break;}}
        occupied.push({left,right:left+width,top,bottom:top+14});entry.label.style.transform=`translate(${left}px,${top}px)`;
      }
    }
    this.updateField();this.updateGalaxy();this.updateEffects();this.renderer.render(this.scene,this.camera);
  }

  worldPerPixel(point) {return Math.max(1e-30,this.camera.position.distanceTo(point)*2*Math.tan(this.camera.fov*Math.PI/360)/Math.max(1,this.height));}

  pick(clientX,clientY) {
    const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);
    this.content.updateMatrixWorld(true);
    const hit=this.raycaster.intersectObjects([...this.entries.values()].map(e=>e.mesh),false)[0];
    if(hit)return hit.object.userData.bodyId;
    // A minimum screen-space hit radius keeps small planets selectable.
    let closest=null,best=18;
    for(const e of this.entries.values()){const p=e.group.position.clone().project(this.camera);const d=Math.hypot((p.x-this.pointer.x)*rect.width/2,(p.y-this.pointer.y)*rect.height/2);if(p.z>-1&&p.z<1&&d<best){closest=e.id;best=d;}}
    return closest;
  }

  worldAt(clientX,clientY,y=0) {
    this.pick(clientX,clientY);const point=new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y/this.renderUnitAU),point)?{x:point.x*this.renderUnitAU,y:point.y*this.renderUnitAU,z:point.z*this.renderUnitAU}:null;
  }

  attachControls() {
    let pointer=null,pinch=null;const touches=new Map();
    this.canvas.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      this.canvas.focus({preventScroll:true});
      this.canvas.setPointerCapture(event.pointerId);
      if(event.pointerType==='touch'){
        touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
        if(touches.size>=2){const [a,b]=[...touches.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),base:this.desiredDistance};if(pointer?.displace&&pointer.started)this.onDragEnd({cancelled:true});pointer=null;return;}
      }
      const id=this.pick(event.clientX,event.clientY),displace=!!id;
      pointer={pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,id,displace,started:false};
      if(displace){this.onSelect(id);const point=this.entries.get(id).group.position;this.dragPlane=new THREE.Plane(new THREE.Vector3(0,1,0),-point.y);const intersection=new THREE.Vector3();this.raycaster.ray.intersectPlane(this.dragPlane,intersection);pointer.grabOffset=point.clone().sub(intersection);}
    });
    this.canvas.addEventListener('pointermove',event=>{
      if(touches.has(event.pointerId))touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pinch&&touches.size>=2){const [a,b]=[...touches.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);this.desiredDistance=THREE.MathUtils.clamp(pinch.base*pinch.distance/Math.max(1,distance),MIN_DISTANCE,MAX_DISTANCE);return;}
      if(!pointer||pointer.pointerId!==event.pointerId)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
      if(pointer.displace){
        if(!pointer.started&&Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY)>3){pointer.started=true;this.onDragStart(pointer.id);this.followId=null;}
        if(pointer.started){this.pick(event.clientX,event.clientY);const point=new THREE.Vector3();if(this.raycaster.ray.intersectPlane(this.dragPlane,point)){point.add(pointer.grabOffset);this.onDisplace(pointer.id,{x:point.x*this.renderUnitAU,y:point.y*this.renderUnitAU,z:point.z*this.renderUnitAU},event);}}
      }
      else{this.theta-=dx*.006;this.phi=THREE.MathUtils.clamp(this.phi+dy*.006,.08,Math.PI-.08);}
      pointer.x=event.clientX;pointer.y=event.clientY;
    });
    const end=event=>{touches.delete(event.pointerId);if(pinch){if(touches.size<2)pinch=null;pointer=null;return;}if(!pointer||pointer.pointerId!==event.pointerId)return;if(pointer.displace&&pointer.started)this.onDragEnd({id:pointer.id,x:event.clientX,y:event.clientY});else if(Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY)<5&&pointer.id)this.onSelect(pointer.id);pointer=null;};
    this.canvas.addEventListener('pointerup',end);this.canvas.addEventListener('pointercancel',()=>{if(pointer?.displace&&pointer.started)this.onDragEnd({cancelled:true});pointer=null;pinch=null;touches.clear();});
    // Listen across the viewer, including labels and HUD space, so wheel zoom
    // also works in an embedded browser. Inspector panels keep their own scroll.
    window.addEventListener('wheel',event=>{
      if(event.target.closest?.('input,select,button,.inspector-panel,.intro-panel,.transport-bar,.topbar,dialog'))return;
      event.preventDefault();
      const units=event.deltaMode===1?16:event.deltaMode===2?this.height:1;
      this.zoom(Math.exp(THREE.MathUtils.clamp(event.deltaY*units,-220,220)*.0022));
    },{passive:false});
    this.canvas.addEventListener('dblclick',event=>{const id=this.pick(event.clientX,event.clientY);if(id){this.onSelect(id);this.focus(id);}});
  }
}
