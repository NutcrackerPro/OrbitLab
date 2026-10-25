import {TEXTURES,loadTexture,onTextureReady} from '../assets/textures.js?v=1.1.2';
import {GravitySimulation,G} from './physics.js?v=1.1.0';
import {PRESETS} from './presets.js?v=1.1.0';
import {OrbitScene} from './scene.js?v=1.1.2';

onTextureReady((kind,url)=>{
  for(const image of document.querySelectorAll('img[data-texture]'))if(image.dataset.texture===kind)image.src=url;
  const body=currentBody();
  if(body?.type!=='blackhole'&&body?.texture===kind){const orb=document.querySelector('.body-orb');if(orb)orb.style.backgroundImage=`url("${url}")`;}
});
for(const kind of ['earth','mars','jupiter','neptune'])loadTexture(kind).catch(()=>{});

const $=id=>document.getElementById(id);
const sim=new GravitySimulation();
let preset,selectedId,paused=false,editing=false,editWasPaused=false,scene;
let lastTime=performance.now(),lastUI=0,fpsStart=lastTime,fpsFrames=0,fpsSamples=[],lastAdapt=0;
let energyReference=0,energyAltered=false,lastEvent=null,noticeUntil=0,bodySignature='';
let daysPerSecond=Number($('speed-slider').value)||30;
const number=(value,digits=2)=>Math.abs(value)<.001&&value!==0?value.toExponential(2):value.toLocaleString(undefined,{maximumFractionDigits:digits});
const currentBody=()=>sim.bodies.find(body=>body.id===selectedId);
const PLANETS={
  earth:{name:'Earth',mass:3.00349e-6,radius:.00004259,visualRadius:.15,color:'#72b8ec'},
  mars:{name:'Mars',mass:3.22715e-7,radius:.00002266,visualRadius:.125,color:'#d97850'},
  jupiter:{name:'Jupiter',mass:.00095479,radius:.00046733,visualRadius:.35,color:'#d8b18d'},
  neptune:{name:'Neptune',mass:.000051514,radius:.00016459,visualRadius:.23,color:'#547fe1'},
};
let newPlanetCount=0;

function notify(message,duration=4500) { $('status').textContent=message;noticeUntil=performance.now()+duration; }
function updatePause() {
  $('pause-button').innerHTML=paused?'<span aria-hidden="true">▶</span> Play':'<span aria-hidden="true">Ⅱ</span> Pause';
  $('pause-button').setAttribute('aria-label',paused?'Play simulation':'Pause simulation');
  $('pause-button').setAttribute('aria-pressed',String(paused));
  document.body.classList.toggle('is-paused',paused);
}
function beginEdit() {if(editing)return;editing=true;editWasPaused=paused;paused=true;updatePause();}
function endEdit() {if(!editing)return;editing=false;paused=editWasPaused;updatePause();}
function changed() {energyAltered=true;energyReference=sim.diagnostics().energy;}

function addPlanet(kind,position=null) {
  if(!PLANETS[kind])return;
  if(sim.bodies.length>=48){notify('48-object limit reached. Remove an object to keep the simulation smooth.');return;}
  const template=PLANETS[kind],primary=sim.bodies.reduce((a,b)=>a.mass>b.mass?a:b);
  const radius=Math.max(1.4,primary.visualRadius*(primary.type==='blackhole'?9:4));
  const angle=-Math.PI/4+newPlanetCount*.62;
  position=position||{x:primary.position.x+radius*Math.cos(angle),y:primary.position.y,z:primary.position.z+radius*Math.sin(angle)};
  const dx=position.x-primary.position.x,dz=position.z-primary.position.z;
  const r=Math.hypot(dx,position.y-primary.position.y,dz),flat=Math.hypot(dx,dz);
  const speed=Math.sqrt(G*(primary.mass+template.mass)/Math.max(r,.05));
  const velocity={x:primary.velocity.x+(flat>1e-6?-dz/flat*speed:speed),y:primary.velocity.y,z:primary.velocity.z+(flat>1e-6?dx/flat*speed:0)};
  newPlanetCount++;
  const body=sim.addBody({...template,id:'custom-'+kind+'-'+newPlanetCount,name:template.name+' '+newPlanetCount,type:'planet',texture:kind,position,velocity,
    description:'A world you added. It starts with an estimated orbital velocity around the most massive body. Drag it, change its mass, or give it a nudge.'});
  changed();scene.syncBodies(sim.bodies,sim.time,false);refreshBodyList();selectBody(body.id);
  notify(body.name+' added. Drag it to move it, or choose Close up.');
}

