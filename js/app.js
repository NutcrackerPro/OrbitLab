import {TEXTURES,loadTexture,onTextureReady} from '../assets/textures.js?v=2.0.0';
import {GravitySimulation,G} from './physics.js?v=2.0.0';
import {BODY_CATALOG,createBodyTemplate,EARTH_MASS,JUPITER_MASS,AU_KM} from './bodies.js?v=2.0.0';
import {PRESETS} from './presets.js?v=2.0.0';
import {LY_AU} from './galaxy.js?v=2.0.0';
import {OrbitScene} from './scene.js?v=2.0.0';

const $=id=>document.getElementById(id);
const sim=new GravitySimulation();
const units={earth:{mass:EARTH_MASS,label:'Earths'},jupiter:{mass:JUPITER_MASS,label:'Jupiters'},solar:{mass:1,label:'Suns'}};
const typeNames={planet:'PLANET',star:'STAR',browndwarf:'BROWN DWARF',neutronstar:'NEUTRON STAR',whitedwarf:'WHITE DWARF',blackhole:'BLACK HOLE',moon:'MOON',asteroid:'ASTEROID',comet:'COMET',ejecta:'SUPERNOVA EJECTA'};
const paletteKinds=['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','moon','comet','sun','star','neutronstar','blackhole','whitedwarf'];
const icons={solar:'☼','three-body':'∴','figure-eight':'∞','black-hole':'◉',binary:'☷','chaotic-three':'⁂','milky-way':'✧','earth-moon':'◐','collision-lab':'✹'};
const taglines={solar:'Planets, moons and small bodies','three-body':'Stable hierarchical triple','figure-eight':'An exact orbital choreography','black-hole':'Explore a physical event horizon',binary:'Two suns, a shared orbit','chaotic-three':'An intentionally unstable experiment','milky-way':'The galaxy that holds our home','earth-moon':'See Earth’s gravity at work','collision-lab':'Two worlds become one remnant'};
let scene,preset,selectedId,paused=false,editing=false,editWasPaused=false,daysPerSecond=30,galaxyYears=0,galaxyYearsPerSecond=1e6;
let counter=0,bodySignature='',seenEvents=new WeakSet(),noticeUntil=0,lastUI=0,lastTime=performance.now(),fpsStart=lastTime,fpsFrames=0,fpsSamples=[],lastAdapt=0,eventTimer;
let uiHidden=false,idleTimer,awakeTimer;
const currentBody=()=>sim.bodies.find(body=>body.id===selectedId);
const isGalaxy=()=>preset?.mode==='galaxy';
const number=(value,digits=2)=>Math.abs(value)>0&&(Math.abs(value)<.001||Math.abs(value)>=1e9)?value.toExponential(2):value.toLocaleString(undefined,{maximumFractionDigits:digits});
const distanceText=au=>au>=LY_AU?number(au/LY_AU,1)+' ly':au<.01?number(au*AU_KM,1)+' km':number(au,3)+' AU';
const formatMass=mass=>mass<EARTH_MASS*.01?number(mass*1.98847e30,2)+' kg':mass<.01?number(mass/EARTH_MASS,3)+' Earths':number(mass,4)+' Suns';
const largestBody=()=>sim.bodies.reduce((a,b)=>!a||b.mass>a.mass?b:a,null);
function notify(message,duration=6000){$('status').textContent=message;noticeUntil=performance.now()+duration;}
function unit(){return units[$('mass-unit').value]||units.solar;}
function setDefaultUnit(body){$('mass-unit').value=body.mass>=.01?'solar':body.mass>=1e-4?'jupiter':'earth';}
function refreshTexture(kind,url){
  for(const image of document.querySelectorAll('img[data-texture]'))if(image.dataset.texture===kind)image.src=url;
  const body=currentBody();if(body?.texture===kind&&body.type!=='blackhole'){const orb=document.querySelector('.body-orb');if(orb)orb.style.backgroundImage=`url("${url}")`;}
}
onTextureReady(refreshTexture);

