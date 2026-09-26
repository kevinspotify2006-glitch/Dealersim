#!/usr/bin/env node
/**
 * Dealersim v7.4 2.5D migration.
 * Applies the visual/camera changes without requiring external 3D generators.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
function file(p){ return `${root}/${p}`; }
function replaceOnce(p, from, to, label){
  const path=file(p); const s=readFileSync(path,'utf8');
  if(s.includes(to)){ console.log(`[v7.4] ${p}: already applied (${label})`); return; }
  if(!s.includes(from)){ console.error(`[v7.4] missing anchor: ${label} in ${p}`); process.exitCode=1; return; }
  writeFileSync(path,s.replace(from,to));
  console.log(`[v7.4] ${p}: ${label}`);
}

const camera = `/**
 * Camera for the dealership world.
 *
 * Dealersim uses a controlled 2.5D/isometric projection: simulation coordinates
 * remain ordinary tile X/Y coordinates, while the camera projects them onto an
 * angled diamond. This keeps all existing placement/pathfinding logic intact
 * while making the dealership read as a spatial 2.5D world.
 */
export type Projection = 'topdown' | 'iso';

export class Camera {
  x = 15; y = 10; zoom = 24; width = 800; height = 600;
  min = 7; max = 90; bounds = { x0: -6, y0: -6, x1: 36, y1: 30 };
  projection: Projection = 'iso';
  resize(width: number, height: number): void { this.width=Math.max(1,width); this.height=Math.max(1,height); this.clamp(); }
  setBounds(x0:number,y0:number,x1:number,y1:number):void{this.bounds={x0,y0,x1,y1};this.clamp();}
  setProjection(projection:Projection):void{this.projection=projection;this.clamp();}
  toScreen(wx:number,wy:number):{x:number;y:number}{if(this.projection==='topdown')return{x:(wx-this.x)*this.zoom+this.width/2,y:(wy-this.y)*this.zoom+this.height/2};const dx=wx-this.x,dy=wy-this.y;return{x:(dx-dy)*this.zoom*.8660254+this.width/2,y:(dx+dy)*this.zoom*.5+this.height/2};}
  toWorld(sx:number,sy:number):{x:number;y:number}{const dx=sx-this.width/2,dy=sy-this.height/2;if(this.projection==='topdown')return{x:dx/this.zoom+this.x,y:dy/this.zoom+this.y};return{x:(dx/this.zoom*.5+dy/this.zoom*.8660254)+this.x,y:(-dx/this.zoom*.5+dy/this.zoom*.8660254)+this.y};}
  panBy(dxPx:number,dyPx:number):void{if(this.projection==='topdown'){this.x-=dxPx/this.zoom;this.y-=dyPx/this.zoom;}else{this.x-=(dxPx*.5+dyPx*.8660254)/this.zoom;this.y-=(-dxPx*.5+dyPx*.8660254)/this.zoom;}this.clamp();}
  zoomAt(factor:number,sx:number,sy:number):void{const before=this.toWorld(sx,sy);this.zoom=Math.max(this.min,Math.min(this.max,this.zoom*factor));const after=this.toWorld(sx,sy);this.x+=before.x-after.x;this.y+=before.y-after.y;this.clamp();}
  fit(x0:number,y0:number,x1:number,y1:number,pad={top:60,bottom:90,left:20,right:20}):void{const w=Math.max(1,this.width-pad.left-pad.right),h=Math.max(1,this.height-pad.top-pad.bottom),ww=Math.max(1,x1-x0),hh=Math.max(1,y1-y0);if(this.projection==='topdown')this.zoom=Math.max(this.min,Math.min(this.max,Math.min(w/ww,h/hh)));else this.zoom=Math.max(this.min,Math.min(this.max,Math.min(w/((ww+hh)*.8660254),h/((ww+hh)*.5))));const cx=(x0+x1)/2,cy=(y0+y1)/2;if(this.projection==='topdown'){this.x=cx-(pad.left-pad.right)/2/this.zoom;this.y=cy-(pad.top-pad.bottom)/2/this.zoom;}else{const sx=(pad.left-pad.right)/2,sy=(pad.top-pad.bottom)/2;this.x=cx-(sx*.5+sy*.8660254)/this.zoom;this.y=cy-(-sx*.5+sy*.8660254)/this.zoom;}this.clamp();}
  clamp():void{const b=this.bounds,halfW=this.width/2/this.zoom,halfH=this.height/2/this.zoom;this.x=Math.max(b.x0-halfW*.7,Math.min(b.x1+halfW*.7,this.x));this.y=Math.max(b.y0-halfH*.7,Math.min(b.y1+halfH*.7,this.y));}
}
`;
const cameraPath=file('src/ui/world/camera.ts');
const currentCamera=readFileSync(cameraPath,'utf8');
if(!currentCamera.includes('projection: Projection'))writeFileSync(cameraPath,camera);else console.log('[v7.4] camera already migrated');

const renderPath=file('src/ui/world/render.ts');
let render=readFileSync(renderPath,'utf8');
if(render.includes('function drawCar25D(')){console.log('[v7.4] renderer already migrated');}
else{
  render=render.replace("import type { Camera } from './camera';","import { Camera } from './camera';");
  const oldTransform=`  const z = cam.zoom * dpr;
  const ox = W / 2 - cam.x * z;
  const oy = H / 2 - cam.y * z;
  g.setTransform(z, 0, 0, z, ox, oy);
  const view = { x0: cam.x - cam.width / 2 / cam.zoom - 2, y0: cam.y - cam.height / 2 / cam.zoom - 2, x1: cam.x + cam.width / 2 / cam.zoom + 2, y1: cam.y + cam.height / 2 / cam.zoom + 2 };`;
  const newTransform=`  const z=cam.zoom*dpr;
  const ox=W/2-cam.x*z,oy=H/2-cam.y*z;
  if(cam.projection==='iso')g.setTransform(z*.8660254,z*.5,-z*.8660254,z*.5,ox,oy);else g.setTransform(z,0,0,z,ox,oy);
  const extent=Math.max(cam.width,cam.height)/cam.zoom+6;
  const view={x0:cam.x-extent,y0:cam.y-extent,x1:cam.x+extent,y1:cam.y+extent};`;
  if(render.includes(oldTransform))render=render.replace(oldTransform,newTransform);
  const carStart=render.indexOf('function drawCar('),carEnd=render.indexOf('/** Where a car sits',carStart);
  if(carStart<0||carEnd<0){console.error('[v7.4] drawCar anchor not found');process.exitCode=1;}
  else{
    const helper=`function carPalette(hex:string){const n=parseInt(hex.replace('#',''),16)>>>0;const shade=(a:number)=>{const r=Math.max(0,Math.min(255,((n>>16)&255)+a)),gg=Math.max(0,Math.min(255,((n>>8)&255)+a)),b=Math.max(0,Math.min(255,(n&255)+a));return 'rgb('+r+','+gg+','+b+')'};return{body:shade(0),side:shade(-38),glass:'#17212b',trim:'#15181c'};}
