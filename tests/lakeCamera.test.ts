import { test } from "node:test";
import assert from "node:assert/strict";
import { lakeCameraFrame, lakeZoomTarget, type CameraWorld, type Flight } from "../src/lib/pomodoro/lakeCamera";
import { clamp, lerp, smooth, easeInOut } from "../src/lib/pomodoro/math";
import type { Camera } from "../src/lib/pomodoro/lakeWorld";
const settle = (q: number) => Math.sin(Math.PI * smooth(0.62, 1, q));
function legacy(world: CameraWorld, level: number, base: {x:number;y:number}, vel: {x:number;y:number}, pointer: {x:number;y:number;tx:number;ty:number}, dragging: boolean, reduced: boolean, now:number, dt:number, flight:Flight|null) {
let cam:Camera={x:0,y:0,s:1,rot:0};
const gliding=Math.abs(vel.x)+Math.abs(vel.y)>0.002;
        if (flight) {
          const f = flight;
          const q = f.dur > 0 ? clamp((now - f.t0) / f.dur, 0, 1) : 1;
          const e = easeInOut(q);
          const s = Math.exp(lerp(Math.log(f.s0), Math.log(f.s1), e)) * (1 + f.dir * 0.022 * settle(q));
          cam = { x: lerp(f.x0, f.x1, e), y: lerp(f.y0, f.y1, e), s, rot: f.r0 * (1 - e) - f.dir * 0.05 * Math.sin(Math.PI * q) };
          world.plan([{ x: f.x1, y: f.y1, s: f.s1, rot: 0 }], true);
          if (q >= 1) {
            base.x = f.x1;
            base.y = f.y1;
            flight = null;
          }
        } else {
          const s = world.levels[level];
          if (!dragging && gliding) {
            base.x += vel.x * dt;
            base.y += vel.y * dt;
            const k = 0.92 ** (dt / 16);
            vel.x *= k;
            vel.y *= k;
          }
          const [cx, cy] = world.clampCam(base.x, base.y, s);
          if (cx !== base.x) vel.x = 0;
          if (cy !== base.y) vel.y = 0;
          base.x = cx;
          base.y = cy;
          pointer.x += (pointer.tx - pointer.x) * 0.08;
          pointer.y += (pointer.ty - pointer.y) * 0.08;
          const drift = reduced ? 0 : 1;
          cam = {
            x: base.x + (pointer.x * 22 + Math.sin(now * 0.00031) * 3 * drift) / s,
            y: base.y + (pointer.y * 16 + Math.cos(now * 0.00027) * 2.4 * drift) / s,
            s,
            rot: 0,
          };
          // get the next levels up and down ready, so a zoom never waits
          const near: Camera[] = [];
          for (const l of [level + 1, level - 1]) {
            if (l < 0 || l >= world.levels.length) continue;
            const [x, y] = world.clampCam(base.x, base.y, world.levels[l]);
            near.push({ x, y, s: world.levels[l], rot: 0 });
          }
          world.plan(near, false);
        }
return {camera:cam,flight}; }
function world() {
 const plans: unknown[]=[];
 return {levels:[1,0.7,0.4],clampCam:(x:number,y:number,s:number):[number,number]=>[clamp(x,-100/s,100/s),clamp(y,-80/s,80/s)], plan:(cams:Camera[],immediate:boolean)=>{plans.push({cams,immediate});},plans};
}
test("shared lake camera preserves the original trajectory, boundaries, inertia and reduced motion",()=>{
 for(const reduced of [false,true]) for(const dragging of [false,true]) for(const level of [0,1,2]) for(const flying of [false,true]) {
  const a=world(),b=world();const ba={x:150,y:-120},bb={...ba},va={x:.45,y:-.12},vb={...va};
  const pa={x:0,y:0,tx:.7,ty:-.3},pb={...pa};
  let fa:Flight|null=flying?{x0:20,y0:10,s0:1,r0:.04,x1:35,y1:12,s1:.4,t0:100,dur:reduced?0:900,dir:-1}:null;
  let fb=fa?{...fa}:null;
  for(let now=100;now<=1300;now+=16) {
   const old=legacy(a,level,ba,va,pa,dragging,reduced,now,16,fa);
   const next=lakeCameraFrame(b,level,bb,vb,pb,dragging,reduced,now,16,fb);
   assert.deepEqual(next,old);assert.deepEqual(bb,ba);assert.deepEqual(vb,va);assert.deepEqual(pb,pa);assert.deepEqual(b.plans,a.plans);
   fa=old.flight;fb=next.flight;
  }
 }
});
test("zoom keeps the world point beneath a finger, including an interrupted flight",()=>{
 const cam={x:22,y:-10,s:.7,rot:0},at={x:380,y:120};
 const next=lakeZoomTarget(cam,{x:9,y:8},null,.4,600,400,at);
 assert.equal(next.x+(at.x-300)/.4,cam.x+(at.x-300)/.7);
 assert.equal(next.y+(at.y-200)/.4,cam.y+(at.y-200)/.7);
 const f={x0:0,y0:0,s0:1,r0:0,x1:44,y1:55,s1:.4,t0:0,dur:900,dir:-1};
 assert.deepEqual(lakeZoomTarget(cam,{x:9,y:8},f,1,600,400),{x:44,y:55});
});
