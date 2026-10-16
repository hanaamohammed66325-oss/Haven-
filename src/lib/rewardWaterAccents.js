const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${(n>>8)&255},${n&255},${clamp(a,0,1)})`;};

function bloom(ctx,x,y,r,light,accent,alpha,reflection=false){
  ctx.save();ctx.translate(x,y);if(reflection)ctx.scale(1,.23);
  const g=ctx.createLinearGradient(-r,-r,r,r);g.addColorStop(0,rgba(light,alpha));g.addColorStop(.5,rgba(accent,alpha));g.addColorStop(1,rgba(light,alpha*.7));
  ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,-r*1.35);
  ctx.bezierCurveTo(r*.12,-r*.2,r*.2,-r*.1,r,0);
  ctx.bezierCurveTo(r*.2,r*.1,r*.12,r*.2,0,r*1.35);
  ctx.bezierCurveTo(-r*.12,r*.2,-r*.2,r*.1,-r,0);
  ctx.bezierCurveTo(-r*.2,-r*.1,-r*.12,-r*.2,0,-r*1.35);ctx.fill();ctx.restore();
}
function halo(ctx,x,y,r,color,alpha){
  const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgba(color,alpha));g.addColorStop(1,rgba(color,0));ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
}

/** Approved silver and gold art driven only by the shared input springs. */
export function drawAdditionalRewardMotion(ctx,p,kind,{px,py,a,scale,alive,sx,sy,tx,ty,strength}){
  if(kind==='gilded-stars'){
    halo(ctx,sx,sy,31*scale,p.accent,a*.13);
    bloom(ctx,sx,sy,9*scale,p.light,p.accent,a*.83);
    bloom(ctx,sx,sy+17*scale,8*scale,p.light,p.accent,a*.17,true);
    for(const pt of alive){
      const life=(1-pt.age)**2*strength,offset=(pt.seed%2?1:-1)*11*scale;
      const xx=pt.x+offset,yy=pt.y-pt.age*7*scale,r=(3.5+pt.seed%3)*scale;
      bloom(ctx,xx,yy,r,p.light,p.accent,life*.67);
      bloom(ctx,xx,yy+14*scale,r,p.light,p.accent,life*.14,true);
      ctx.strokeStyle=rgba(p.accent,life*.2);ctx.lineWidth=.75;ctx.beginPath();ctx.ellipse(xx,yy+14*scale,(12+pt.age*15)*scale,2.3*scale,0,.2,Math.PI*.95);ctx.stroke();
    }
    return true;
  }
  if(kind==='liquid-silver'){
    const dx=px-sx,dy=py-sy,distance=Math.hypot(dx,dy),stretch=clamp(distance/45,0,.6);
    const angle=distance>1?Math.atan2(dy,dx):-.28;
    halo(ctx,sx,sy,58*scale,p.shadow,a*.08);
    ctx.save();ctx.translate(sx,sy);ctx.rotate(angle);
    const rx=(23+stretch*12)*scale,ry=(16-stretch*3)*scale;
    const g=ctx.createLinearGradient(0,-ry,0,ry);
    g.addColorStop(0,rgba(p.light,a*.08));g.addColorStop(.21,rgba(p.shadow,a*.32));
    g.addColorStop(.39,rgba(p.light,a*.77));g.addColorStop(.57,rgba(p.shadow,a*.12));
    g.addColorStop(.79,rgba(p.light,a*.48));g.addColorStop(1,rgba(p.shadow,a*.26));
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-rx,0);
    ctx.bezierCurveTo(-rx*.95,-ry*.65,-rx*.3,-ry*1.14,rx*.25,-ry*.7);
    ctx.bezierCurveTo(rx*.92,-ry*.48,rx*1.06,ry*.03,rx*.69,ry*.58);
    ctx.bezierCurveTo(rx*.17,ry*1.19,-rx*.83,ry*.86,-rx,0);ctx.fill();
    ctx.strokeStyle=rgba(p.shadow,a*.28);ctx.lineWidth=.8;ctx.stroke();
    ctx.strokeStyle=rgba(p.light,a*.9);ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(-rx*.76,-ry*.07);ctx.bezierCurveTo(-rx*.68,-ry*.67,rx*.03,-ry*.8,rx*.52,-ry*.38);ctx.stroke();
    ctx.restore();
    if(distance>9){
      const bx=tx+(sx-tx)*.42,by=ty+(sy-ty)*.42;
      ctx.strokeStyle=rgba(p.shadow,a*.18);ctx.lineWidth=1.1;ctx.beginPath();ctx.ellipse(bx,by,8*scale,4.5*scale,angle,0,Math.PI*2);ctx.stroke();
      ctx.strokeStyle=rgba(p.light,a*.76);ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(bx,by-scale,8*scale,4.5*scale,angle,Math.PI*.9,Math.PI*1.9);ctx.stroke();
    }
    return true;
  }
  if(kind==='silver-ribbon'){
    const dx=px-tx,dy=py-ty,distance=Math.hypot(dx,dy),alpha=clamp(distance/(scale<.5?12:40),0,1)*a;
    halo(ctx,px,py,34*scale,p.light,a*.09);
    if(distance>2){
      const nx=-dy/distance,ny=dx/distance,wide=(7+clamp(distance/15,0,6))*scale;
      const bendX=sx+nx*wide*.5,bendY=sy+ny*wide*.5;
      const g=ctx.createLinearGradient(sx-nx*wide,sy-ny*wide,sx+nx*wide,sy+ny*wide);
      g.addColorStop(0,rgba(p.shadow,alpha*.35));g.addColorStop(.24,rgba(p.light,alpha*.12));
      g.addColorStop(.4,rgba(p.light,alpha*.84));g.addColorStop(.58,rgba(p.shadow,alpha*.27));
      g.addColorStop(.78,rgba(p.light,alpha*.72));g.addColorStop(1,rgba(p.shadow,alpha*.16));
      ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(tx,ty);
      ctx.bezierCurveTo(bendX+nx*wide,bendY+ny*wide,sx+nx*wide*.8,sy+ny*wide*.8,px,py);
      ctx.bezierCurveTo(sx-nx*wide*.4,sy-ny*wide*.4,bendX-nx*wide*.8,bendY-ny*wide*.8,tx,ty);ctx.fill();
      ctx.strokeStyle=rgba(p.shadow,alpha*.32);ctx.lineWidth=.85;ctx.stroke();
      ctx.strokeStyle=rgba(p.light,alpha*.82);ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(tx,ty);ctx.bezierCurveTo(bendX+nx*wide*.48,bendY+ny*wide*.48,sx+nx*wide*.3,sy+ny*wide*.3,px,py);ctx.stroke();
    }
    // A short folded edge makes a held pointer visible without an idle loop.
    ctx.strokeStyle=rgba(p.shadow,a*.32);ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(px-8*scale,py+3*scale);ctx.quadraticCurveTo(px,py-7*scale,px+10*scale,py);ctx.stroke();
    ctx.strokeStyle=rgba(p.light,a*.85);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px-8*scale,py+2*scale);ctx.quadraticCurveTo(px,py-8*scale,px+10*scale,py-scale);ctx.stroke();
    return true;
  }
  return false;
}
