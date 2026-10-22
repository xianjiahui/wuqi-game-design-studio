import {resolve,validateConfig,fits,SLOT_NAMES,GROUP_NAMES,RangeSimulation} from './core.js';
import {ArmoryScene} from './scene.js';
const $=id=>document.getElementById(id),format=(v,n=3)=>Number(v.toFixed(n)).toLocaleString('en-US',{maximumFractionDigits:n});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let config,r,sim,scene,view='bench',playing=false,freeMouse=false,selectedSlot=null,toastTimer,sound=false,audio;
let state={version:'prototype-0.1',gun:'G_AR01',builds:{},saved:{},trials:[]};
const key='armory-demo-v01';
const mainStats=[['damage','单弹丸伤害','点',1,150],['rpm','射速上限','RPM',1,1000],['ads_ms','开镜耗时','ms',-1,650],['recoil_v_deg','垂直后坐','°/发',-1,6],['recoil_h_deg','水平后坐','°/发',-1,1.6],['fire_sway_deg','开火据枪晃动','°',-1,.8],['ads_spread_deg','开镜扩散半角','°',-1,3],['capacity','弹匣容量','发',1,100]];
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4200);}
function persist(){try{localStorage.setItem(key,JSON.stringify(state));}catch{toast('浏览器无法保存，当前配装仍可体验。');}}
function fresh(){return {version:config.version,gun:'G_AR01',builds:{},saved:{},trials:[]};}
function load(){
  try{const raw=JSON.parse(localStorage.getItem(key));if(raw?.version===config.version){
    if(!config.guns.some(g=>g.id===raw.gun))throw Error('gun');
    for(const [g,slots]of Object.entries(raw.builds??{}))resolve(config,g,slots);
    for(const s of Object.values(raw.saved??{}))resolve(config,s.gun,s.slots);
    state={...fresh(),...raw,trials:Array.isArray(raw.trials)?raw.trials.slice(-8):[]};
  }else state=fresh();}catch{state=fresh();toast('旧存档不兼容，已加载空槽基线。');}
}
function refreshWeapon(reset=true){
  r=resolve(config,state.gun,state.builds[state.gun]??{});
  if(sim){sim.configure(r,reset);scene?.clearPaper();}else sim=new RangeSimulation(r,config.modes);
  scene?.setWeapon(r);renderUi();persist();
}
function guard(){if(playing){toast('请先按 Esc 离开试射，再修改装配。');return false;}if(sim.reloadUntil>sim.time){toast('换弹结束后才能改装。');return false;}return true;}
function renderUi(){
  $('gunSelect').value=r.gun.id;$('gunRole').textContent=`${r.gun.typeName} · ${r.gun.role}`;
  $('weaponTitle').textContent=r.gun.name;$('weaponRef').textContent=`${r.gun.typeName} / ${r.gun.reference}`;$('stageIndex').querySelector('strong').textContent=String(config.guns.indexOf(r.gun)+1).padStart(2,'0');
  $('modeChip').textContent=`${r.mode} / ${config.modes[r.mode].name}`;
  $('slots').innerHTML=r.gun.slots.map((slot,i)=>{const a=config.attachments.find(a=>a.id===r.slots[slot]);return `<button class="slot ${slot===selectedSlot?'selected':''}" data-slot="${slot}" aria-label="${SLOT_NAMES[slot]}：${a?.name??'空槽'}"><span class="slot-no">0${i+1}</span><span><small>${SLOT_NAMES[slot]}</small><strong>${a?.name??'空槽 / 基础状态'}</strong></span><span class="chevron">＋</span></button>`;}).join('');
  $('presetSelect').innerHTML='<option value="">选择一套示例配装…</option><option value="empty">空槽基线</option>'+config.presets.filter(p=>p.gun===state.gun&&p.id!=='B00').map(p=>`<option value="${p.id}">${p.id} · ${p.name}</option>`).join('');
  $('stats').innerHTML=mainStats.map(([id,label,unit,dir,max])=>{const v=r.stats[id],base=r.gun.base[id],delta=v-base,good=delta*dir>0;return `<div class="stat"><div class="stat-label"><span>${label}</span><b>${format(v)} <small>${unit}</small></b></div><div class="stat-track"><div class="stat-fill" style="width:${Math.min(100,v/max*100)}%"></div></div><div class="stat-change ${Math.abs(delta)>1e-8?(good?'good':'bad'):''}">${Math.abs(delta)>1e-8?`${good?'改善':'代价'} ${delta>0?'+':''}${format(delta)} · `:''}基线 ${format(base)}</div></div>`;}).join('');
  $('groupStats').innerHTML=Object.entries(GROUP_NAMES).map(([g,label])=>`<div class="group">${label}<strong>${r.groups[g]>0?'+':''}${r.groups[g]??0}</strong></div>`).join('');
  $('traceRows').innerHTML=r.trace.map(t=>{const c=config.channels.find(c=>c.id===t.id);return `<tr><td>${c.name}<br><span class="muted">${t.id}</span></td><td>${t.p}</td><td>${t.k}</td><td>${t.o}</td><td>${format(t.x)}</td><td class="${t.r>0?'good':t.r<0?'bad':''}">${format(t.r*100,2)}%</td><td>${format(t.base)}</td><td>${format(t.value,5)} ${c.unit}</td></tr>`;}).join('');
  renderSaved();renderTrials();if(selectedSlot)renderPicker(selectedSlot);
}
function renderPicker(slot){
  if(!r.gun.slots.includes(slot)){selectedSlot=null;$('partPicker').hidden=true;return;}
  $('partPicker').hidden=false;$('pickerTitle').textContent=`${SLOT_NAMES[slot]} · 选择配件`;
  const list=[null,...config.attachments.filter(a=>fits(r.gun,a,slot))];
  $('partList').innerHTML=list.map(a=>{
    const slots={...r.slots};if(a)slots[slot]=a.id;else delete slots[slot];const next=resolve(config,r.gun.id,slots);
    const changes=mainStats.filter(([id])=>Math.abs(next.stats[id]-r.stats[id])>1e-8).map(([id,label,unit,dir])=>{const delta=next.stats[id]-r.stats[id];return `<span class="${delta*dir>0?'good':'bad'}">${label} ${format(r.stats[id])} → ${format(next.stats[id])}${unit}</span>`;});
    const groups={};for(const [ch,p]of Object.entries(a?.points??{})){const c=config.channels.find(c=>c.id===ch);groups[c.group]=(groups[c.group]??0)+p;}
    const tags=Object.entries(groups).map(([g,p])=>`${GROUP_NAMES[g]} ${p>0?'+':''}${p}`).join(' / '),active=(r.slots[slot]??null)===(a?.id??null);
    return `<article class="part ${active?'active':''}"><h3>${a?.name??'空槽'}</h3><div class="tags">${tags||'恢复该槽的基础状态'}${Object.values(a?.points??{}).some(p=>p<0)?' · 含代价':''}</div><ul>${Object.entries(a?.points??{}).map(([ch,p])=>`<li>${config.channels.find(c=>c.id===ch).name} ${p>0?'+':''}${p}</li>`).join('')||'<li>移除当前配件的全部贡献与机制</li>'}${a?.mode?`<li>射击模式：${a.mode}</li>`:''}${a?.zoom?`<li>瞄具倍率：${a.zoom}×</li>`:''}</ul><div class="diff">${changes.join('<br>')||'主要属性无变化'}${next.mode!==r.mode?`<br>射击模式 ${r.mode} → ${next.mode}`:''}</div><button data-part="${a?.id??''}" ${active?'disabled':''}>${active?'当前装配':a?'确认安装':'确认卸下'}</button></article>`;
  }).join('');
}
function renderSaved(){
  $('savedBuilds').innerHTML=['A','B'].map(k=>{const s=state.saved[k];return `<div class="saved-item"><span>${k} / ${s?config.guns.find(g=>g.id===s.gun).name:'尚未保存'}</span>${s?`<button data-load="${k}">载入</button>`:''}</div>`;}).join('');
  const resolved=['A','B'].map(k=>state.saved[k]?resolve(config,state.saved[k].gun,state.saved[k].slots):null);
  $('compareBuilds').innerHTML=`<div class="compare-grid">${['A','B'].map((k,i)=>{const v=resolved[i];return `<div class="compare-card">${v?`<button data-load="${k}">载入配装</button>`:''}<strong>配装 ${k} / ${v?.gun.name??'待保存'}</strong><small>${v?v.parts.map(a=>a.name).join(' · ')||'全部空槽':'先在工作台保存一套配装'}</small>${v?`${v.mode} · 开镜 ${format(v.stats.ads_ms)}ms · 垂直 ${format(v.stats.recoil_v_deg)}° · 扩散 ${format(v.stats.ads_spread_deg)}°`:''}</div>`;}).join('')}</div>`;
}
function renderTrials(){
  $('trialList').innerHTML=state.trials.length?state.trials.slice().reverse().map(t=>`<article class="trial"><strong>${esc(t.name)} · ${esc(t.mode)} · ${t.distance} m</strong>${esc(t.parts||'空槽基线')}<br><br>${t.shots} 发 / ${t.pellets} 弹丸 · 命中 ${format(t.rate*100,1)}%<br>伤害 ${format(t.damage,1)} · 首末发 ${format(t.seconds,2)}s<br><span class="tiny">种子 ${t.seed} · ${esc(t.time)}</span></article>`).join(''):'<p class="muted">保存两套配装，在相同靶距分别试射，再记录成绩。</p>';
}
function setView(v){
  if(playing)stop();view=v;scene?.setView(v);$('benchTab').classList.toggle('active',v==='bench');$('rangeTab').classList.toggle('active',v==='range');$('benchTab').setAttribute('aria-selected',v==='bench');$('rangeTab').setAttribute('aria-selected',v==='range');
  for(const id of ['stageTitle','stageIndex','benchHint'])$(id).hidden=v!=='bench';$('rangeOverlay').hidden=v!=='range';$('rangeHud').hidden=v!=='range';
  $('reticle').hidden=true;$('playHelp').hidden=true;
}
function stop(){
  playing=false;freeMouse=false;sim.trigger(false);sim.pending=0;sim.adsWanted=false;document.body.classList.remove('immersive');if(document.pointerLockElement)document.exitPointerLock();$('rangeOverlay').hidden=view!=='range';$('reticle').hidden=true;$('playHelp').hidden=true;scene?.resize();
}
async function start(){
  if(!scene){toast('当前设备无法启用 WebGL 2，请使用支持 3D 的桌面浏览器。');return;}
  try{await $('scene').requestPointerLock();activate(false);}catch{activate(true);toast('锁定鼠标不可用：已进入窗口试射。移动鼠标瞄准，Esc返回。');}
}
function activate(free){playing=true;freeMouse=free;$('rangeOverlay').hidden=true;$('reticle').hidden=false;$('playHelp').hidden=false;if(!free)document.body.classList.add('immersive');scene.resize();sim.readyUntil=sim.time+r.stats.ready_ms/1000;sim.nextShot=Math.max(sim.nextShot,sim.readyUntil);}
function reset(){sim.reset();scene?.clearPaper();$('hitMarker').hidden=true;updateHud();}
function shotSound(){if(!sound)return;try{audio??=new AudioContext();audio.resume();const o=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter();o.type='sawtooth';o.frequency.setValueAtTime(130,audio.currentTime);o.frequency.exponentialRampToValueAtTime(35,audio.currentTime+.07);filter.type='lowpass';filter.frequency.value=1100;gain.gain.setValueAtTime(.13,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.1);o.connect(filter);filter.connect(gain);gain.connect(audio.destination);o.start();o.stop(audio.currentTime+.11);}catch{sound=false;}}
function updateHud(){
  const m=sim.metrics();$('shots').textContent=m.shots;$('hitRate').textContent=m.pellets?format(m.rate*100,1)+'%':'—';$('damage').textContent=format(m.damage,1);$('elapsed').textContent=format(m.seconds,2)+' s';
  $('hudMode').textContent=`${r.gun.name} / ${r.mode}`;$('hudInfo').textContent=`${sim.distance} m · ${sim.ads>.9?'开镜':'腰射'} · 命中 ${m.hits}/${m.pellets}`;$('hudAmmo').textContent=sim.ammo;$('hudCapacity').textContent='/ '+r.stats.capacity;
  $('hudStatus').textContent=sim.reloadUntil>sim.time?`换弹 ${Math.max(0,sim.reloadUntil-sim.time).toFixed(1)}s`:sim.time<sim.readyUntil?'举枪中':sim.ammo===0?'弹匣已空 · R换弹':sim.adsWanted&&sim.ads<1?'开镜中':'就绪';
}
async function init(){
  const res=await fetch('./config.json');if(!res.ok)throw Error('无法加载枪械配置');config=await res.json();validateConfig(config);load();
  $('gunSelect').innerHTML=config.guns.map(g=>`<option value="${g.id}">${g.name} · ${g.typeName}</option>`).join('');
  try{scene=new ArmoryScene($('scene'));$('loading').hidden=true;}catch(e){$('loading').textContent='3D渲染不可用。请用开启硬件加速的 Chrome / Edge 打开。';console.error(e);}
  refreshWeapon();bind();let last=performance.now(),hudTime=0;
  function tick(now){const dt=Math.min(.05,(now-last)/1000);last=now;
    // Pause the whole simulation while hidden; no stale held inputs on resume.
    if(!document.hidden){for(const ev of sim.step(dt)){scene?.shot(ev);shotSound();if(ev.impacts.some(i=>i.hit)){$('hitMarker').hidden=false;setTimeout(()=>$('hitMarker').hidden=true,110);}}scene?.render(sim);if(now-hudTime>90){updateHud();hudTime=now;}}
    requestAnimationFrame(tick);
  }requestAnimationFrame(tick);
}
function bind(){
  $('gunSelect').onchange=()=>{if(!guard()){$('gunSelect').value=state.gun;return;}state.gun=$('gunSelect').value;selectedSlot=null;$('partPicker').hidden=true;refreshWeapon();};
  $('slots').onclick=e=>{const b=e.target.closest('[data-slot]');if(!b||!guard())return;selectedSlot=b.dataset.slot;renderUi();$('partPicker').scrollIntoView({behavior:'smooth',block:'nearest'});};
  $('closePicker').onclick=()=>{selectedSlot=null;$('partPicker').hidden=true;renderUi();};
  $('partList').onclick=e=>{const b=e.target.closest('[data-part]');if(!b||!guard())return;const slots={...r.slots};if(b.dataset.part)slots[selectedSlot]=b.dataset.part;else delete slots[selectedSlot];try{resolve(config,state.gun,slots);state.builds[state.gun]=slots;refreshWeapon(false);toast('装配已更新，试射统计已清空；保留剩余弹药。');}catch(err){toast(err.message);}};
  $('clearBuild').onclick=()=>{if(!guard())return;state.builds[state.gun]={};refreshWeapon(false);toast('全部卸下，恢复空槽基线。');};
  $('presetSelect').onchange=()=>{if(!guard())return;const id=$('presetSelect').value;if(!id)return;state.builds[state.gun]=id==='empty'?{}:{...config.presets.find(p=>p.id===id).slots};refreshWeapon(false);toast('示例配装已载入。试射前可重置弹药和靶纸。');};
  for(const k of ['A','B'])$('save'+k).onclick=()=>{state.saved[k]={gun:state.gun,slots:{...r.slots}};persist();renderSaved();toast(`配装 ${k} 已保存。`);};
  document.addEventListener('click',e=>{const b=e.target.closest('[data-load]');if(!b||!guard())return;const s=state.saved[b.dataset.load];state.gun=s.gun;state.builds[state.gun]={...s.slots};selectedSlot=null;$('partPicker').hidden=true;refreshWeapon(false);toast(`已载入配装 ${b.dataset.load}。`);});
  $('benchTab').onclick=()=>setView('bench');$('rangeTab').onclick=()=>setView('range');$('enterRange').onclick=()=>{setView('range');$('stage').scrollIntoView({behavior:'smooth',block:'center'});};$('startFire').onclick=start;
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==$('scene')&&playing&&!freeMouse)stop();});
  $('scene').oncontextmenu=e=>e.preventDefault();
  let drag=null;
  $('scene').addEventListener('pointerdown',e=>{if(view==='bench'){drag=e.clientX;$('scene').setPointerCapture(e.pointerId);}});
  // Mouse events handle button chords: pointerdown fires only for the first held button.
  $('scene').addEventListener('mousedown',e=>{if(view==='range'&&playing){if(e.button===0)sim.trigger(true);if(e.button===2)sim.adsWanted=true;e.preventDefault();}});
  window.addEventListener('mouseup',e=>{drag=null;if(e.button===0)sim.trigger(false);if(e.button===2)sim.adsWanted=false;});
  document.addEventListener('mousemove',e=>{if(playing&&(document.pointerLockElement===$('scene')||(freeMouse&&e.target===$('scene')))){const adsScale=1+(1/(r.zoom>1?r.zoom:1.65)-1)*sim.ads;sim.aim(-e.movementX*.0017*adsScale,-e.movementY*.0017*adsScale);}else if(view==='bench'&&drag!==null&&scene){scene.spin+=(e.clientX-drag)*.008;drag=e.clientX;}});
  $('scene').addEventListener('wheel',e=>{if(view==='bench'&&scene){e.preventDefault();scene.zoom=Math.max(2.1,Math.min(4.8,scene.zoom+e.deltaY*.002));}},{passive:false});
  window.addEventListener('keydown',e=>{if(e.code==='Escape'){if(playing)stop();return;}if(!playing)return;if(e.code==='KeyR'){sim.reload();e.preventDefault();}if(e.code==='KeyT'){reset();toast('靶纸、姿态、弹药与随机种子已重置。');e.preventDefault();}});
  window.addEventListener('blur',()=>{if(playing)stop();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)stop();});
  $('distanceButtons').onclick=e=>{const b=e.target.closest('[data-distance]');if(!b||playing)return;sim.distance=Number(b.dataset.distance);scene?.setDistance(sim.distance);reset();document.querySelectorAll('[data-distance]').forEach(el=>el.classList.toggle('active',el===b));};
  $('resetRange').onclick=()=>{reset();toast('本轮重置，已补满弹匣。');};$('soundBtn').onclick=()=>{sound=!sound;$('soundBtn').textContent=`声音：${sound?'开':'关'}`;$('soundBtn').setAttribute('aria-pressed',sound);if(sound){audio??=new AudioContext();audio.resume();}};
  $('recordTrial').onclick=()=>{const m=sim.metrics();if(!m.shots){toast('先进入靶场完成一轮试射。');return;}state.trials.push({...m,name:r.gun.name,mode:r.mode,parts:r.parts.map(a=>a.name).join(' · '),slots:{...r.slots},time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})});state.trials=state.trials.slice(-8);persist();renderTrials();toast('本轮成绩已记录。');};
  $('clearTrials').onclick=()=>{state.trials=[];persist();renderTrials();};
  $('traceToggle').onclick=()=>{$('tracePanel').hidden=!$('tracePanel').hidden;$('traceToggle').textContent=$('tracePanel').hidden?'展开收益计算 ↓':'收起收益计算 ↑';if(!$('tracePanel').hidden)$('tracePanel').scrollIntoView({behavior:'smooth',block:'nearest'});};
  $('helpBtn').onclick=()=>$('helpDialog').showModal();$('closeHelp').onclick=()=>$('helpDialog').close();
}
init().catch(e=>{$('loading').hidden=false;$('loading').textContent=`启动失败：${e.message}。请通过本地启动器或网页地址访问。`;console.error(e);});
