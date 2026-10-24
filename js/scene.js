import {TEXTURES} from '../assets/textures.js';
import * as THREE from '../vendor/three.module.min.js';

const TAU = Math.PI * 2;
const MAX_TRAIL = 900;
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
  if (['jupiter','saturn','uranus','neptune'].includes(kind)) {
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
  constructor(canvas, {onSelect=()=>{}, onDisplace=()=>{}, onDragStart=()=>{}, onDragEnd=()=>{}}={}) {
    this.canvas=canvas;this.onSelect=onSelect;this.onDisplace=onDisplace;this.onDragStart=onDragStart;this.onDragEnd=onDragEnd;
    this.canvas.tabIndex=0;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.setClearColor(0x04070d); this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(44,1,.001,6000);
    this.scene.add(new THREE.AmbientLight(0x9fb6e2,.24));
    this.content=new THREE.Group();this.scene.add(this.content);
    this.entries=new Map();this.textures=new Map();this.glow=glowTexture();
    this.cloudTextureReady=false;
    this.cloudTexture=new THREE.TextureLoader().load(TEXTURES['earth-clouds'],()=>{
      this.cloudTextureReady=true;for(const e of this.entries.values())if(e.group.userData.clouds)e.group.userData.clouds.visible=true;
    },undefined,()=>{});
    this.sphere=new THREE.SphereGeometry(1,64,40);
    this.target=new THREE.Vector3();this.desiredTarget=new THREE.Vector3();
    this.distance=11;this.desiredDistance=11;this.theta=.45;this.phi=.77;
    this.selectedId=null;this.followId=null;this.labels=true;this.trails=true;this.vectors=false;this.quality='auto';
    this.pixelRatio=Math.min(window.devicePixelRatio||1,1.5);this.renderer.setPixelRatio(this.pixelRatio);
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.frame=0;
    this.labelLayer=document.createElement('div');this.labelLayer.className='scene-label-layer';
    this.labelLayer.style.cssText='position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2';canvas.after(this.labelLayer);
    this.makeBackground();this.makeSelection();this.attachControls();
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

  getTexture(kind,color) {
    if(this.textures.has(kind))return this.textures.get(kind);
    const fallback=proceduralTexture(kind,color);this.textures.set(kind,fallback);
    if(TEXTURES[kind]) {
      new THREE.TextureLoader().load(TEXTURES[kind],t=>{
        t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
        const previous=this.textures.get(kind);this.textures.set(kind,t);
        for(const e of this.entries.values())if(e.textureKind===kind){
          if(e.mesh.material.map){e.mesh.material.map=t;e.mesh.material.color.set(0xffffff);e.mesh.material.needsUpdate=true;}
          if(e.mesh.material.uniforms?.surface)e.mesh.material.uniforms.surface.value=t;
        }
        previous?.dispose();
      },undefined,()=>{});
    }
    return fallback;
  }

  createBody(body) {
    const group=new THREE.Group(), type=body.type, radius=body.visualRadius||.1;
    let mesh,light=null,glow=null;
    const color=new THREE.Color(body.color||'#8bb7ef');
    if(type==='star') {
      const material=new THREE.ShaderMaterial({uniforms:{time:{value:0},tint:{value:color},surface:{value:this.getTexture('sun','#d49c51')}},vertexShader:VERTEX,
        fragmentShader:`varying vec3 vNormal;varying vec3 vPosition;varying vec2 vUv;uniform float time;uniform vec3 tint;uniform sampler2D surface;
        float noise(vec2 p){return sin(p.x*51.+sin(p.y*42.+time*.2))*sin(p.y*63.-time*.15)+sin(p.x*130.+p.y*98.)*.25;}
        void main(){float n=noise(vUv*2.)*.07;float rim=pow(1.-max(dot(normalize(vNormal),normalize(-vPosition)),0.),2.);float tex=dot(texture2D(surface,vUv).rgb,vec3(.333));vec3 c=tint*(.8+tex*.9+n)+vec3(.4,.2,.03)*(1.-rim);gl_FragColor=vec4(c,1.);}`});
      mesh=new THREE.Mesh(this.sphere,material);
      glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
      glow.scale.setScalar(radius*13);group.add(glow);
      light=new THREE.PointLight(color,16,0,0);group.add(light);
    } else if(type==='blackhole') {
      mesh=new THREE.Mesh(this.sphere,new THREE.MeshBasicMaterial({color:0x000000}));
      const diskMaterial=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:VERTEX,transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,
        fragmentShader:`varying vec2 vUv; uniform float time;
        void main(){float r=vUv.x;float a=vUv.y*6.28318;float bands=.65+.35*sin(r*145.-a*4.+time*1.8+sin(a*7.+r*12.)*.8);float edge=smoothstep(0.,.10,r)*(1.-smoothstep(.4,1.,r));vec3 hot=mix(vec3(1.,.91,.65),vec3(.83,.18,.025),pow(r,.55));float beam=.48+.52*pow(.5+.5*sin(a),2.);gl_FragColor=vec4(hot*bands*beam*1.7,edge*.85);}`});
      // Radial UVs keep the accretion bands circular, independent of geometry tessellation.
      const diskGeometry=new THREE.RingGeometry(1.25,6.8,192,64);
      const pos=diskGeometry.attributes.position,uv=diskGeometry.attributes.uv;
      for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);uv.setXY(i,(Math.hypot(x,y)-1.25)/5.55,(Math.atan2(y,x)+Math.PI)/TAU);}
      const disk=new THREE.Mesh(diskGeometry,diskMaterial);disk.rotation.x=-Math.PI/2;disk.scale.setScalar(radius);group.add(disk);
      const photon=new THREE.Mesh(new THREE.TorusGeometry(1.1,.045,12,160),new THREE.MeshBasicMaterial({color:0xffe1a1}));photon.scale.setScalar(radius);group.add(photon);
      glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:0xffad52,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.3}));glow.scale.setScalar(radius*8);group.add(glow);
      // Visible illumination comes from the illustrative hot disk around the hole.
      light=new THREE.PointLight(0xffb168,2.5,0,0);group.add(light);
      group.userData.disk=disk;group.userData.photon=photon;
    } else {
      const map=this.getTexture(body.texture||'rock',body.color||'#8bb7ef');
      mesh=new THREE.Mesh(this.sphere,new THREE.MeshPhongMaterial({map,color:0xffffff,shininess:body.texture==='earth'?25:5,specular:body.texture==='earth'?0x384654:0x111111}));
      if(['earth','neptune','venus','uranus'].includes(body.texture)){
        const atmosphere=new THREE.Mesh(this.sphere,new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:`varying vec3 vNormal;varying vec3 vPosition;uniform vec3 tint;void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(-vPosition))),3.5);gl_FragColor=vec4(tint,rim*.5);}`,uniforms:{tint:{value:new THREE.Color(body.texture==='venus'?0xf2c89b:0x579cff)}},transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
        atmosphere.scale.setScalar(radius*1.07);group.add(atmosphere);
      }
      if(body.texture==='earth'){
        const cloudsMaterial=new THREE.MeshPhongMaterial({color:0xffffff,alphaMap:this.cloudTexture,transparent:true,opacity:.8,depthWrite:false});
        const clouds=new THREE.Mesh(this.sphere,cloudsMaterial);clouds.scale.setScalar(radius*1.012);clouds.visible=this.cloudTextureReady;group.add(clouds);group.userData.clouds=clouds;
      }
      if(body.texture==='saturn') {
        const ringGeo=new THREE.RingGeometry(1.35,2.4,128,1);
        const ringMat=new THREE.ShaderMaterial({vertexShader:VERTEX,fragmentShader:`varying vec2 vUv;void main(){float r=length(vUv-.5)*2.;float stripe=.58+.3*sin(r*150.)+.12*sin(r*390.);float gap=1.-smoothstep(.70,.71,r)* (1.-smoothstep(.74,.75,r));gl_FragColor=vec4(vec3(.70,.61,.45)*stripe,gap*.7);}`,side:THREE.DoubleSide,transparent:true,depthWrite:false});
        const rings=new THREE.Mesh(ringGeo,ringMat);rings.rotation.x=Math.PI*.38;rings.scale.setScalar(radius);group.add(rings);
      }
    }
    mesh.scale.setScalar(radius);mesh.userData.bodyId=body.id;group.add(mesh);this.content.add(group);
    const label=document.createElement('button');label.className='body-label';label.textContent=body.name;label.type='button';label.style.cssText='position:absolute;pointer-events:auto;';
    label.setAttribute('aria-label','Inspect '+body.name);label.addEventListener('click',()=>this.onSelect(body.id));label.addEventListener('dblclick',()=>this.focus(body.id));this.labelLayer.append(label);
    const positions=new Float32Array(MAX_TRAIL*3),trailGeo=new THREE.BufferGeometry();trailGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));trailGeo.setDrawRange(0,0);
    const trail=new THREE.Line(trailGeo,new THREE.LineBasicMaterial({color,transparent:true,opacity:.48}));trail.frustumCulled=false;this.scene.add(trail);
    const arrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),1,color,.09,.04);this.scene.add(arrow);arrow.visible=false;
    const entry={id:body.id,type,textureKind:body.texture,group,mesh,label,light,glow,radius,baseRadius:radius,trail,positions,trailCount:0,lastTrail:new THREE.Vector3(Infinity,0,0),arrow};
    this.entries.set(body.id,entry);return entry;
  }

  removeBody(entry) {
    this.content.remove(entry.group);this.scene.remove(entry.trail);this.scene.remove(entry.arrow);entry.label.remove();
    entry.group.traverse(o=>{if(o.geometry&&o.geometry!==this.sphere)o.geometry.dispose();if(o.material)o.material.dispose();});entry.trail.geometry.dispose();entry.trail.material.dispose();entry.arrow.dispose();this.entries.delete(entry.id);
  }

  loadBodies(bodies,preset) {
    for(const e of [...this.entries.values()])this.removeBody(e);
    if(this.guides){this.scene.remove(this.guides);this.guides.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
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
    this.followId=null;this.target.set(0,0,0);this.desiredTarget.copy(this.target);
    this.distance=this.desiredDistance=preset.camera?.distance||preset.scale*2||12;
    this.phi=['black-hole','three-body'].includes(preset.id)?1.12:.82;this.theta=.38;
    for(const b of bodies)this.createBody(b);
    this.syncBodies(bodies,0,false);this.updateCamera(1);
  }

  syncBodies(bodies,time,record=true) {
    this.bodies=bodies;
    for(const e of [...this.entries.values()])if(!bodies.some(b=>b.id===e.id))this.removeBody(e);
    for(const b of bodies){
      let e=this.entries.get(b.id);if(!e)e=this.createBody(b);
      if(e.type!==b.type){this.removeBody(e);e=this.createBody(b);}
      e.radius=b.visualRadius||e.baseRadius;e.group.scale.setScalar(e.radius/e.baseRadius);
      e.group.position.set(b.position.x,b.position.y,b.position.z);
      e.mesh.rotation.y=time*TAU*3;
      if(e.group.userData.clouds)e.group.userData.clouds.rotation.y=time*TAU*3.1;
      if(record&&e.group.position.distanceToSquared(e.lastTrail)>1e-7){
        if(e.trailCount===MAX_TRAIL){e.positions.copyWithin(0,3);e.trailCount--;}
        e.group.position.toArray(e.positions,e.trailCount*3);e.trailCount++;e.lastTrail.copy(e.group.position);
        e.trail.geometry.attributes.position.needsUpdate=true;e.trail.geometry.setDrawRange(0,e.trailCount);
      }
      e.trail.visible=this.trails;e.arrow.visible=this.vectors;
      if(this.vectors){const v=new THREE.Vector3(b.velocity.x,b.velocity.y,b.velocity.z);e.arrow.position.copy(e.group.position);e.arrow.setDirection(v.clone().normalize());e.arrow.setLength(Math.min(v.length()*.065,this.distance*.28),.055,.028);}
      if(e.mesh.material.uniforms?.time)e.mesh.material.uniforms.time.value=performance.now()/1000;
      if(e.group.userData.disk)e.group.userData.disk.material.uniforms.time.value=performance.now()/1000;
    }
  }

  clearTrails(id=null) {for(const e of this.entries.values()){if(id&&e.id!==id)continue;e.trailCount=0;e.trail.geometry.setDrawRange(0,0);e.lastTrail.set(Infinity,0,0);}}
  setSelected(id) {this.selectedId=id;for(const e of this.entries.values())e.label.classList.toggle('selected',e.id===id);}
  zoom(factor) {this.desiredDistance=THREE.MathUtils.clamp(this.desiredDistance*factor,.15,1400);}
  focus(id) {const e=this.entries.get(id);if(!e)return;this.followId=id;this.desiredTarget.copy(e.group.position);this.desiredDistance=Math.max(e.radius*11,.6);}
  fit() {
    this.followId=null;
    const box=new THREE.Box3();for(const e of this.entries.values())box.expandByPoint(e.group.position);
    box.getCenter(this.desiredTarget);let radius=.1;
    for(const e of this.entries.values())radius=Math.max(radius,e.group.position.distanceTo(this.desiredTarget)+e.radius*(e.type==='blackhole'?7:2.5));
    const vfov=this.camera.fov*Math.PI/180,hfov=2*Math.atan(Math.tan(vfov/2)*this.camera.aspect);
    this.desiredDistance=Math.max(3,radius/Math.sin(Math.min(vfov,hfov)/2)*1.15);
  }
  setQuality(value) {this.quality=value;this.pixelRatio=value==='high'?Math.min(devicePixelRatio,2):value==='performance'?.8:Math.min(devicePixelRatio,1.5);this.renderer.setPixelRatio(this.pixelRatio);this.resize();}
  adapt(fps) {if(this.quality!=='auto')return;if(fps<49&&this.pixelRatio>.7)this.pixelRatio=Math.max(.7,this.pixelRatio-.15);else if(fps>58&&this.pixelRatio<Math.min(devicePixelRatio,1.5))this.pixelRatio=Math.min(Math.min(devicePixelRatio,1.5),this.pixelRatio+.05);else return;this.renderer.setPixelRatio(this.pixelRatio);this.resize();}

  updateCamera(dt) {
    if(this.followId&&this.entries.has(this.followId))this.desiredTarget.copy(this.entries.get(this.followId).group.position);
    const factor=1-Math.exp(-dt*8);this.target.lerp(this.desiredTarget,factor);this.distance=THREE.MathUtils.lerp(this.distance,this.desiredDistance,factor);
    this.camera.position.set(Math.sin(this.phi)*Math.sin(this.theta),Math.cos(this.phi),Math.sin(this.phi)*Math.cos(this.theta)).multiplyScalar(this.distance).add(this.target);
    // Offset the visual center into the open space between the two control panels.
    this.camera.setViewOffset(this.width,this.height,this.width>1050?-this.width*.025:0,this.width>740&&this.width<=1050?this.height*.18:0,this.width,this.height);
    this.camera.lookAt(this.target);this.camera.updateMatrixWorld();
  }

  render(dt) {
    this.frame++;this.updateCamera(dt);
    const selected=this.entries.get(this.selectedId);this.selection.visible=!!selected;
    if(selected){this.selection.position.copy(selected.group.position);this.selection.scale.setScalar(selected.radius*1.65);this.selection.quaternion.copy(this.camera.quaternion);this.selection.rotateX(Math.PI/2);}
    const p=new THREE.Vector3();
    for(const e of this.entries.values()){
      if(e.group.userData.photon)e.group.userData.photon.quaternion.copy(this.camera.quaternion);
      p.copy(e.group.position).project(this.camera);const x=(p.x*.5+.5)*this.width,y=(-p.y*.5+.5)*this.height;
      const visible=this.labels&&p.z<1&&p.z>-1&&x>20&&x<this.width-20&&y>45&&y<this.height-100;
      e.label.hidden=!visible;
      if(visible){const pixels=e.radius/this.camera.position.distanceTo(e.group.position)*this.height/(2*Math.tan(this.camera.fov*Math.PI/360));e.label.style.transform=`translate(${x+Math.max(pixels,5)+9}px,${y-9}px)`;}
    }
    this.renderer.render(this.scene,this.camera);
  }

  pick(clientX,clientY) {
    const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hit=this.raycaster.intersectObjects([...this.entries.values()].map(e=>e.mesh),false)[0];
    if(hit)return hit.object.userData.bodyId;
    // A minimum screen-space hit radius keeps small planets selectable.
    let closest=null,best=18;
    for(const e of this.entries.values()){const p=e.group.position.clone().project(this.camera);const d=Math.hypot((p.x-this.pointer.x)*rect.width/2,(p.y-this.pointer.y)*rect.height/2);if(p.z<1&&d<best){closest=e.id;best=d;}}
    return closest;
  }

  worldAt(clientX,clientY,y=0) {
    this.pick(clientX,clientY);const point=new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-y),point)?{x:point.x,y:point.y,z:point.z}:null;
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
      if(pinch&&touches.size>=2){const [a,b]=[...touches.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);this.desiredDistance=THREE.MathUtils.clamp(pinch.base*pinch.distance/Math.max(1,distance),.15,1400);return;}
      if(!pointer||pointer.pointerId!==event.pointerId)return;const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
      if(pointer.displace){
        if(!pointer.started&&Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY)>3){pointer.started=true;this.onDragStart(pointer.id);this.followId=null;}
        if(pointer.started){this.pick(event.clientX,event.clientY);const point=new THREE.Vector3();if(this.raycaster.ray.intersectPlane(this.dragPlane,point)){point.add(pointer.grabOffset);this.onDisplace(pointer.id,{x:point.x,y:point.y,z:point.z},event);}}
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
