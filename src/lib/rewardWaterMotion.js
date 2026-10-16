import { springValue } from 'motion';
import { drawAdditionalRewardMotion } from './rewardWaterAccents';

/** Input-driven canvas art shared by navigation, theme previews and local drafts. */
const palettes = {
  aurora: { name:"البلاتين", light:"#ffffff", accent:"#869eb7", shadow:"#40546c", water:"#b9cbd6", leaf:"#799d90" },
  coral: { name:"مرجان", light:"#ffeae6", accent:"#f39a8d", shadow:"#323e66", water:"#716785", leaf:"#8a9e92" },
  ambassador: { name:"تاج السفير", light:"#fff2c9", accent:"#e3c063", shadow:"#080d11", water:"#293a3b", leaf:"#577c68" },
};
const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${(n>>8)&255},${n&255},${clamp(a,0,1)})`;};
const smooth=t=>t*t*(3-2*t);

function petal(ctx,x,y,r,angle,color,shine,alpha){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.globalAlpha=alpha;
  const gradient=ctx.createLinearGradient(-r,0,r,0);gradient.addColorStop(0,color);gradient.addColorStop(1,shine);
  ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(-r*.75,0);
  ctx.bezierCurveTo(-r*.2,-r*.65,r*.95,-r*.38,r,0);ctx.bezierCurveTo(r*.65,r*.5,-r*.15,r*.62,-r*.75,0);ctx.fill();
  ctx.strokeStyle=rgba(shine,.5);ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(-r*.5,0);ctx.quadraticCurveTo(0,-r*.08,r*.72,0);ctx.stroke();ctx.restore();
}
function glow(ctx,x,y,r,color,alpha){
  const gradient=ctx.createRadialGradient(x,y,0,x,y,r);
  gradient.addColorStop(0,rgba(color,alpha));gradient.addColorStop(.25,rgba(color,alpha*.44));gradient.addColorStop(1,rgba(color,0));
  ctx.fillStyle=gradient;ctx.fillRect(x-r,y-r,r*2,r*2);
}
function trailPath(ctx,points,offset=0){
  if(points.length<2)return;
  ctx.beginPath();ctx.moveTo(points[0].x,points[0].y+offset);
  for(let i=1;i<points.length;i++){
    const previous=points[i-1],point=points[i],next=points[i+1]||point;
    ctx.quadraticCurveTo(point.x,point.y+offset,(point.x+next.x)/2,(point.y+next.y)/2+offset);
    if(i===points.length-1)ctx.lineTo(point.x,point.y+offset);
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} input
 * @param {{theme:string,kind:string,preview?:boolean,active?:boolean}} options
 */
export function createRewardWaterMotion(canvas,input,{theme,kind,preview=false,active=true}){
  const tuning={strength:1};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let enabled=active,lastInput=null;
  const ctx=canvas.getContext('2d'),surface=canvas.parentElement;
  if(!ctx||!surface)return null;
  const mini=preview,lake=false;
  const spring={stiffness:190,damping:26,mass:.7,restDelta:.03};
  const x=springValue(0,spring),y=springValue(0,spring),opacity=springValue(0,{stiffness:115,damping:23,restDelta:.001});
  const slowX=springValue(0,{stiffness:48,damping:17,mass:1.1,restDelta:.03}),slowY=springValue(0,{stiffness:48,damping:17,mass:1.1,restDelta:.03});
  const tailX=springValue(0,{stiffness:25,damping:13,mass:1.4,restDelta:.03}),tailY=springValue(0,{stiffness:25,damping:13,mass:1.4,restDelta:.03});
  const values=[x,y,opacity,slowX,slowY,tailX,tailY];
  const points=[];let width=0,height=0,visible=false,frame=0,engaged=false,lastEmit=-Infinity,previous=null,serial=0;
  let targetX=0,targetY=0,dragOrigin=null,lastDrag=-Infinity;
  const mode=()=>kind;
  const schedule=()=>{if(!frame&&visible&&!document.hidden)frame=requestAnimationFrame(draw);};
  function draw(now){
    frame=0;if(!visible||document.hidden||!width||!height)return;
    const p=palettes[theme] || palettes.aurora,kind=mode(),px=x.get(),py=y.get(),a=opacity.get()*tuning.strength;
    const scale=mini?.35:lake?.7:1;
    ctx.clearRect(0,0,width,height);ctx.lineCap='round';
    while(points.length&&now-points[0].time>2600)points.shift();
    const alive=points.map(pt=>({...pt,age:clamp((now-pt.time)/2600,0,1)}));
    if(['gilded-stars','liquid-silver','silver-ribbon'].includes(kind)){
      drawAdditionalRewardMotion(ctx,p,kind,{px,py,a,scale,alive,sx:slowX.get(),sy:slowY.get(),tx:tailX.get(),ty:tailY.get(),strength:tuning.strength});
    }else if(kind==='reflection'){
      glow(ctx,px,py,135*scale,p.light,a*.09);
      for(let i=0;i<5;i++){
        const yy=py+(i-2)*20*scale,spread=(62+i*8)*scale,bend=Math.sin(px/width*Math.PI+i*.5)*14*scale;
        const grad=ctx.createLinearGradient(px-spread,0,px+spread,0);grad.addColorStop(0,rgba(p.light,0));grad.addColorStop(.4,rgba(p.shadow,a*.3));grad.addColorStop(.55,rgba(p.light,a*.72));grad.addColorStop(1,rgba(p.light,0));
        ctx.strokeStyle=grad;ctx.lineWidth=2.7*scale+.65;ctx.beginPath();ctx.moveTo(px-spread,yy);
        ctx.bezierCurveTo(px-spread*.4,yy-bend,px+spread*.25,yy+bend,px+spread,yy+7*scale);ctx.stroke();
        ctx.strokeStyle=rgba(p.shadow,a*.045);ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(px-spread*.65,yy+3*scale);ctx.quadraticCurveTo(px,yy+bend,px+spread*.7,yy+2*scale);ctx.stroke();
      }
      for(const pt of alive){const fade=(1-pt.age)**2*.17*tuning.strength;ctx.strokeStyle=rgba(p.accent,fade);ctx.lineWidth=.75;ctx.beginPath();ctx.ellipse(pt.x,pt.y,14*scale+pt.age*52*scale,4*scale+pt.age*18*scale,pt.angle*.15,.2,2.8);ctx.stroke();}
    }else if(kind==='petals'){
      glow(ctx,px,py,74*scale,p.light,a*.075);
      for(const pt of alive){
        const life=1-pt.age,drift=smooth(pt.age)*19*scale;
        for(let j=0;j<2;j++){
          const angle=pt.seed*.7+j*1.8+pt.angle*.25+pt.age*.55;
          const xx=pt.x+Math.sin(pt.seed+j*2)*12*scale+drift*.35,yy=pt.y+Math.cos(pt.seed+j*3)*9*scale+drift;
          petal(ctx,xx,yy,(j?4.5:7.5)*scale,angle,p.accent,p.light,life*life*.68*tuning.strength);
          ctx.strokeStyle=rgba(p.light,life*.07);ctx.lineWidth=.6;ctx.beginPath();ctx.ellipse(xx,yy+3*scale,12*scale+pt.age*22*scale,3*scale+pt.age*7*scale,0,.1,2.7);ctx.stroke();
        }
      }
    }else if(kind==='fireflies'){
      for(const pt of alive){
        for(let j=0;j<3;j++){
          const life=Math.sin(Math.PI*clamp(pt.age*1.05+.12,0,1))*(1-pt.age),angle=pt.seed*.83+j*2.1;
          const xx=pt.x+Math.cos(angle)*(10+pt.age*18)*scale,yy=pt.y+Math.sin(angle)*(9+pt.age*15)*scale-pt.age*8*scale;
          glow(ctx,xx,yy,(j?9:12)*scale,p.accent,life*.3*tuning.strength);
          ctx.fillStyle=rgba(p.light,life*.72);ctx.beginPath();ctx.arc(xx,yy,(j?.65:1.1)*scale+.15,0,Math.PI*2);ctx.fill();
          ctx.fillStyle=rgba(p.accent,life*.18);ctx.beginPath();ctx.ellipse(xx,yy+10*scale,4.8*scale,1*scale,0,0,Math.PI*2);ctx.fill();
        }
      }
    }else if(kind==='glass'){
      glow(ctx,px,py,67*scale,p.light,a*.085);
      for(const pt of alive){
        const age=smooth(pt.age),r=(9+age*58)*scale,fade=(1-pt.age)**2*tuning.strength;
        for(let j=0;j<2;j++){
          ctx.strokeStyle=rgba(j?p.light:p.shadow,fade*(j?.8:.42));ctx.lineWidth=j?.9:1.5;
          ctx.beginPath();ctx.ellipse(pt.x,pt.y+(j?2:0)*scale,r+j*4*scale,r*.53+j*2*scale,.05,0,Math.PI*2);ctx.stroke();
        }
        ctx.strokeStyle=rgba(p.shadow,fade*.12);ctx.lineWidth=.6;ctx.beginPath();ctx.ellipse(pt.x,pt.y+3*scale,r*.94,r*.5,.05,Math.PI*.8,Math.PI*1.65);ctx.stroke();
      }
    }else if(kind==='lotus'){
      const slotted=surface.hasAttribute('data-reward-lotus-slot');
      const cx=width*(slotted?.5:.26)+(px/width-.5)*7*scale,cy=slotted?height*.56:height-(mini?13:lake?23:120);
      const bloom=(mini?8:lake?15:22)*(1+a*.15),turn=(px/width-.5)*.22,opening=.26+a*.35;
      for(let j=0;j<7;j++){
        const angle=-Math.PI/2+(j-3)*opening+turn;
        petal(ctx,cx+Math.cos(angle)*bloom*.32,cy+Math.sin(angle)*bloom*.22,bloom*.72,angle,p.accent,p.light,.065+a*.3);
      }
      for(let j=0;j<3;j++)petal(ctx,cx+(j-1)*bloom*.16,cy-bloom*.15,bloom*.47,-Math.PI/2+(j-1)*.32+turn,p.light,p.accent,.06+a*.31);
      glow(ctx,cx,cy+6*scale,58*scale,p.accent,a*.06);
      for(const pt of alive){const life=(1-pt.age)**2;ctx.strokeStyle=rgba(p.light,life*.13);ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(cx,cy+8*scale,(23+pt.age*72)*scale,(5+pt.age*18)*scale,0,.1,3.05);ctx.stroke();}
      glow(ctx,px,py,60*scale,p.light,a*.045);
    }else if(kind==='moon'){
      glow(ctx,px,py,110*scale,p.accent,a*.17);
      for(let i=0;i<11;i++){
        const span=(23+i*5)*scale,yy=py+(i-5)*10*scale,offset=Math.sin(px/width*Math.PI+i*.65)*7*scale+(slowX.get()-px)*.12;
        const g=ctx.createLinearGradient(px-span,0,px+span,0);g.addColorStop(0,rgba(p.accent,0));g.addColorStop(.46,rgba(p.accent,a*.34));g.addColorStop(.57,rgba(i%2?p.accent:p.light,a*.56*(1-i*.045)));g.addColorStop(1,rgba(p.accent,0));
        ctx.strokeStyle=g;ctx.lineWidth=(i<4?2.2:1.3)*scale+.3;ctx.beginPath();ctx.moveTo(px-span+offset,yy);ctx.bezierCurveTo(px-span*.25,yy-3*scale,px+span*.2,yy+4*scale,px+span+offset,yy+2*scale);ctx.stroke();
      }
      for(const pt of alive){ctx.strokeStyle=rgba(p.light,(1-pt.age)**2*.12);ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(pt.x,pt.y,(15+pt.age*52)*scale,(3+pt.age*12)*scale,0,.3,2.8);ctx.stroke();}
    }else if(kind==='dew'){
      glow(ctx,px,py,120*scale,p.shadow,a*.16);
      for(let j=0;j<3;j++){
        const span=(82+j*16)*scale,yy=py+(j-1)*26*scale,bend=(px/width-.5)*24*scale;
        const g=ctx.createLinearGradient(px-span,0,px+span,0);g.addColorStop(0,rgba(p.shadow,0));g.addColorStop(.45,rgba(p.shadow,a*.27));g.addColorStop(.58,rgba(p.light,a*.65));g.addColorStop(1,rgba(p.shadow,0));
        ctx.strokeStyle=g;ctx.lineWidth=4*scale+.4;ctx.beginPath();ctx.moveTo(px-span,yy);ctx.bezierCurveTo(px-span*.35,yy+bend-12*scale,px+span*.4,yy-bend+12*scale,px+span,yy);ctx.stroke();
      }
      for(const pt of alive){ctx.strokeStyle=rgba(p.shadow,(1-pt.age)**2*.13);ctx.lineWidth=.8;ctx.beginPath();ctx.ellipse(pt.x,pt.y,(15+pt.age*45)*scale,(4+pt.age*14)*scale,.1,.2,2.7);ctx.stroke();}
    }else if(kind==='silk'){
      const pts=alive.filter(pt=>pt.age<.9);
      if(pts.length>1){
        const fade=(1-pts[pts.length-1].age)**2*tuning.strength;
        for(const [offset,color,strength,line] of [[-7*scale,p.light,.19,1.1],[0,p.accent,.32,1.2],[7*scale,p.light,.13,.75]]){
          ctx.strokeStyle=rgba(color,fade*strength);ctx.lineWidth=line;trailPath(ctx,pts,offset);ctx.stroke();
        }
      }
      glow(ctx,px,py,66*scale,p.accent,a*.055);
    }else if(kind==='river'){
      const sx=slowX.get(),sy=slowY.get(),tx=tailX.get(),ty=tailY.get(),distance=Math.hypot(px-tx,py-ty);
      const visibleTrail=clamp(distance/(mini?14:45),0,1)*a;
      for(const [offset,color,alpha,widthLine] of [[0,p.accent,.5,1.2],[4*scale,p.light,.28,.8]]){
        ctx.strokeStyle=rgba(color,visibleTrail*alpha);ctx.lineWidth=widthLine;
        ctx.beginPath();ctx.moveTo(tx,ty+offset);ctx.bezierCurveTo(sx-5*scale,sy+offset,sx,sy+offset,px,py+offset);ctx.stroke();
      }
      glow(ctx,px,py,15*scale,p.light,a*.19);
      glow(ctx,sx,sy,21*scale,p.accent,visibleTrail*.12);
    }
    // Timed work exists only for a finite input-created wake; there is no idle clock.
    if(points.length&&!reduced.matches)schedule();
  }
  function aim(clientX,clientY,pressed=false){
    lastInput={clientX,clientY,pressed};
    if(!enabled||!visible||document.hidden)return;
    const rect=input.getBoundingClientRect();targetX=clamp((clientX-rect.left)/rect.width,0,1)*width;targetY=clamp((clientY-rect.top)/rect.height,0,1)*height;
    const first=!engaged;
    for(const [value,target] of [[x,targetX],[y,targetY],[slowX,targetX],[slowY,targetY],[tailX,targetX],[tailY,targetY]]){
      if(first||reduced.matches)value.jump(target);else value.set(target);
    }
    engaged=true;if(reduced.matches)opacity.jump(.48);else opacity.set(pressed?.95:.82);
    const now=performance.now(),kind=mode(),distance=previous?Math.hypot(targetX-previous.x,targetY-previous.y):Infinity;
    const sparse=['petals','fireflies','dew','glass','lotus','gilded-stars','liquid-silver'].includes(kind),gap=kind==='silk'?24:sparse?135:75;
    if(!reduced.matches&&(first||now-lastEmit>gap)&&distance>(mini?2:sparse?14:6)){
      points.push({x:targetX,y:targetY,time:now,seed:++serial,angle:previous?Math.atan2(targetY-previous.y,targetX-previous.x):0});
      const limit=kind==='silk'?22:sparse?5:8;if(points.length>limit)points.shift();lastEmit=now;previous={x:targetX,y:targetY};
    }
    schedule();
  }
  function end(){engaged=false;previous=null;if(reduced.matches)opacity.jump(0);else opacity.set(0);schedule();}
  function reset(){points.length=0;engaged=false;previous=null;lastEmit=-Infinity;values.forEach(v=>v.stop());for(const v of [x,slowX,tailX])v.jump(width/2);for(const v of [y,slowY,tailY])v.jump(height/2);opacity.jump(0);schedule();}
  const subscriptions=values.map(value=>value.on('change',schedule));
  const listeners=[];
  const listen=(type,fn)=>{input.addEventListener(type,fn,{passive:true});listeners.push([type,fn]);};
  listen('pointerenter',e=>{if(e.pointerType!=='touch')aim(e.clientX,e.clientY,false);});
  listen('pointermove',e=>{if(e.pointerType!=='touch')aim(e.clientX,e.clientY,e.buttons!==0);});
  listen('pointerleave',e=>{if(e.pointerType!=='touch'){lastInput=null;end();}});
  listen('pointerdown',e=>{if(e.pointerType!=='touch')aim(e.clientX,e.clientY,true);});
  listen('touchstart',e=>{const p=e.touches[0];if(!p)return;dragOrigin={x:p.clientX,y:p.clientY};aim(p.clientX,p.clientY,true);});
  listen('touchmove',e=>{const p=e.touches[0];if(!p)return;if(dragOrigin&&Math.hypot(p.clientX-dragOrigin.x,p.clientY-dragOrigin.y)>8)lastDrag=performance.now();aim(p.clientX,p.clientY,true);});
  listen('touchend',()=>{lastInput=null;dragOrigin=null;end();});listen('touchcancel',()=>{lastInput=null;dragOrigin=null;end();});
  listen('focusin',e=>{const r=e.target.getBoundingClientRect();aim(r.left+r.width/2,r.top+r.height/2);});
  listen('focusout',e=>{if(!input.contains(e.relatedTarget)){lastInput=null;end();}});
  const blockDrag=e=>{if(performance.now()-lastDrag<350){e.preventDefault();e.stopPropagation();}};input.addEventListener('click',blockDrag,true);
  const resize=new ResizeObserver(()=>{width=surface.clientWidth;height=surface.clientHeight;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);if(!engaged){x.jump(width/2);y.jump(height/2);slowX.jump(width/2);slowY.jump(height/2);tailX.jump(width/2);tailY.jump(height/2);}schedule();});resize.observe(surface);
  const observer=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;if(!visible){cancelAnimationFrame(frame);frame=0;values.forEach(v=>v.stop());reset();}else if(enabled&&lastInput)aim(lastInput.clientX,lastInput.clientY,lastInput.pressed);else schedule();});observer.observe(surface);
  const suspend=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;values.forEach(v=>v.stop());reset();}else schedule();};document.addEventListener('visibilitychange',suspend);
  const preference=()=>{points.length=0;values.forEach(v=>v.stop());x.jump(targetX);y.jump(targetY);slowX.jump(targetX);slowY.jump(targetY);tailX.jump(targetX);tailY.jump(targetY);opacity.jump(engaged?.48:0);schedule();};reduced.addEventListener('change',preference);
  return {setActive(value){enabled=value;if(!value){reset();return;}if(lastInput)aim(lastInput.clientX,lastInput.clientY,lastInput.pressed);else if(input.contains(document.activeElement)){const r=document.activeElement.getBoundingClientRect();aim(r.left+r.width/2,r.top+r.height/2);}},dispose(){cancelAnimationFrame(frame);resize.disconnect();observer.disconnect();listeners.forEach(([type,fn])=>input.removeEventListener(type,fn));input.removeEventListener('click',blockDrag,true);document.removeEventListener('visibilitychange',suspend);reduced.removeEventListener('change',preference);subscriptions.forEach(off=>off());values.forEach(v=>v.destroy());}};
}