function vehicleShape(body:string){switch(body){case'Van':return{length:5,width:2.05,cabin:.58,nose:.13,rear:.08,roof:.92};case'Pickup':return{length:5.15,width:2.08,cabin:.48,nose:.14,rear:.05,roof:.88};case'SUV':case'Offroader':return{length:4.65,width:1.98,cabin:.62,nose:.14,rear:.08,roof:.92};case'Crossover':return{length:4.55,width:1.92,cabin:.61,nose:.14,rear:.08,roof:.88};case'Wagon':return{length:4.65,width:1.86,cabin:.64,nose:.14,rear:.1,roof:.86};case'Sedan':return{length:4.7,width:1.84,cabin:.59,nose:.18,rear:.12,roof:.84};case'Coupe':case'Roadster':return{length:4.35,width:1.84,cabin:.47,nose:.2,rear:.14,roof:.73};case'Convertible':return{length:4.3,width:1.84,cabin:.46,nose:.2,rear:.15,roof:.48};default:return{length:4.2,width:1.8,cabin:.58,nose:.17,rear:.1,roof:.8}}}`;
    const carFn=`function drawCar25D(g:CanvasRenderingContext2D,cam:Camera,dpr:number,x:number,y:number,angle:number,color:string,body:string,alpha=1,modelKey='',trim=''):void{
 const p=cam.toScreen(x,y),n=vehicleShape(body),pal=carPalette(color),s=Math.max(.55,cam.zoom*dpr*.62),L=n.length*s,W=n.width*s,H=n.roof*s;
 const sporty=/sport|gt|rs|performance|corsa|track|dynamic|sportiva|baja|hx/i.test(modelKey+' '+trim),luxury=/luxury|executive|premium|exclusive|signature|grand|ultimate|excellence|onyx/i.test(modelKey+' '+trim),electric=/electric|ev|volt|elo|eon|voltis|ardent|voltara|solace|orion/i.test(modelKey+' '+trim),raised=/adventure|offroad|outback|awd|4x4/i.test(modelKey+' '+trim);
 g.save();g.setTransform(1,0,0,1,0,0);g.globalAlpha=alpha;g.translate(p.x*dpr,p.y*dpr);g.rotate(cam.projection==='iso'?angle+Math.PI/6:angle);
 g.fillStyle='rgba(0,0,0,.34)';g.beginPath();g.ellipse(.08*s,.2*s,L*.54,W*.25,0,0,Math.PI*2);g.fill();
 const a=L/2,b=W/2,wr=Math.max(5,W*.19),wy=b*.94,x1=-L*.30,x2=L*.31;
 g.fillStyle=pal.side;g.beginPath();g.moveTo(-a,0);g.lineTo(-a+L*.05,-b*.72);g.lineTo(a-L*.04,-b*.72);g.lineTo(a,0);g.lineTo(a-L*.04,b*.76);g.lineTo(-a+L*.05,b*.76);g.closePath();g.fill();
 g.fillStyle=pal.body;g.beginPath();g.moveTo(-a,0);g.lineTo(-a+L*n.rear,-b*.72);g.lineTo(-a+L*.18,-b);g.lineTo(a-L*n.nose,-b);g.lineTo(a,-b*.42);g.lineTo(a,b*.42);g.lineTo(a-L*n.nose,b);g.lineTo(-a+L*.18,b);g.lineTo(-a+L*n.rear,b*.72);g.closePath();g.fill();
 const cf=a*.38,cb=-a*.38,cw=b*n.cabin;g.fillStyle=pal.body;g.beginPath();g.moveTo(cb,0);g.lineTo(cb+L*.08,-cw);g.lineTo(cf-L*.06,-cw*.96);g.lineTo(cf,0);g.lineTo(cf-L*.06,cw*.96);g.lineTo(cb+L*.08,cw);g.closePath();g.fill();
 g.fillStyle=pal.glass;g.beginPath();g.moveTo(cb+L*.07,0);g.lineTo(cb+L*.16,-cw*.78);g.lineTo(cf-L*.12,-cw*.74);g.lineTo(cf-L*.08,0);g.lineTo(cf-L*.12,cw*.74);g.lineTo(cb+L*.16,cw*.78);g.closePath();g.fill();
 const wheel=(wx:number,wy:number,far=false)=>{g.save();g.globalAlpha*=far?.55:1;g.translate(wx,wy);g.fillStyle='#0b0e12';g.beginPath();g.ellipse(0,0,wr*.55,wr,0,0,Math.PI*2);g.fill();g.fillStyle=sporty?'#aeb6bf':'#6d747d';g.beginPath();g.ellipse(0,0,wr*.27,wr*.48,0,0,Math.PI*2);g.fill();g.restore();};wheel(x1,-wy,true);wheel(x2,-wy,true);wheel(x1,wy);wheel(x2,wy);
 g.fillStyle=electric?'#d7fbff':'#fff2cc';g.fillRect(a-L*.055,-b*.67,L*.025,W*.19);g.fillRect(a-L*.055,b*.48,L*.025,W*.19);g.fillStyle='#f04b5c';g.fillRect(-a+L*.03,-b*.68,L*.025,W*.18);g.fillRect(-a+L*.03,b*.5,L*.025,W*.18);g.fillStyle=electric?'#20272e':pal.trim;g.fillRect(a-L*.08,-W*.20,L*.045,W*.40);
 if(sporty){g.fillStyle='#111419';g.fillRect(-a+L*.02,-b*.88,L*.16,W*.08);g.fillRect(-a+L*.02,b*.80,L*.16,W*.08);}if(raised){g.strokeStyle='#2b3036';g.lineWidth=Math.max(1,W*.025);g.strokeRect(-a*.62,-b*.94,L*.74,W*.04);g.strokeRect(-a*.62,b*.90,L*.74,W*.04);}g.restore();
}`;
    render=render.slice(0,carStart)+helper+'\n'+carFn+"\nexport function drawCar(g:CanvasRenderingContext2D,cam:Camera,dpr:number,x:number,y:number,angle:number,color:string,body:string,alpha=1,modelKey='',trim=''){drawCar25D(g,cam,dpr,x,y,angle,color,body,alpha,modelKey,trim);}\n"+render.slice(carEnd);
    render=render.replace("drawCar(g, pose.x, pose.y, pose.angle, v.colorHex, v.body, s.moveCar === v.id ? 0.55 : 1);","drawCar(g,cam,dpr,pose.x,pose.y,pose.angle,v.colorHex,v.body,s.moveCar===v.id?.55:1,v.modelId,v.trim);");
    render=render.replace("drawCar(g, pose.x, pose.y, pose.angle, SERVICE_COLORS[hashStr(j.id) % SERVICE_COLORS.length], model?.body ?? 'Hatchback', 1);","drawCar(g,cam,dpr,pose.x,pose.y,pose.angle,SERVICE_COLORS[hashStr(j.id)%SERVICE_COLORS.length],model?.body??'Hatchback',1,j.vehicle,'service');");
    render=render.replace("for (const c of [...s.crowd.cars, ...s.crowd.roadCars]) drawCar(g, c.x, c.y, c.angle, c.color, c.body, c.alpha);","for (const c of [...s.crowd.cars,...s.crowd.roadCars]) drawCar(g,cam,dpr,c.x,c.y,c.angle,c.color,c.body,c.alpha,c.vehicleId??c.id,'traffic');");
    render=render.replace("drawCar(g, c.x, c.y, c.angle, c.color, c.body, 0.72);","drawCar(g,cam,dpr,c.x,c.y,c.angle,c.color,c.body,.72,'ghost','ghost');");
  }
  writeFileSync(renderPath,render);
}
replaceOnce('src/ui/views/world.ts',"const root = h('div', { class: 'view world' },","const root = h('div', { class: 'view world world-25d' },");

const mp=file('src/styles/mobile.css'); let m=readFileSync(mp,'utf8');
if(!m.includes('v7.4 2.5D world'))m += '\n/* v7.4 2.5D world + S25 landscape polish */\n.world-25d .world-canvas{image-rendering:auto;touch-action:none}.world-25d .world-hud,.world-25d .world-actions,.world-25d .world-zoom{z-index:12}@media(max-width:960px) and (orientation:landscape){.world-25d .world-canvas{min-height:100%}.world-25d .world-hud{max-width:min(420px,44vw)}.world-25d .world-zoom{bottom:calc(58px + var(--safe-b))}.world-25d .world-actions{min-height:48px}.world-25d .world-actions .wa-item{min-height:46px;min-width:56px}}\n';
writeFileSync(mp,m);
const pkgPath=file('package.json');const pkg=JSON.parse(readFileSync(pkgPath,'utf8'));pkg.version='7.4.0';pkg.scripts={...pkg.scripts,prebuild:'node tools/upgrade_2_5d.mjs'};writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
console.log('[v7.4] done');