function setUIHidden(hidden){
  uiHidden=hidden;document.body.classList.toggle('ui-hidden',hidden);
  $('ui-toggle-label').textContent=hidden?'Show UI':'Hide UI';
  $('ui-toggle').setAttribute('aria-label',hidden?'Show UI':'Hide UI');
  $('ui-toggle').setAttribute('aria-expanded',String(!hidden));
  if(hidden)document.activeElement?.blur?.();
  clearTimeout(idleTimer);if(!hidden)resetIdle();
}
function resetIdle(){clearTimeout(idleTimer);if(!uiHidden)idleTimer=setTimeout(()=>{if(editing||$('help-dialog').open){resetIdle();return;}setUIHidden(true);},5000);}
function showToggle(){document.body.classList.add('ui-toggle-awake');clearTimeout(awakeTimer);awakeTimer=setTimeout(()=>document.body.classList.remove('ui-toggle-awake'),1800);}
function setupUIVisibility(){
  $('ui-toggle').addEventListener('click',()=>setUIHidden(!uiHidden));
  $('ui-hotspot').addEventListener('pointerenter',showToggle);
  window.addEventListener('pointermove',event=>{if(!uiHidden)resetIdle();else if(event.clientX>innerWidth-180&&event.clientY<100)showToggle();},{passive:true});
  for(const eventName of ['pointerdown','keydown','wheel','touchstart'])window.addEventListener(eventName,()=>{if(!uiHidden)resetIdle();},{passive:true});
  resetIdle();
}
function updatePause(){
  $('pause-button').textContent=paused?'▶ Play':'Ⅱ Pause';$('pause-button').setAttribute('aria-label',paused?'Play simulation':'Pause simulation');$('pause-button').setAttribute('aria-pressed',String(paused));document.body.classList.toggle('is-paused',paused);
}
function beginEdit(){if(editing)return;editing=true;editWasPaused=paused;paused=true;updatePause();}
function endEdit(){if(!editing)return;editing=false;paused=editWasPaused;updatePause();resetIdle();}
function startBodyDrag(){beginEdit();document.body.classList.add('is-dragging-body');}
function finishBodyDrag(info={}){
  const box=$('delete-zone').getBoundingClientRect();endEdit();document.body.classList.remove('is-dragging-body');$('delete-zone').classList.remove('is-over');
  if(info.cancelled)return;if(info.x>=box.left&&info.x<=box.right&&info.y>=box.top&&info.y<=box.bottom){removeBody(info.id);return;}notify('Position changed. Every body is responding to the new gravity.');
}
function displace(id,position,event){
  sim.displace(id,position);scene.clearTrails(id);scene.syncBodies(sim.bodies,isGalaxy()?galaxyYears:sim.time,false);refreshInspector();
  if(event){const box=$('delete-zone').getBoundingClientRect();$('delete-zone').classList.toggle('is-over',event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom);}
}
function buildMenus(){
  const modelList=$('model-list');
  for(const model of PRESETS){
    const button=document.createElement('button');button.className='scenario-card';button.type='button';button.dataset.preset=model.id;button.setAttribute('aria-pressed','false');
    const icon=document.createElement('span');icon.className='scenario-icon';icon.setAttribute('aria-hidden','true');icon.textContent=icons[model.id]||'✦';
    const text=document.createElement('span');text.className='scenario-text';const strong=document.createElement('strong');strong.textContent=model.name;const small=document.createElement('small');small.textContent=taglines[model.id]||model.kicker;text.append(strong,small);
    const index=document.createElement('span');index.className='scenario-index';index.textContent=String(modelList.children.length+1).padStart(2,'0');button.append(icon,text,index);button.addEventListener('click',()=>{loadPreset(model.id);if(innerWidth<981)document.querySelector('.scenario-details').open=false;});modelList.append(button);
  }
  $('model-total').textContent=String(PRESETS.length).padStart(2,'0');
  for(const kind of paletteKinds){
    const template=BODY_CATALOG[kind];if(!template)continue;
    const button=document.createElement('button');button.type='button';button.draggable=true;button.dataset.kind=kind;button.setAttribute('aria-label','Add '+template.name);button.title=template.name+' · '+formatMass(template.mass)+' · '+number(template.radius*AU_KM,1)+' km radius';
    const orb=document.createElement('span');orb.className='palette-orb';orb.style.setProperty('--orb',template.color);
    if(['earth','mars','mercury','venus','jupiter','saturn','uranus','neptune','sun'].includes(template.texture)){
      const image=document.createElement('img');image.alt='';image.draggable=false;image.dataset.texture=template.texture;image.style.visibility='hidden';image.addEventListener('load',()=>image.style.visibility='visible');orb.append(image);loadTexture(template.texture).catch(()=>{});
    }
    const label=document.createElement('span');label.textContent=kind==='neutronstar'?'Neutron star':kind==='whitedwarf'?'White dwarf':template.name;button.append(orb,label);button.addEventListener('click',()=>addObject(kind));
    button.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-orbitlab-body',kind);event.dataTransfer.effectAllowed='copy';document.body.classList.add('is-adding-body');});button.addEventListener('dragend',()=>document.body.classList.remove('is-adding-body'));$('object-palette').append(button);
  }
}
function refreshBodyList(){
  const signature=sim.bodies.map(b=>[b.id,b.name,b.type].join(':')).join('|');if(signature===bodySignature)return;bodySignature=signature;
  const oldParent=$('orbit-parent').value;
  $('body-select').replaceChildren(...sim.bodies.map(body=>{const o=document.createElement('option');o.value=body.id;o.textContent=body.name;return o;}));
  if(!currentBody())selectedId=sim.bodies[0]?.id;
  $('body-select').value=selectedId||'';
  $('orbit-parent').replaceChildren(...sim.bodies.filter(body=>body.id!==selectedId&&body.type!=='ejecta').map(body=>{const o=document.createElement('option');o.value=body.id;o.textContent=body.name;return o;}));
  const selected=currentBody(),preferred=sim.bodies.find(b=>b.id===(selected?.inspectorParentId||selected?.orbitPrimaryId||selected?.hostId)&&b.id!==selectedId)||sim.bodies.find(b=>b.id===oldParent&&b.id!==selectedId)||sim.bodies.filter(b=>b.id!==selectedId&&b.type!=='ejecta').sort((a,b)=>b.mass-a.mass)[0];
  if(preferred)$('orbit-parent').value=preferred.id;
  $('circularize-button').disabled=!preferred||isGalaxy();$('remove-body-button').disabled=sim.bodies.length<=1;
  $('body-count').textContent=String(sim.bodies.length).padStart(2,'0');
}
function refreshInspector(){
  const body=currentBody();if(!body)return;
  $('body-name').textContent=body.name;$('body-type').textContent=typeNames[body.type]||body.type.toUpperCase();$('body-description').textContent=body.description||'A freely moving, gravitating body.';
  $('radius-value').textContent=number(body.radius*AU_KM,body.radius*AU_KM<1?3:1)+' km';
  const gravity=6.67430e-11*body.mass*1.98847e30/(body.radius*149597870700)**2;
  $('gravity-value').textContent=body.type==='blackhole'?'Event horizon':number(gravity,2)+' m/s²';
  if(document.activeElement!==$('mass-value'))$('mass-value').value=String(Number((body.mass/unit().mass).toPrecision(7)));
  const slider=Math.max(0,Math.min(100,(Math.log10(body.mass)+18)/27*100));$('mass-slider').value=slider;$('mass-slider').setAttribute('aria-valuetext',formatMass(body.mass));
  $('collapse-button').hidden=body.type!=='star'||body.mass<8;
  $('mass-value').readOnly=isGalaxy();$('mass-slider').disabled=isGalaxy();$('blackhole-button').disabled=isGalaxy();
  $('evolution-note').textContent=isGalaxy()?'The galaxy overview uses a fixed illustrative mass model. Enter a local system to edit individual bodies.':body.type==='neutronstar'?'This 12-km-scale remnant collapses to a black hole above the chosen 2.2-Sun limit.':body.type==='star'&&body.mass>=8?'Massive star: use core collapse to model a neutron-star or black-hole remnant and ejecta.':body.type==='blackhole'?'Physical event-horizon radius grows directly with mass. Gravity here is Newtonian.':'Mass changes gravity. Gaseous objects cross approximate brown-dwarf and star thresholds; they do not directly become neutron stars.';
  const factor=isGalaxy()?LY_AU:1;$('position-unit').textContent=isGalaxy()?'ly':'AU';
  const limit=Math.max(isGalaxy()?60000:.0001,(preset.scale||1)/factor,Math.max(...sim.bodies.flatMap(b=>Object.values(b.position).map(x=>Math.abs(x)/factor)))*1.2);
  for(const axis of ['x','y','z']){
    const input=$('pos-'+axis),value=body.position[axis]/factor;
    input.min=-limit;input.max=limit;input.step=Math.max(limit/1000000,1e-12);input.disabled=isGalaxy();
    if(!editing)input.value=value;$('pos-'+axis+'-value').textContent=number(value,4);
  }
  $('velocity-value').textContent=number(Math.hypot(...Object.values(body.velocity))*4.74047,3)+' km/s';
}
function selectBody(id){
  const body=sim.bodies.find(b=>b.id===id);if(!body)return;selectedId=id;bodySignature='';refreshBodyList();setDefaultUnit(body);scene?.setSelected(id);
  const orb=document.querySelector('.body-orb');orb.style.backgroundImage=body.type==='blackhole'?'radial-gradient(circle,#000 40%,#ffc28c 48%,#805c9b 61%,#071421 73%)':TEXTURES[body.texture]?`url("${TEXTURES[body.texture]}")`:`radial-gradient(circle at 30% 25%,#fff9,${body.color||'#72b8ec'} 40%,#091221 85%)`;refreshInspector();
}
function loadPreset(id,{announce=true}={}){
  preset=PRESETS.find(p=>p.id===id)||PRESETS[0];sim.setBodies(preset.create());galaxyYears=0;galaxyYearsPerSecond=1e6;seenEvents=new WeakSet();bodySignature='';
  paused=false;editing=false;scene.loadBodies(sim.bodies,preset);scene.setSizeMode($('size-mode').value);scene.field=$('field-toggle').checked;
  selectedId=preset.selectedId||sim.bodies[0]?.id;selectBody(selectedId);updatePause();
  document.querySelectorAll('[data-preset]').forEach(button=>{const active=button.dataset.preset===preset.id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  $('model-name').textContent=preset.name;$('model-caption').textContent=preset.description;$('model-kicker').textContent=preset.kicker;
  document.querySelector('.scenario-details').open=false;document.querySelector('.intro-panel').scrollTop=0;$('body-tray').open=false;document.querySelector('.inspector-panel').scrollTop=0;
  $('model-context').textContent=isGalaxy()?'GALACTIC OVERVIEW':'MILKY WAY · LOCAL N-BODY MODEL';
  $('galaxy-note').hidden=!isGalaxy();$('explore-solar-button').hidden=!isGalaxy();$('galaxy-button').hidden=isGalaxy();
  $('scale-note').textContent=isGalaxy()?'Actual AU / light-year conversion. Star points represent a sample; their markers are not physical stellar disks.':$('size-mode').value==='true'?'Surfaces and distances share one scale. Markers make tiny objects selectable.':'Every physical surface is enlarged by the same 20× factor. Contact detection still uses real radii.';
  daysPerSecond=preset.daysPerSecond??(preset.id==='earth-moon'?1:preset.id==='collision-lab'?.05:30);
  $('speed-slider').value=isGalaxy()?75:(Math.log10(daysPerSecond)+4)/8*100;updateSpeed();
  $('event-card').hidden=true;clearTimeout(eventTimer);
  try{history.replaceState(null,'','#'+preset.id);}catch{}
  if(announce)notify(preset.name+' loaded. True scale keeps physical proportions intact.');
  updateUI(performance.now());resetIdle();
}
function addObject(kind,position=null,{center=false}={}){
  if(isGalaxy()){notify('Enter the Solar System to add individually simulated objects. The galaxy uses representative stars.');return;}
  if(sim.bodies.length>=64){notify('64-body limit reached. Remove an object to keep interaction smooth.');return;}
  const template=createBodyTemplate(kind),primary=currentBody()||largestBody();if(!primary)return;
  const radius=Math.max((primary.radius+template.radius)*8,primary.mass<.01?.00256956*Math.cbrt((primary.mass+template.mass)/EARTH_MASS):1.4*Math.cbrt(primary.mass+template.mass));
  const angle=-Math.PI/3+counter*.71;
  position=center?{x:0,y:0,z:0}:position||{x:primary.position.x+radius*Math.cos(angle),y:primary.position.y,z:primary.position.z+radius*Math.sin(angle)};
  counter++;const body=sim.addBody({...template,id:'custom-'+kind+'-'+counter,name:template.name+' '+counter,position,velocity:{...primary.velocity},hostId:primary.id});
  let orbit=false;
  if(!center&&$('spawn-mode').value==='orbit')try{sim.circularizeOrbit(body.id,primary.id);orbit=true;}catch{}
  scene.syncBodies(sim.bodies,sim.time,false);selectBody(body.id);
  notify(body.name+' added'+(orbit?' with orbital speed around '+primary.name:'. Gravity will determine its motion')+'. Drag it to reposition.');
}
function removeBody(id=selectedId){
  if(sim.bodies.length<=1){notify('Keep one body in this model. Add another before removing it.');return;}
  const body=sim.bodies.find(b=>b.id===id);if(!body)return;sim.removeBody(id);scene.syncBodies(sim.bodies,sim.time,false);selectedId=sim.bodies[0]?.id;selectBody(selectedId);notify(body.name+' removed. Every remaining body still gravitates.');
}
function setMass(mass){
  if(isGalaxy())return;
  if(!Number.isFinite(mass)||mass<=0||mass>1e10){notify('Mass must be greater than zero and no more than 10 billion Suns.');$('mass-value').value=String(Number((currentBody().mass/unit().mass).toPrecision(7)));refreshInspector();return;}
  try{const body=sim.setMass(selectedId,mass);scene.syncBodies(sim.bodies,sim.time,false);bodySignature='';refreshBodyList();refreshInspector();processEvents();notify(body.name+' · '+formatMass(mass)+'. Use Set circular orbit if you want to reset an orbit.');}
  catch(error){$('mass-value').value=String(Number((currentBody().mass/unit().mass).toPrecision(7)));refreshInspector();notify(error.message);}
}
function processEvents(){
  for(const event of sim.events){
    if(seenEvents.has(event))continue;seenEvents.add(event);scene.showEvent(event);
    const resultId=event.resultId||event.bodyId;
    if(resultId&&sim.bodies.some(b=>b.id===resultId))selectBody(resultId);
    $('event-title').textContent=event.message||'A new remnant formed';
    const result=sim.bodies.find(b=>b.id===resultId);$('event-detail').textContent=result?formatMass(result.mass)+' · radius '+number(result.radius*AU_KM,1)+' km · '+(typeNames[result.type]||result.type):'Mass and momentum remain in the simulation.';
    $('event-card').hidden=false;clearTimeout(eventTimer);eventTimer=setTimeout(()=>$('event-card').hidden=true,6500);notify(event.message||'The system changed.',8000);
  }
}
function updateSpeed(){
  const position=Number($('speed-slider').value)/100;
  if(isGalaxy()){galaxyYearsPerSecond=10**(3+4*position);$('speed-value').textContent=number(galaxyYearsPerSecond/1e6,3)+' Myr / sec';}
  else{daysPerSecond=10**(-4+8*position);$('speed-value').textContent=daysPerSecond<.01?number(daysPerSecond*86400,2)+' sec / sec':number(daysPerSecond,2)+' days / sec';}
}
function updateUI(now){
  refreshBodyList();refreshInspector();$('zoom-value').textContent=distanceText(scene.distanceAU??scene.distance);
  $('time-value').textContent=isGalaxy()?number(galaxyYears/1e6,2)+' Myr':sim.time<1?number(sim.time*365.25,2)+' days':number(sim.time,2)+' years';
  $('scale-caption').textContent=isGalaxy()?'16,000 REPRESENTATIVE STARS':$('size-mode').value==='true'?'TRUE PHYSICAL SCALE':'20× SURFACES · REAL CONTACT RADII';
  if(now>noticeUntil)$('status').textContent=!isGalaxy()&&sim.lastAdvance.limited?'Close encounter · simulation slowed to keep controls responsive':paused?'Paused · edit an object, then press Play':isGalaxy()?'Representative Milky Way · smooth approximate disk, bulge and halo potential':'Every body gravitates · physical contacts merge mass and momentum';
  lastUI=now;
}
function frame(now){
  requestAnimationFrame(frame);const dt=Math.min(.06,Math.max(0,(now-lastTime)/1000));lastTime=now;if(document.hidden)return;
  try{
    if(!paused){if(isGalaxy())galaxyYears+=dt*galaxyYearsPerSecond;else sim.advance(dt*daysPerSecond/365.25,160);}
    if(isGalaxy())scene.setGalaxyTime(galaxyYears);
    scene.syncBodies(sim.bodies,isGalaxy()?galaxyYears:sim.time,!paused);processEvents();scene.render(dt);
    if(now-lastUI>180)updateUI(now);
    fpsFrames++;if(now-fpsStart>=1000){const fps=fpsFrames*1000/(now-fpsStart);fpsSamples.push(fps);if(fpsSamples.length>5)fpsSamples.shift();const average=fpsSamples.reduce((a,b)=>a+b,0)/fpsSamples.length;$('fps-value').textContent=Math.round(average)+' fps';$('fps-value').dataset.smooth=String(average>=54);if(now-lastAdapt>4000){scene.adapt(average);lastAdapt=now;}fpsFrames=0;fpsStart=now;}
  }catch(error){paused=true;updatePause();notify('Simulation paused: '+error.message,20000);console.error(error);}
}
function installControls(){
  const isViewerDrop=event=>event.dataTransfer?.types.includes('application/x-orbitlab-body')&&!event.target.closest?.('.intro-panel,.inspector-panel,.transport-bar,.topbar,dialog,#body-tray');
  window.addEventListener('dragover',event=>{if(isViewerDrop(event)){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
  window.addEventListener('drop',event=>{if(!isViewerDrop(event))return;event.preventDefault();document.body.classList.remove('is-adding-body');const point=scene.worldAt(event.clientX,event.clientY);if(point)addObject(event.dataTransfer.getData('application/x-orbitlab-body'),point);});
  $('body-select').addEventListener('change',event=>selectBody(event.target.value));
  $('pause-button').addEventListener('click',()=>{paused=!paused;updatePause();});$('restart-button').addEventListener('click',()=>loadPreset(preset.id));
  $('remove-body-button').addEventListener('click',()=>removeBody());
  for(const id of ['focus-button','closeup-button'])$(id).addEventListener('click',()=>{scene.focus(selectedId);notify('Following '+currentBody().name+' at physical scale. Scroll to change the view.');});
  $('fit-button').addEventListener('click',()=>scene.fit());$('zoom-in-button').addEventListener('click',()=>scene.zoom(.7));$('zoom-out-button').addEventListener('click',()=>scene.zoom(1.43));
  $('speed-slider').addEventListener('input',updateSpeed);
  for(const axis of ['x','y','z']){
    const input=$('pos-'+axis);input.addEventListener('pointerdown',beginEdit);input.addEventListener('keydown',event=>{if(event.key.startsWith('Arrow'))beginEdit();});
    input.addEventListener('input',event=>{beginEdit();const body=currentBody();if(body)displace(body.id,{...body.position,[axis]:Number(event.target.value)*(isGalaxy()?LY_AU:1)});});
    input.addEventListener('change',()=>{endEdit();notify('Position changed. Gravity is responding.');});input.addEventListener('blur',endEdit);
  }
  window.addEventListener('pointerup',()=>{if(editing)endEdit();});
  const commitMass=()=>{const mass=Number($('mass-value').value)*unit().mass;if(mass!==currentBody()?.mass)setMass(mass);};
  $('mass-unit').addEventListener('change',refreshInspector);$('mass-value').addEventListener('change',commitMass);$('mass-value').addEventListener('blur',commitMass);$('mass-value').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();commitMass();}});$('mass-slider').addEventListener('input',event=>setMass(10**(-18+27*Number(event.target.value)/100)));
  $('orbit-parent').addEventListener('change',event=>{if(currentBody())currentBody().inspectorParentId=event.target.value;});
  $('circularize-button').addEventListener('click',()=>{try{const parent=sim.bodies.find(b=>b.id===$('orbit-parent').value);sim.circularizeOrbit(selectedId,parent?.id);scene.clearTrails(selectedId);refreshInspector();notify(currentBody().name+' now has a circular-orbit starting speed around '+parent.name+'. Other bodies can still perturb it.');}catch(error){notify(error.message);}});
  $('collapse-button').addEventListener('click',()=>{try{sim.collapseStar(selectedId);scene.syncBodies(sim.bodies,sim.time,false);refreshBodyList();processEvents();selectBody(selectedId);}catch(error){notify(error.message);}});
  $('blackhole-button').addEventListener('click',()=>addObject('blackhole',null,{center:true}));
  $('nudge-button').addEventListener('click',()=>{
    const body=currentBody(),parent=sim.bodies.find(b=>b.id===$('orbit-parent').value);if(!body)return;const relative={x:body.velocity.x-(parent?.velocity.x||0),y:body.velocity.y-(parent?.velocity.y||0),z:body.velocity.z-(parent?.velocity.z||0)};const speed=Math.hypot(...Object.values(relative));const direction=$('nudge-direction').value;let vector=relative;
    if(direction==='outward')vector={x:body.position.x-(parent?.position.x||0),y:body.position.y-(parent?.position.y||0),z:body.position.z-(parent?.position.z||0)};if(direction==='upward')vector={x:0,y:1,z:0};const length=Math.hypot(...Object.values(vector));if(!length){notify('Set an orbital speed first, or choose Push upward.');return;}const factor=Math.max(speed,.001)*.15/length*(direction==='retrograde'?-1:1);for(const a of ['x','y','z'])vector[a]*=factor;sim.impulse(selectedId,vector);notify(body.name+' received a velocity nudge.');
  });
  for(const [id,property]of [['trails-toggle','trails'],['labels-toggle','labels'],['vectors-toggle','vectors'],['field-toggle','field']]){scene[property]=$(id).checked;$(id).addEventListener('change',event=>{scene[property]=event.target.checked;if(property==='field'&&event.target.checked)notify('Field arrows show the selected object’s gravity. All simulated bodies always exert gravity.');});}
  $('size-mode').addEventListener('change',()=>{scene.setSizeMode($('size-mode').value);$('scale-note').textContent=$('size-mode').value==='true'?'Surfaces and distances share one scale. Markers make tiny objects selectable.':'Every physical surface is enlarged by the same 20× factor. Contact detection still uses real radii.';});
  $('quality-select').addEventListener('change',event=>scene.setQuality(event.target.value));
  $('galaxy-button').addEventListener('click',()=>loadPreset('milky-way'));$('explore-solar-button').addEventListener('click',()=>loadPreset('solar'));
  const help=$('help-dialog');$('help-button').addEventListener('click',()=>help.showModal());help.addEventListener('click',event=>{if(event.target===help)help.close();});help.addEventListener('close',resetIdle);
  document.addEventListener('keydown',event=>{
    if(help.open||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    if(event.key==='Escape'){if(uiHidden)setUIHidden(false);else scene.fit();return;}
    if(event.key.toLowerCase()==='h'){setUIHidden(!uiHidden);return;}
    if(event.code==='Space'&&!['BUTTON','A','SUMMARY'].includes(document.activeElement?.tagName)){event.preventDefault();paused=!paused;updatePause();}
    if(event.key.toLowerCase()==='r')loadPreset(preset.id);if(event.key.toLowerCase()==='f')scene.focus(selectedId);
    if(event.key==='+'||event.key==='=')scene.zoom(.8);if(event.key==='-'||event.key==='_')scene.zoom(1.25);
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();removeBody();}
  });
  document.addEventListener('visibilitychange',()=>{lastTime=performance.now();fpsStart=lastTime;fpsFrames=0;});
}
try{
  if(innerWidth<981){document.querySelector('.scenario-details').open=false;document.querySelector('.inspector-details').open=false;}
  scene=new OrbitScene($('cosmos'),{onSelect:selectBody,onDisplace:displace,onDragStart:startBodyDrag,onDragEnd:finishBodyDrag,onExploreSolar:()=>loadPreset('solar')});
  buildMenus();installControls();loadPreset(location.hash.slice(1)||'solar',{announce:false});setupUIVisibility();requestAnimationFrame(frame);document.body.classList.add('is-ready');$('startup-message').remove();$('engine-state').textContent='ENGINE ONLINE';
}catch(error){console.error(error);$('engine-state').textContent='ENGINE OFFLINE';$('startup-message').textContent='The graphics engine could not start. Enable hardware acceleration and reload.';}