function removeBody(id=selectedId) {
  if(sim.bodies.length<=1){notify('Keep at least one object in this universe. Add another before removing this one.');return;}
  const body=sim.bodies.find(b=>b.id===id);if(!body)return;
  sim.removeBody(id);changed();scene.syncBodies(sim.bodies,sim.time,false);refreshBodyList();
  notify(body.name+' removed. The remaining bodies are responding.');
}

function startBodyDrag() {beginEdit();document.body.classList.add('is-dragging-body');}
function finishBodyDrag(info={}) {
  const box=$('delete-zone')?.getBoundingClientRect();
  endEdit();document.body.classList.remove('is-dragging-body');$('delete-zone')?.classList.remove('is-over');
  if(info.cancelled)return;
  if(box&&info.x>=box.left&&info.x<=box.right&&info.y>=box.top&&info.y<=box.bottom){removeBody(info.id);return;}
  notify('Position changed. Gravity is responding.');
}

function refreshBodyList() {
  const signature=sim.bodies.map(b=>b.id+':'+b.name).join('|');if(signature===bodySignature)return;
  bodySignature=signature;$('body-select').replaceChildren(...sim.bodies.map(b=>{const option=document.createElement('option');option.value=b.id;option.textContent=b.name;return option;}));
  if(!currentBody())selectBody(sim.bodies[0]?.id);
  $('body-select').value=selectedId||'';
  const holeButton=$('blackhole-button');const buttonText=[...holeButton.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
  if(buttonText)buttonText.textContent=sim.bodies.some(b=>b.type==='blackhole')?'Update black hole':'Drop a black hole';
  if($('body-count'))$('body-count').textContent=String(sim.bodies.length).padStart(2,'0');
}

function selectBody(id) {
  const body=sim.bodies.find(b=>b.id===id);if(!body)return;
  selectedId=id;scene?.setSelected(id);$('body-select').value=id;
  $('body-name').textContent=body.name;$('body-type').textContent=body.type==='blackhole'?'SINGULARITY':body.type==='star'?'STAR':'PLANET';
  $('body-description').textContent=body.description||'Change its position or momentum and watch gravity respond.';
  const orb=document.querySelector('.body-orb');
  if(orb){orb.style.backgroundImage=body.type==='blackhole'?'radial-gradient(circle,#000 40%,#efc082 50%,#553222 62%,#0b0c10 70%)':TEXTURES[body.texture]?`url("${TEXTURES[body.texture]}")`:`radial-gradient(circle at 30% 25%,#fff8,${body.color||'#72b8ec'} 40%,#091221 85%)`;orb.style.backgroundSize='cover';}
  $('mass-value').value=String(Number(body.mass.toPrecision(5)));$('mass-slider').value=Math.log10(body.mass);
  const limit=Math.max(3,Math.ceil(Math.max(...sim.bodies.flatMap(b=>Object.values(b.position).map(Math.abs))))*1.3,preset.scale||3);
  for(const axis of ['x','y','z']){const input=$('pos-'+axis);input.min=-limit;input.max=limit;input.step=.001;}
  refreshInspector();
}

function refreshInspector() {
  const body=currentBody();if(!body)return;
  if(!editing){for(const axis of ['x','y','z']){
    const input=$('pos-'+axis);const v=body.position[axis];
    if(Math.abs(v)>Number(input.max)){input.max=Math.ceil(Math.abs(v)*1.3);input.min=-Number(input.max);}
    input.value=v;
    const out=$('pos-'+axis+'-value');if(out)out.textContent=number(v,2);
  }}
  const position=$('position-output');if(position)position.textContent=['x','y','z'].map(a=>number(body.position[a],2)).join(' / ')+' AU';
  if($('velocity-value'))$('velocity-value').textContent=number(Math.hypot(...Object.values(body.velocity))*4.74047,2)+' km/s';
  if(document.activeElement!==$('mass-value')&&document.activeElement!==$('mass-slider')){
    $('mass-value').value=String(Number(body.mass.toPrecision(5)));$('mass-slider').value=Math.log10(body.mass);
  }
}

function loadPreset(id,{announce=true}={}) {
  preset=PRESETS.find(p=>p.id===id)||PRESETS[0];
  sim.setBodies(preset.create());scene.loadBodies(sim.bodies,preset);bodySignature='';lastEvent=null;
  paused=false;editing=false;energyAltered=false;energyReference=sim.diagnostics().energy;
  selectedId=preset.selectedId||sim.bodies.find(b=>b.type==='planet')?.id||sim.bodies[0].id;
  refreshBodyList();selectBody(selectedId);updatePause();
  document.querySelectorAll('[data-preset]').forEach(button=>{const active=button.dataset.preset===preset.id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  if($('model-name'))$('model-name').textContent=preset.name;
  if($('model-caption'))$('model-caption').textContent=preset.description;
  if($('model-kicker'))$('model-kicker').textContent=preset.kicker;
  try{history.replaceState(null,'','#'+preset.id);}catch{}
  if(announce)notify(preset.name+' loaded. Move a body. Change the story.');
  updateUI(performance.now());
}

function displace(id,position,event=null) {
  if(!sim.bodies.some(body=>body.id===id))return;
  sim.displace(id,position);scene.clearTrails(id);scene.syncBodies(sim.bodies,sim.time,false);changed();refreshInspector();
  if(event){const zone=$('delete-zone'),box=zone?.getBoundingClientRect();if(box)zone.classList.toggle('is-over',event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom);}
}

function updateUI(now) {
  refreshBodyList();refreshInspector();
  if($('zoom-value'))$('zoom-value').textContent=number(scene.distance,1)+' AU';
  $('time-value').textContent=sim.time<1?number(sim.time*365.25,1)+' days':number(sim.time,2)+' years';
  if($('energy-value')){
    const drift=energyReference?Math.abs((sim.diagnostics().energy-energyReference)/energyReference)*100:0;
    $('energy-value').textContent=number(drift,3)+'%';
    $('energy-value').title='Energy drift since '+(energyAltered?'last edit. Collisions dissipate energy.':'reset. Collisions dissipate energy.');
  }
  const newest=sim.events.at(-1);if(newest&&newest!==lastEvent){lastEvent=newest;notify(newest.message,7000);}
  if(now>noticeUntil){
    const limited=sim.lastAdvance.limited;
    $('status').textContent=limited?'Close encounter · simulation slowed to preserve responsiveness':paused?'Simulation paused · edit, then press play':'Live N-body gravity · sizes exaggerated · distances in AU';
  }
  lastUI=now;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt=Math.min(.06,Math.max(0,(now-lastTime)/1000));lastTime=now;
  if(document.hidden)return;
  try{
    if(!paused)sim.advance(dt*daysPerSecond/365.25,160);
    scene.syncBodies(sim.bodies,sim.time,!paused);scene.render(dt);
    if(now-lastUI>150)updateUI(now);
    fpsFrames++;
    if(now-fpsStart>=1000){
      const fps=fpsFrames*1000/(now-fpsStart);fpsSamples.push(fps);if(fpsSamples.length>5)fpsSamples.shift();
      const average=fpsSamples.reduce((a,b)=>a+b,0)/fpsSamples.length;
      $('fps-value').textContent=Math.round(average)+' fps';
      $('fps-value').dataset.smooth=average>=54?'true':'false';
      if(now-lastAdapt>4000){scene.adapt(average);lastAdapt=now;}
      fpsFrames=0;fpsStart=now;
    }
  }catch(error){paused=true;updatePause();notify('Simulation paused: '+error.message,20000);console.error(error);}
}

try {
  if(matchMedia('(max-width:740px)').matches)document.querySelectorAll('.scenario-details,.inspector-details,#body-tray').forEach(details=>details.open=false);
  scene=new OrbitScene($('cosmos'),{onSelect:selectBody,onDisplace:displace,onDragStart:startBodyDrag,onDragEnd:finishBodyDrag});
  document.querySelectorAll('[data-add-planet]').forEach(button=>{
    button.addEventListener('click',()=>addPlanet(button.dataset.addPlanet));
    button.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-orbitlab-planet',button.dataset.addPlanet);event.dataTransfer.effectAllowed='copy';document.body.classList.add('is-adding-body');});
    button.addEventListener('dragend',()=>document.body.classList.remove('is-adding-body'));
  });
  const isViewerDrop=event=>event.dataTransfer?.types.includes('application/x-orbitlab-planet')&&!event.target.closest?.('.intro-panel,.inspector-panel,.transport-bar,.topbar,dialog,#body-tray');
  window.addEventListener('dragover',event=>{if(isViewerDrop(event)){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
  window.addEventListener('drop',event=>{if(!isViewerDrop(event))return;event.preventDefault();document.body.classList.remove('is-adding-body');const position=scene.worldAt(event.clientX,event.clientY);if(position)addPlanet(event.dataTransfer.getData('application/x-orbitlab-planet'),position);});
  $('remove-body-button').addEventListener('click',()=>removeBody());
  document.querySelectorAll('[data-preset]').forEach(button=>button.addEventListener('click',()=>loadPreset(button.dataset.preset)));
  $('body-select').addEventListener('change',event=>selectBody(event.target.value));
  $('pause-button').addEventListener('click',()=>{paused=!paused;updatePause();});
  for(const id of ['reset-button','restart-button'])$(id).addEventListener('click',()=>loadPreset(preset.id));
  $('focus-button').addEventListener('click',()=>{scene.focus(selectedId);notify('Following '+currentBody().name+'. Scroll to zoom out.');});
  $('fit-button').addEventListener('click',()=>scene.fit());
  $('zoom-in-button').addEventListener('click',()=>scene.zoom(.75));
  $('zoom-out-button').addEventListener('click',()=>scene.zoom(1.33));
  $('closeup-button').addEventListener('click',()=>{scene.focus(selectedId);notify('Following '+currentBody().name+'. Use − or Fit system to return.');});
  $('speed-slider').addEventListener('input',event=>{daysPerSecond=Number(event.target.value);$('speed-value').textContent=daysPerSecond+' days / sec';});
  $('speed-value').textContent=daysPerSecond+' days / sec';
  for(const axis of ['x','y','z']){
    const input=$('pos-'+axis);
    input.addEventListener('pointerdown',beginEdit);input.addEventListener('keydown',event=>{if(event.key.startsWith('Arrow'))beginEdit();});
    input.addEventListener('input',event=>{beginEdit();const body=currentBody();if(!body)return;displace(body.id,{...body.position,[axis]:Number(event.target.value)});const out=$('pos-'+axis+'-value');if(out)out.textContent=number(Number(event.target.value),2);});
    input.addEventListener('change',()=>{endEdit();notify('Position changed. Watch the new orbit unfold.');});
    input.addEventListener('blur',endEdit);
  }
  window.addEventListener('pointerup',()=>{if(editing)endEdit();});
  $('mass-slider').addEventListener('input',event=>{const mass=10**Number(event.target.value);sim.setMass(selectedId,mass);$('mass-value').value=String(Number(mass.toPrecision(4)));changed();});
  $('mass-value').addEventListener('change',event=>{const value=Number(event.target.value);if(!Number.isFinite(value)||value<1e-7||value>1000){event.target.value=currentBody().mass;notify('Choose a mass between 0.0000001 and 1,000 Suns.');return;}sim.setMass(selectedId,value);$('mass-slider').value=Math.log10(value);changed();notify(currentBody().name+' now has '+number(value,5)+' solar masses.');});
  $('nudge-strength')?.addEventListener('input',event=>{if($('nudge-value'))$('nudge-value').textContent=event.target.value+'% speed';});
  $('nudge-button').addEventListener('click',()=>{
    const body=currentBody();if(!body)return;
    const speed=Math.hypot(...Object.values(body.velocity));const strength=Number($('nudge-strength')?.value||15)/100;
    const direction=$('nudge-direction')?.value||'prograde';let vector={...body.velocity};
    if(direction==='outward')vector={...body.position};if(direction==='upward')vector={x:0,y:1,z:0};
    let length=Math.hypot(...Object.values(vector));if(length<1e-8){vector={x:1,y:0,z:0};length=1;}
    if(direction==='retrograde'&&speed<1e-8){notify(body.name+' is stationary; choose a direction to start it moving.');return;}
    const factor=(speed>1e-8?speed:1)*strength/length*(direction==='retrograde'?-1:1);
    for(const axis of ['x','y','z'])vector[axis]*=factor;
    sim.impulse(selectedId,vector);changed();notify(body.name+' received a '+Math.round(strength*100)+'% velocity kick.');
  });
  $('blackhole-button').addEventListener('click',()=>{
    const mass=Number($('blackhole-mass').value),existing=sim.bodies.some(b=>b.type==='blackhole');const body=sim.addBlackHole(mass);changed();refreshBodyList();selectBody(body.id);
    // Keep the current orbits intact; insertion changes the dynamics immediately.
    notify(existing?'Black hole mass changed to '+mass+' solar masses.':mass+'-solar-mass black hole placed at the origin. Existing bodies keep their velocity.',8000);
  });
  for(const [id,property] of [['trails-toggle','trails'],['labels-toggle','labels'],['vectors-toggle','vectors']]){
    scene[property]=$(id).checked;$(id).addEventListener('change',event=>scene[property]=event.target.checked);
  }
  $('quality-select').addEventListener('change',event=>scene.setQuality(event.target.value));
  const help=$('help-dialog');$('help-button').addEventListener('click',()=>help.showModal());
  help.querySelector('[data-close]')?.addEventListener('click',()=>help.close());
  help.addEventListener('click',event=>{if(event.target===help)help.close();});
  document.addEventListener('keydown',event=>{
    if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||help.open)return;
    if(event.code==='Space'&&['BUTTON','A','SUMMARY'].includes(document.activeElement?.tagName))return;
    if(event.code==='Space'){event.preventDefault();paused=!paused;updatePause();}
    if(event.key.toLowerCase()==='r')loadPreset(preset.id);
    if(event.key.toLowerCase()==='f')scene.focus(selectedId);
    if(event.key==='Escape')scene.fit();
    if(event.key==='+'||event.key==='=')scene.zoom(.8);
    if(event.key==='-'||event.key==='_')scene.zoom(1.25);
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();removeBody();}
  });
  document.addEventListener('visibilitychange',()=>{lastTime=performance.now();fpsStart=lastTime;fpsFrames=0;});
  loadPreset(location.hash.slice(1)||'solar',{announce:false});
  requestAnimationFrame(frame);
  document.body.classList.add('is-ready');
  $('startup-message')?.remove();
  if($('engine-state'))$('engine-state').textContent='ENGINE ONLINE';
} catch(error) {
  $('startup-message')?.remove();
  if($('engine-state'))$('engine-state').textContent='ENGINE OFFLINE';
  console.error(error);$('status').textContent='WebGL 2 is unavailable. Enable hardware acceleration or use a recent browser.';
  const fallback=document.createElement('div');fallback.className='webgl-error';fallback.innerHTML='<h2>A little more graphics power.</h2><p>OrbitLab needs WebGL 2. Enable hardware acceleration in your browser, then reload.</p>';document.body.append(fallback);
}
