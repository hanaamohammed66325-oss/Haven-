import test from "node:test";
import assert from "node:assert/strict";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { sendPoke } from "@/lib/study/pokeTransport";
import { openPokeChannel } from "@/lib/study/pokeChannel";

const flush = async () => { for (let i=0;i<5;i++) await new Promise<void>(resolve=>setImmediate(resolve)); };
function sdk() {
  const channels: Array<any> = [];
  const client = {
    channel(topic: string, options: unknown) {
      const entry = {topic,options,status: (_s:string)=>{},events:new Map<string,Function>(),presence:{} as Record<string,any[]>,removed:false,sends:[] as any[],tracks:[] as any[],reply:'ok'};
      const ch = {on(_type:string,{event}:{event:string},fn:Function){entry.events.set(event,fn);return ch;},subscribe(fn:(s:string)=>void){entry.status=fn;return ch;},
        presenceState:()=>entry.presence,track:async(p:unknown)=>{entry.tracks.push(p);},send:async(p:unknown)=>{entry.sends.push(p);return entry.reply;},entry};
      channels.push(entry);return ch as unknown as RealtimeChannel;
    },
    async removeChannel(ch:RealtimeChannel){const entry=(ch as any).entry;entry.removed=true;entry.status('CLOSED');},
  };
  return {client,channels};
}

test("direct channel is isolated, acknowledged, and falls back until all recipients support it",async()=>{
  const {client,channels}=sdk();const seen:unknown[]=[];
  const link=openPokeChannel(client,'study:group:1','me',p=>seen.push(p));
  assert.equal(await link.send('peer','tap',['me','peer']),false);
  await flush();const ch=channels[0];
  assert.equal(ch.topic,'study:group:1:pokes');
  assert.deepEqual(ch.options,{config:{private:true,broadcast:{ack:true},presence:{key:'me',enabled:true}}});
  assert.equal(ch.events.has('changed'),false);
  ch.status('SUBSCRIBED');await flush();assert.deepEqual(ch.tracks,[{poke_transport:1}]);
  assert.equal(await link.send('peer','tap',['me','peer']),false);
  ch.presence.peer=[{poke_transport:1}];
  assert.equal(await link.send('peer','tap',['me','peer']),true);
  assert.deepEqual(ch.sends,[{type:'broadcast',event:'poke',payload:{target:'peer',tap:'tap'}}]);
  assert.equal(await link.send('peer','tap2',['me','peer','legacy']),false);
  ch.events.get('poke')!({payload:{target:'peer',tap:'tap'}});assert.equal(seen.length,1);
  ch.reply='timed out';assert.equal(await link.send('peer','tap3',['peer']),false);
  await link.close();assert.equal(ch.removed,true);
  ch.events.get('poke')!({payload:{}});assert.equal(seen.length,1);
  assert.equal(await link.send('peer','late',['peer']),false);
});

test("closed poke channel reconnects once, cancellation stops late callbacks and timers",async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {client,channels}=sdk();const link=openPokeChannel(client,'study:group:2','me',()=>{});
  await flush();channels[0].status('CLOSED');t.mock.timers.tick(3000);await flush();assert.equal(channels.length,2);
  channels[1].status('CLOSED');await link.close();t.mock.timers.tick(60000);await flush();assert.equal(channels.length,2);
});

test("provider-independent dispatch keeps id on failures and does not send after disposal",async()=>{
  let rpcs=0;const fallback=async()=>{rpcs++;return true;};
  assert.equal(await sendPoke({send:async()=>true},'a','id',[],fallback,()=>true),true);assert.equal(rpcs,0);
  for(const sender of [null,{send:async()=>false},{send:async()=>{throw Error('offline')}}])await sendPoke(sender,'a','id',[],fallback,()=>true);
  assert.equal(rpcs,3);
  let live=true;await sendPoke({send:async()=>{live=false;return false}},'a','same-id',[],fallback,()=>live);assert.equal(rpcs,3);
  await sendPoke(null,'a','id',[],fallback,()=>false);assert.equal(rpcs,3);
});
