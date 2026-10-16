import { test } from "node:test";
import assert from "node:assert/strict";
import { createGroupSession, type ChannelHandlers, type SessionEnv, type StudyTransport } from "@/lib/study/session";
import { roomPresence, snapshotPresence } from "@/lib/study/rules";
import { parseState } from "@/lib/study/parse";

const G = "11111111-1111-4111-8111-111111111111";
const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PEER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const flush = async () => { for (let i=0;i<8;i++) await new Promise(setImmediate); };

function fixture(capable=true, legacy=false) {
  let now=Date.parse("2026-10-12T12:00:00Z"), hidden=false, version=1;
  let peerAwake=true, peerOnPage=true, localServerAwake=true;
  let handlers: ChannelHandlers;
  const intervals=new Map<number,()=>void>();
  const visibility=new Set<()=>void>();
  const calls={ page:0, state:0, track:0, taps:0 };
  const raw=()=>({server_time:new Date(now).toISOString(), legacy_presence:legacy,
    group:{id:G,name:"Test",version,epoch:1,is_owner:true,cap:10},sitting:null,round:null,
    members:[ME,PEER].map((id,i)=>({user_id:id,seat:i,display_name:id,havi_name:"Havi",
      havi_color:"#aabbcc",flower_color:"#ffffff",is_owner:i===0,is_me:i===0,fresh:i===0?localServerAwake:peerAwake,
      ...(capable?{on_page:i===0?true:peerOnPage,awake:i===0?localServerAwake:peerAwake}:{}),}))});
  const env:SessionEnv={now:()=>now,isHidden:()=>hidden,handheld:true,randomId:()=>G,
    setInterval:(fn,ms)=>{intervals.set(ms,fn);return ms;},clearInterval:h=>{intervals.delete(h as number);},
    setTimeout:()=>0,clearTimeout:()=>{},onVisibilityChange:fn=>{visibility.add(fn);return()=>{visibility.delete(fn);};},onOnline:()=>()=>{}};
  const reply=async()=>raw();
  const transport:StudyTransport={state:async()=>{calls.state++;return raw();},heartbeat:reply,
    pageState:async()=>{calls.page++;return raw();},openSitting:reply,setDesks:reply,startRound:reply,
    pauseRound:reply,resumeRound:reply,leaveRound:reply,
    poke:async()=>{calls.taps++;return true;},
    openChannel:async(_topic,_id,h)=>{handlers=h;return{track:async()=>{calls.track++;},close:async()=>{}};}};
  const session=createGroupSession(G,ME,transport,env);
  return {session,calls,raw,async subscribe(){await flush();handlers.onStatus("subscribed");await flush();},
    async minute(){for(let i=0;i<6;i++){now+=10_000;intervals.get(10_000)?.();await flush();}},
    async hide(){hidden=true;for(const fn of visibility)fn();await flush();},
    async peer(awake:boolean,onPage:boolean){peerAwake=awake;peerOnPage=onPage;version++;session.refresh();await flush();},
    async loseChannel(){handlers.onStatus("closed");await flush();},
    deliverTaps(){for(let i=0;i<5;i++)handlers.onPoke(PEER,`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`);},
    keepOtherDevice(){localServerAwake=true;},
  };
}

test("capable idle minute renews six leases without Presence tracks or peer refetches",async()=>{
  const f=fixture();await f.subscribe();const before={...f.calls};
  await f.minute();assert.equal(f.calls.page-before.page,6);assert.equal(f.calls.track-before.track,0);
  assert.equal(f.calls.state-before.state,0);
  let taps=0;f.session.onPoke(()=>taps++);f.deliverTaps();assert.equal(taps,5);
  await f.peer(false,true);assert.equal(f.session.view().awake.get(PEER),false);
  await f.peer(false,false);assert.equal(f.session.view().awake.has(PEER),false);
  await f.hide();assert.equal(f.session.view().awake.get(ME),true,"other awake device preserves account display");
  await f.loseChannel();assert.equal(f.session.view().awake.get(ME),true);
  const page=f.calls.page;await f.minute();assert.equal(f.calls.page-page,6,"lease survives websocket failure");
  f.session.dispose();
});

test("old-server fallback and transition release keep expiring timestamped Presence renewals",async()=>{
  for(const [capable,legacy] of [[false,false],[true,true]]){
    const f=fixture(capable,legacy);await f.subscribe();const count=f.calls.track;
    await f.minute();assert.equal(f.calls.track-count,6);f.session.dispose();
  }
});

test("presence capability is strict and desk membership differs from awake eligibility",()=>{
  const f=fixture();const raw=f.raw();raw.members[1].awake=false;raw.members[1].fresh=false;
  const state=parseState(raw)!;assert.equal(snapshotPresence(state),true);
  assert.equal(roomPresence(state,ME,true).get(PEER),false);
  delete (raw.members[1] as {awake?:boolean}).awake;
  assert.equal(snapshotPresence(parseState(raw)!),false);
  f.session.dispose();
});
