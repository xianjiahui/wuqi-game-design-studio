import * as THREE from './vendor/three.module.js';

function material(color,metalness=.25,roughness=.75){return new THREE.MeshStandardMaterial({color,metalness,roughness});}
const metal=material(0x263237,.7,.5),dark=material(0x131b1e,.3,.7),tan=material(0x9f8862,.2,.8),accent=material(0xc49a60,.5,.6),rubber=material(0x080e10,.1,.95);
function box(group,w,h,d,x,y,z,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);group.add(m);return m;}
function tube(group,r,l,x,y,z,mat,open=false){const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,l,16,1,open),mat);m.rotation.x=Math.PI/2;m.position.set(x,y,z);group.add(m);return m;}
export function weapon(r){
  const g=new THREE.Group(),type=r.gun.type,short=type==='SMG',long=['SR','DMR','MG'].includes(type),sg=type==='SG';
  const bodyLen=short?.64:.85,barrelLen=long?.95:sg?.85:short?.35:.6;
  box(g,.18,.21,bodyLen,0,0,0,metal);box(g,.145,.07,bodyLen+.1,0,.145,-.02,dark);
  box(g,.155,.14,.25,0,-.05,.5,dark);box(g,.12,.32,.15,0,-.22,.23,dark).rotation.x=-.25;
  const stockColor=r.slots.STOCK?tan:metal;
  box(g,.13,.13,.46,0,.0,.72,stockColor);box(g,.18,.32,.1,0,-.02,.99,rubber);
  if(type==='MG'){box(g,.34,.31,.35,0,-.25,-.1,tan);}else if(type!=='SR'&&!sg){box(g,.12,.35,short?.12:.22,0,-.27,-.17,dark).rotation.x=.15;}
  const barrelMat=r.slots.BARREL?tan:metal;
  box(g,.19,.19,.42,0,.0,-bodyLen/2-.18,barrelMat);
  for(let i=0;i<7;i++)box(g,.2,.025,.022,0,.11,-bodyLen/2-.38+i*.055,dark);
  tube(g,sg?.057:.035,barrelLen,0,.03,-bodyLen/2-.34-barrelLen/2,metal);
  tube(g,.05,.13,0,.03,-bodyLen/2-.36-barrelLen,metal);
  tube(g,.028,.135,0,.03,-bodyLen/2-.37-barrelLen,rubber);
  if(r.slots.FOREGRIP)box(g,.095,.27,.12,0,-.21,-.5,r.slots.FOREGRIP==='A01'?tan:metal);
  if(r.slots.REARGRIP)box(g,.125,.32,.155,0,-.22,.23,r.slots.REARGRIP.startsWith('A1')?accent:tan).rotation.x=-.25;
  if(r.slots.OPTIC){
    box(g,.12,.09,.22,0,.22,-.04,metal);
    const scopeLength=r.zoom>1?.42:.18;
    tube(g,.07,scopeLength,0,.31,-.05,dark,true);
    for(const z of [-.05-scopeLength/2,-.05+scopeLength/2]){
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.064,.007,6,24),dark);ring.position.set(0,.31,z);g.add(ring);
    }
  }else{
    box(g,.09,.11,.035,0,.21,.3,dark);box(g,.03,.08,.04,0,.18,-.62,dark);
  }
  for(let i=0;i<4;i++)box(g,.19,.015,.03,0,.195,.1+i*.05,dark);
  box(g,.015,.035,.1,.1,.03,.14,accent);return g;
}
function disposeTree(obj){obj.traverse(o=>{if(o.geometry)o.geometry.dispose();});}
function makeText(text,width=512,height=128,color='#e6c291'){
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.font='600 52px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height/2);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
export class ArmoryScene{
  constructor(canvas){
    this.canvas=canvas;this.view='bench';this.drag=0;this.spin=-.42;this.zoom=3.05;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.5;
    this.bench=new THREE.Scene();this.bench.background=new THREE.Color(0x172124);this.bench.fog=new THREE.Fog(0x172124,5,12);
    this.benchCam=new THREE.PerspectiveCamera(38,1,.05,100);this.benchCam.position.set(0,1.05,3.05);this.benchCam.lookAt(0,.15,0);
    this.bench.add(new THREE.HemisphereLight(0xf1f4e2,0x22383a,3));const key=new THREE.DirectionalLight(0xffe4ba,4);key.position.set(-2,3,2);this.bench.add(key);const rim=new THREE.DirectionalLight(0x91c8c3,3);rim.position.set(2,2,-2);this.bench.add(rim);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(20,20),material(0x142124,.1,.9));floor.rotation.x=-Math.PI/2;floor.position.y=-.35;this.bench.add(floor);
    const grid=new THREE.GridHelper(12,60,0x344b4e,0x25383d);grid.position.y=-.345;this.bench.add(grid);
    this.range=new THREE.Scene();this.range.background=new THREE.Color(0x18262b);this.range.fog=new THREE.Fog(0x18262b,50,105);this.rangeCam=new THREE.PerspectiveCamera(65,1,.04,130);this.rangeCam.position.set(0,1.6,0);this.rangeCam.rotation.order='YXZ';this.range.add(this.rangeCam);
    this.range.add(new THREE.HemisphereLight(0xb9e1e3,0x393732,2.2));const dlight=new THREE.DirectionalLight(0xffe1ad,2.6);dlight.position.set(-4,12,5);this.range.add(dlight);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(18,110),material(0x344145,.15,.95));ground.rotation.x=-Math.PI/2;ground.position.set(0,0,-45);this.range.add(ground);
    const grid2=new THREE.GridHelper(110,110,0x6f7d76,0x47565b);grid2.position.set(0,.003,-45);this.range.add(grid2);
    box(this.range,.4,5,100,-6,2.5,-45,material(0x28393c));box(this.range,.4,5,100,6,2.5,-45,material(0x28393c));box(this.range,12,5,.5,0,2.5,-94,material(0x1d2b30));
    for(let i=0;i<10;i++){
      const z=-i*10-4;box(this.range,12,.18,.2,0,4.8,z,metal);box(this.range,.6,.12,8,-5.75,3,z,material(0x6b6654));box(this.range,.6,.12,8,5.75,3,z,material(0x6b6654));
      box(this.range,3,.05,.15,0,4.65,z,new THREE.MeshBasicMaterial({color:0xaecfc5}));
    }
    for(const z of [15,30,60]){
      const line=new THREE.Mesh(new THREE.PlaneGeometry(10,.09),new THREE.MeshBasicMaterial({color:0xb89b66}));line.rotation.x=-Math.PI/2;line.position.set(0,.008,-z);this.range.add(line);
      const sign=new THREE.Mesh(new THREE.PlaneGeometry(2,.5),new THREE.MeshBasicMaterial({map:makeText(`${z} m`),transparent:true}));sign.position.set(-4.8,.5,-z);this.range.add(sign);
    }
    this.target=new THREE.Group();this.range.add(this.target);box(this.target,.07,3,.07,-1.3,.0,.08,metal);box(this.target,.07,3,.07,1.3,.0,.08,metal);box(this.target,2.7,.08,.09,0,1.55,.08,metal);
    this.paperCanvas=document.createElement('canvas');this.paperCanvas.width=768;this.paperCanvas.height=960;this.paperCtx=this.paperCanvas.getContext('2d');this.paperTexture=new THREE.CanvasTexture(this.paperCanvas);this.paperTexture.colorSpace=THREE.SRGBColorSpace;
    const paper=new THREE.Mesh(new THREE.PlaneGeometry(2.4,3),new THREE.MeshStandardMaterial({map:this.paperTexture,roughness:1}));this.target.add(paper);
    this.distance=30;this.target.position.set(0,1.6,-30);this.clearPaper();
    this.flash=new THREE.Mesh(new THREE.SphereGeometry(.04,6,4),new THREE.MeshBasicMaterial({color:0xffd29b}));this.flash.visible=false;this.rangeCam.add(this.flash);
    this.flashTime=-100;this.resize();new ResizeObserver(()=>this.resize()).observe(canvas.parentElement);
  }
  resize(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);for(const c of [this.benchCam,this.rangeCam]){c.aspect=w/h;c.updateProjectionMatrix();}}
  setWeapon(r){this.resolved=r;if(this.benchGun){this.bench.remove(this.benchGun);disposeTree(this.benchGun);}if(this.viewGun){this.rangeCam.remove(this.viewGun);disposeTree(this.viewGun);}this.benchGun=weapon(r);this.benchGun.rotation.y=Math.PI/2+this.spin;this.benchGun.position.set(0,.1,0);this.bench.add(this.benchGun);this.viewGun=weapon(r);this.viewGun.scale.setScalar(.34);this.rangeCam.add(this.viewGun);}
  setView(v){this.view=v;this.resize();}
  setDistance(d){this.distance=d;this.target.position.z=-d;this.clearPaper();}
  clearPaper(){
    const ctx=this.paperCtx,w=768,h=960,s=320;ctx.fillStyle='#dad8c4';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#a7a995';ctx.lineWidth=1;for(let x=64;x<w;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=32;y<h;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    ctx.fillStyle='#344943';ctx.fillRect(w/2-.48*s,h/2-.4*s,.96*s,1.3*s);ctx.beginPath();ctx.ellipse(w/2,h/2-.64*s,.23*s,.26*s,0,0,Math.PI*2);ctx.fill();
    for(let i=1;i<=5;i++){ctx.strokeStyle='#a3baa3';ctx.lineWidth=2;ctx.beginPath();ctx.arc(w/2,h/2,i*27,0,Math.PI*2);ctx.stroke();}
    ctx.fillStyle='#edb579';ctx.beginPath();ctx.arc(w/2,h/2,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#344943';ctx.font='22px monospace';ctx.textAlign='center';ctx.fillText(`ARMORY / ${this.distance}m / 2026`,w/2,52);ctx.font='16px monospace';ctx.fillText('HIT AREA : TORSO + HEAD',w/2,h-32);this.paperTexture.needsUpdate=true;
  }
  shot(event){
    this.flashTime=performance.now();const ctx=this.paperCtx;
    for(const hit of event.impacts){if(Math.abs(hit.x)>1.2||Math.abs(hit.y)>1.5)continue;const x=384+hit.x*320,y=480-hit.y*320;ctx.fillStyle='#eee0b4';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();ctx.fillStyle=hit.hit?'#edaa61':'#9f4e3f';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#101d20';ctx.beginPath();ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fill();}this.paperTexture.needsUpdate=true;
  }
  render(sim){
    if(this.view==='bench'){
      if(this.benchGun){this.benchGun.rotation.y=Math.PI/2+this.spin;this.benchGun.rotation.x=.07;this.benchGun.position.y=.08+Math.sin(performance.now()*.0006)*.012;}
      this.benchCam.position.z=this.zoom*Math.max(1,1.5/this.benchCam.aspect);this.benchCam.lookAt(0,.1,0);this.renderer.render(this.bench,this.benchCam);
    }else{
      const o=sim.orientation();this.rangeCam.rotation.set(o.pitch,o.yaw,0);const zoom=sim.resolved.zoom>1?sim.resolved.zoom:1.65;
      this.rangeCam.fov=65+(65/zoom-65)*sim.ads;this.rangeCam.updateProjectionMatrix();
      if(this.viewGun){const kick=Math.exp(-(performance.now()-this.flashTime)/65)*.045,adsY=this.resolved.slots.OPTIC?-.31*.34:-.23*.34;this.viewGun.position.set(.23*(1-sim.ads),-.27+(adsY+.27)*sim.ads,-.48+kick);this.viewGun.rotation.z=.025*(1-sim.ads);if(sim.reloadUntil>sim.time)this.viewGun.rotation.x=-.45;else this.viewGun.rotation.x=0;}
      this.flash.position.set(.23*(1-sim.ads),-.21+.095*sim.ads,-1.05);this.flash.visible=performance.now()-this.flashTime<38;this.renderer.render(this.range,this.rangeCam);
    }
  }
}
