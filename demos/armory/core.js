export const SLOT_NAMES={BARREL:'枪管',FOREGRIP:'前握把',REARGRIP:'后握把',STOCK:'枪托',OPTIC:'瞄准镜'};
export const GROUP_NAMES={RECOIL:'后坐',HANDLING:'据枪',SPREAD:'扩散',DAMAGE:'伤害',RATE:'节奏',SUPPLY:'供弹'};
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function response(x,c){
  if(!c || !(c.threshold>0 && c.gain>0 && c.gain<c.cap && c.cap<1 && c.negativeSlope>=0 && c.negativeCap>=0 && c.negativeCap<1)) throw Error('收益曲线参数非法');
  if(x<0)return -Math.min(-x*c.negativeSlope,c.negativeCap);
  const s=c.gain/c.threshold;
  return x<=c.threshold?s*x:c.gain+(c.cap-c.gain)*(1-Math.exp(-s*(x-c.threshold)/(c.cap-c.gain)));
}
export function fits(g,a,slot){return !!g && !!a && g.slots.includes(slot)&&a.slot===slot&&(a.scope==='ALL'||(a.scope==='TYPE'&&a.targets.includes(g.type))||(a.scope==='GUN'&&a.targets.includes(g.id)));}
export function resolve(config,gunId,slots={}){
  const gun=config.guns.find(g=>g.id===gunId);if(!gun)throw Error('未知枪械');
  let mode=gun.mode,zoom=1,modeCount=0;const parts=[];
  for(const [slot,id] of Object.entries(slots)){
    if(!id)continue;const a=config.attachments.find(a=>a.id===id);
    if(!fits(gun,a,slot))throw Error(`${SLOT_NAMES[slot]||slot}：配件不适配`);
    parts.push(a);if(a.mode){mode=a.mode;modeCount++;}if(slot==='OPTIC')zoom=a.zoom??1;
  }
  if(modeCount>1)throw Error('射击机制冲突');if(!config.modes[mode])throw Error('未知射击模式');
  const stats={...gun.base},trace=[],groups={};
  for(const ch of config.channels){
    const base=gun.base[ch.stat],k=config.typeK[`${gun.type}|${ch.id}`],o=config.gunK[`${gun.id}|${ch.id}`]??1;
    if(!Number.isFinite(base)||base<ch.min||base>ch.max)throw Error(`基础参数非法：${ch.stat}`);
    if(!Number.isFinite(k)||k<0||!Number.isFinite(o)||o<0)throw Error(`系数非法：${ch.id}`);
    const p=parts.reduce((s,a)=>s+(a.points[ch.id]??0),0),x=p*k*o,r=response(x,config.curves[ch.curve]);
    let raw=base*(1+ch.direction*r),value=clamp(raw,ch.min,ch.max);
    if(ch.round==='FLOOR')value=Math.floor(value);stats[ch.stat]=value;
    groups[ch.group]=(groups[ch.group]??0)+p;
    trace.push({id:ch.id,stat:ch.stat,base,p,k,o,x,r,raw,value,clipped:raw!==clamp(raw,ch.min,ch.max)});
  }
  return {gun,slots:{...slots},stats,trace,groups,mode,zoom,parts};
}
export function validateConfig(c){
  for(const [key,items] of [['枪械',c.guns],['配件',c.attachments],['通道',c.channels]]){
    const ids=new Set();for(const item of items){if(ids.has(item.id))throw Error(`${key}ID重复`);ids.add(item.id);}
  }
  const stats=new Set();for(const ch of c.channels){if(stats.has(ch.stat))throw Error('真实参数重复所有者');stats.add(ch.stat);response(0,c.curves[ch.curve]);}
  for(const a of c.attachments){
    for(const [id,v]of Object.entries(a.points))if(!c.channels.some(ch=>ch.id===id)||!Number.isFinite(v))throw Error('配件通道非法');
    if(!Object.hasOwn(SLOT_NAMES,a.slot)||!['ALL','TYPE','GUN'].includes(a.scope))throw Error('配件适配配置非法');
    if(a.scope!=='ALL'&&(!a.targets.length||a.targets.some(t=>!c.guns.some(g=>(a.scope==='TYPE'?g.type:g.id)===t))))throw Error('适配目标非法');
    if(a.mode&&!c.modes[a.mode])throw Error('配件模式不存在');
  }
  for(const g of c.guns){
    resolve(c,g.id);if(!(g.base.falloff_end_m>g.base.falloff_start_m&&g.base.min_damage_ratio>=0&&g.base.min_damage_ratio<=1&&Number.isInteger(g.base.pellets)&&g.base.pellets>=1))throw Error('固有参数非法');
  }
  for(const p of c.presets)resolve(c,p.gun,p.slots);return true;
}
export function random(seed,shot,stream,index=0){
  let x=(seed^Math.imul(shot+1,0x9e3779b1)^Math.imul(stream+1,0x85ebca6b)^Math.imul(index+1,0xc2b2ae35))>>>0;
  x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;
  return (x>>>0)/4294967296;
}
const rad=Math.PI/180;
export function aimDirection(yaw,pitch){return [-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];}
function coneDirection(yaw,pitch,angle,u,v){
  // Uniform solid-angle sampling; independent spread stream per pellet.
  const f=aimDirection(yaw,pitch),right=[Math.cos(yaw),0,-Math.sin(yaw)],up=[Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),Math.cos(yaw)*Math.sin(pitch)];
  const ct=1-u*(1-Math.cos(angle)),st=Math.sqrt(Math.max(0,1-ct*ct)),phi=v*Math.PI*2;
  return f.map((n,i)=>n*ct+right[i]*st*Math.cos(phi)+up[i]*st*Math.sin(phi));
}
export function targetHit(direction,distance){
  if(direction[2]>=-0.0001)return {hit:false,x:99,y:99};
  const t=-distance/direction[2],x=direction[0]*t,y=direction[1]*t;
  // Paper silhouette: torso plus head; coordinates relative to eye height.
  const torso=Math.abs(x)<=.48&&y>=-.9&&y<=.4,head=(x/.23)**2+((y-.64)/.26)**2<=1;
  return {hit:torso||head,x,y};
}
export class RangeSimulation{
  constructor(resolved,modes,{seed=2026,distance=30}={}){this.modes=modes;this.seed=seed;this.distance=distance;this.configure(resolved,true);}
  configure(r,reset=false){
    this.resolved=r;this.s=r.stats;
    if(reset)this.reset();else{const ammo=Math.min(this.ammo,this.s.capacity);this.reset();this.ammo=ammo;}
  }
  reset(){this.time=0;this.ammo=this.s.capacity;this.nextShot=0;this.readyUntil=this.s.ready_ms/1000;this.reloadUntil=0;this.held=false;this.pending=0;this.adsWanted=false;this.ads=0;this.yaw=0;this.pitch=0;this.targetYaw=0;this.targetPitch=0;this.recoilX=0;this.recoilY=0;this.recovery=0;this.spread=0;this.lastShot=-100;this.chain=0;this.shots=0;this.pellets=0;this.hits=0;this.damage=0;this.impacts=[];this.firstShot=null;this.lastEvent=null;}
  get busy(){return this.reloadUntil>this.time||this.held||this.pending>0||this.time<this.nextShot;}
  trigger(down){
    const edge=down&&!this.held;this.held=down;if(!edge)return;
    if(this.reloadUntil>this.time||this.time<this.readyUntil||this.time+1e-8<this.nextShot||this.ammo<=0||this.pending)return;
    if(this.resolved.mode!=='AUTO'){this.pending=this.modes[this.resolved.mode].count;this.nextShot=this.time;}
  }
  reload(){if(this.reloadUntil>this.time||this.ammo===this.s.capacity)return false;this.reloadUntil=this.time+this.s.reload_ms/1000;this.pending=0;this.held=false;return true;}
  aim(dx,dy){this.targetYaw+=dx;this.targetPitch=clamp(this.targetPitch+dy,-1.1,1.1);}
  sway(){const t=this.time,f=this.s.sway_hz*Math.PI*2,fire=Math.exp(-Math.max(0,t-this.lastShot)*5)*this.s.fire_sway_deg;return {x:rad*(Math.sin(t*f)*this.s.idle_sway_deg+Math.sin(t*f*2.7+1.3)*fire),y:rad*(Math.sin(t*f*.83+.7)*this.s.idle_sway_deg+Math.sin(t*f*3.1+.2)*fire)};}
  orientation(){const w=this.sway();return {yaw:this.yaw+this.recoilX*rad+w.x,pitch:clamp(this.pitch+this.recoilY*rad+w.y,-85*rad,85*rad)};}
  step(dt){
    dt=clamp(dt,0,.05);this.time+=dt;
    const turn=this.s.turn_dps*rad*dt;this.yaw+=clamp(this.targetYaw-this.yaw,-turn,turn);this.pitch+=clamp(this.targetPitch-this.pitch,-turn,turn);
    this.ads=clamp(this.ads+(this.adsWanted?1:-1)*dt/(this.s.ads_ms/1000),0,1);
    if(this.reloadUntil&&this.time>=this.reloadUntil){this.ammo=this.s.capacity;this.reloadUntil=0;}
    if(this.time-this.lastShot>this.s.recoil_delay_ms/1000){
      const len=Math.hypot(this.recoilX,this.recoilY),amount=Math.min(len,this.s.recoil_recover_dps*dt,this.recovery);
      if(len>0){this.recoilX*=1-amount/len;this.recoilY*=1-amount/len;}this.recovery-=amount;this.chain=0;
    }
    this.spread=Math.max(0,this.spread-this.s.spread_recover_dps*dt);
    const events=[];if(this.time<this.readyUntil||this.reloadUntil>this.time||this.ammo<=0)return events;
    const active=()=>this.resolved.mode==='AUTO'?this.held:this.pending>0;
    if(active()&&this.nextShot<this.time-dt)this.nextShot=this.time;
    while(active()&&this.time+1e-8>=this.nextShot&&this.ammo>0&&events.length<8){
      const when=this.nextShot;events.push(this.fire(when));
      const interval=Math.max(60/this.s.rpm,this.modes[this.resolved.mode].manual?this.s.manual_cycle_ms/1000:0);
      this.nextShot=when+interval;
      if(this.resolved.mode!=='AUTO'){
        this.pending--;if(this.pending===0&&this.resolved.mode==='BURST')this.nextShot=when+Math.max(interval,this.modes.BURST.gap/1000);
      }
      if(this.ammo===0)this.pending=0;
    }
    return events;
  }
  fire(when){
    const {yaw,pitch}=this.orientation(),spread=this.s.hip_spread_deg*(1-this.ads)+this.s.ads_spread_deg*this.ads+this.spread;
    const event={index:this.shots,time:when,impacts:[],yaw,pitch,spread};
    for(let i=0;i<this.s.pellets;i++){
      const dir=coneDirection(yaw,pitch,spread*rad,random(this.seed,this.shots,1,i*2),random(this.seed,this.shots,1,i*2+1)),hit=targetHit(dir,this.distance);
      const falloff=clamp((this.distance-this.s.falloff_start_m)/(this.s.falloff_end_m-this.s.falloff_start_m),0,1);
      const damage=hit.hit?this.s.damage*(1-falloff*(1-this.s.min_damage_ratio)):0;
      event.impacts.push({...hit,dir,damage});this.pellets++;if(hit.hit)this.hits++;this.damage+=damage;
    }
    this.ammo--;this.firstShot??=when;this.shots++;this.lastShot=when;this.lastEvent=event;
    const mult=Math.min(1+this.chain*this.s.recoil_accum_per_shot,this.s.recoil_accum_cap);
    this.recoilY=Math.min(this.recoilY+this.s.recoil_v_deg*mult,85-this.pitch/rad);this.recoilX+=(random(this.seed,event.index,0)*2-1)*this.s.recoil_h_deg*mult;
    this.recovery=Math.min(Math.hypot(this.recoilX,this.recoilY),this.s.return_cap_deg);
    this.spread=Math.min(this.s.spread_add_cap_deg,this.spread+this.s.spread_add_deg);this.chain++;
    this.impacts.push(...event.impacts);if(this.impacts.length>400)this.impacts.splice(0,this.impacts.length-400);
    return event;
  }
  metrics(){return {shots:this.shots,pellets:this.pellets,hits:this.hits,rate:this.pellets?this.hits/this.pellets:0,damage:this.damage,seconds:this.firstShot===null?0:Math.max(0,this.lastShot-this.firstShot),distance:this.distance,seed:this.seed};}
}
