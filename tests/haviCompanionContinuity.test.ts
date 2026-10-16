import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionContinuity, companionIdle } from '../src/lib/haviCompanionContinuity';
import { sharedMotion, soloDuration, sharedDuration, soloMotion } from '../src/lib/haviCompanionMotion';

const body = (left:number,pose='stand') => ({left,top:100,pose,phase:0,faceLeft:false,head:0,tail:0,lift:0});

test('moving the card translates the entire actor without spring lag or false footsteps',()=>{
 const actor=createCompanionContinuity('tiger');try{
  const a=actor.sample(body(20),0);actor.translate(40,-80);
  const b=actor.sample({...body(60),top:20},16);
  assert.equal(b.left,a.left+40);assert.equal(b.top,a.top-80);
  assert.equal(b.phase,0);assert.equal(b.faceLeft,a.faceLeft);assert.equal(actor.settled(),true);
  actor.reset();const c=actor.sample(body(20),32);assert.equal(c.left,20);assert.equal(c.top,100);
 }finally{actor.dispose();}
});

test('floor translation preserves an ongoing trajectory and its velocity',()=>{
 const a=createCompanionContinuity('fox'),b=createCompanionContinuity('fox');try{
  a.sample(body(20),0);b.sample(body(20),0);
  for(let t=16;t<=160;t+=16){a.sample(body(300),t);b.sample(body(300),t);}
  b.translate(-80,40);
  for(let t=176;t<=1000;t+=16){const first=a.sample(body(300),t),shifted=b.sample({...body(220),top:140},t);assert.ok(Math.abs(shifted.left-(first.left-80))<.001);assert.ok(Math.abs(shifted.top-(first.top+40))<.001);assert.equal(shifted.phase,first.phase);}
 }finally{a.dispose();b.dispose();}
});

test('retargets preserve the rendered position, rather than jumping to a new lane endpoint',()=>{
 const actor=createCompanionContinuity('tiger');try {
  actor.sample(body(20),0);const first=actor.sample(body(300),16);assert.ok(first.left<25);
  let a=first;for(let t=32;t<=1800;t+=16)a=actor.sample(body(300),t);
  assert.ok(Math.abs(a.left-300)<.1);
  const moved=actor.sample(body(450),1816);assert.ok(moved.left<310);
 }finally{actor.dispose();}
});

test('a suspended Motion owner resumes at its old position even after a long hidden interval',()=>{
 const actor=createCompanionContinuity('fox');try{
  actor.sample(body(20),0);let a=body(20);for(let t=16;t<=160;t+=16)a=actor.sample(body(300),t);
  actor.pause(160);actor.resume(100000);const resumed=actor.sample(body(300),100000);
  assert.ok(Math.abs(resumed.left-a.left)<.01);
 }finally{actor.dispose();}
});

test('fold/wake use existing pixel poses and never an instant sleeping-to-standing switch',()=>{
 const actor=createCompanionContinuity('tiger');try{
  actor.sample(body(20,'curl'),0);assert.equal(actor.sample(body(20),16).pose,'curl');
  let a=body(20);for(let t=32;t<=272;t+=16)a=actor.sample(body(20),t);assert.equal(a.pose,'sniff');
  for(let t=288;t<=560;t+=16)a=actor.sample(body(20),t);assert.equal(a.pose,'stand');
  assert.equal(actor.sample(body(20,'curl'),576).pose,'sniff');
  for(let t=592;t<=1008;t+=16)a=actor.sample(body(20,'curl'),t);assert.equal(a.pose,'curl');
 }finally{actor.dispose();}
});

test('finite actions end explicitly while quiet idle has restrained living details',()=>{
 for(const mode of ['guard','leaf','hop']){
  const end=soloDuration(mode);assert.ok(end>0&&end<10);
  assert.equal(soloMotion('tiger',mode,end-.01,{left:0,right:300},68,4).done,false);
  assert.equal(soloMotion('tiger',mode,end,{left:0,right:300},68,4).done,true);
 }
 assert.notDeepEqual(companionIdle(0),companionIdle(2));assert.equal(companionIdle(2,true).pose,'curl');
 for(const mode of ['greet','follow','leaf','rest'])assert.ok(sharedDuration(mode)>0);
});

test('all shared scenes preserve either existing animal order and full footprint clearance',()=>{
 const sizes={fox:{width:75,scale:5},tiger:{width:68,scale:4}};
 for(const leftKind of ['fox','tiger'])for(const mode of ['greet','follow','leaf','rest'])for(const span of [161,210,350])for(let t=0;t<=8;t+=.1){
  const a=sharedMotion(mode,t,{left:10,right:10+span},sizes,leftKind)!;
  const left=leftKind==='fox'?a.fox:a.tiger,right=leftKind==='fox'?a.tiger:a.fox,width=leftKind==='fox'?75:68;
  assert.ok(left.left>=10-.001&&right.left+(leftKind==='fox'?68:75)<=10+span+.001);
  assert.ok(right.left-left.left-width>=17.99);
 }
});
