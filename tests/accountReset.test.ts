import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const id = '11111111-1111-4111-8111-111111111111';
const operation = '22222222-2222-4222-8222-222222222222';
const row = { id: operation, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+30*86400000).toISOString(), kind: 'reset', sourceId: null };
function harness(options: { rpcError?: string; commitFail?: boolean; prepareFail?: boolean; readFail?: boolean } = {}) {
  let state: any = { generation: 0, snapshots: [], latest: null }, clears=0, cancels=0, commits=0, prepares=0;
  const events: string[] = [], memory = new Map<string,string>(), calls: any[]=[];
  const storage = {
    async prepareLocalDataChange() { prepares++; if(options.prepareFail) throw Error('quota'); return operation; },
    async commitLocalDataChange() { commits++; if(options.commitFail) throw Error('quota'); },
    async cancelLocalDataChange(...args: any[]) { cancels++; calls.push(['cancel',...args]); },
    async pendingLocalDataChange() { return null; }, async reconcileLocalData() {},
  };
  const supabase = { async rpc(name: string,args: any) {
    calls.push([name,args]);
    if (name === 'account_data_status') {
      if(options.readFail) return {error:{code:'network'}};
      return {data:state,error:null};
    }
    if(options.rpcError) return {error:{code:options.rpcError}};
    state={generation:1,snapshots:[row],latest:row}; return {data:state,error:null};
  }};
  const imports: Record<string,any> = { './supabase':{supabase}, './accountResetLocal':storage, './study/activeRoom':{clearActiveRoom(){clears++;}} };
  const output: any = {};
  const script=ts.transpileModule(readFileSync('src/lib/accountReset.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(script,{exports:output,require:(key:string)=>{assert.ok(key in imports,key);return imports[key];},
    Headers,Response,Event,Date,Promise,Set,console,
    navigator:{locks:{request:async (_:string,work:()=>any)=>work()}},
    window:{dispatchEvent:(e:Event)=>events.push(e.type)},
    localStorage:{getItem:(k:string)=>memory.get(k)??null},
  });
  output.bindAccountGeneration(id,0);
  return { api:output,events,memory,calls,storage,get clears(){return clears;},get cancels(){return cancels;},get commits(){return commits;},get prepares(){return prepares;} };
}
test('reset awaits participants and in-flight saves, then confirms local and server state before success',async()=>{
  const h=harness(); let release!:()=>void, flushed=false;
  h.api.onAccountDataQuiesce(async()=>{flushed=true;});
  h.api.trackAccountWrite(new Promise<void>(r=>{release=r;}));
  const changing=h.api.changeAccountData(id); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.prepares,0); assert.equal(h.api.accountDataChanging(),true);
  release(); const result=await changing;
  assert.equal(flushed,true); assert.equal(result.generation,1); assert.equal(h.commits,1);
  assert.equal(h.api.currentDataGeneration(id),1); assert.equal(h.clears,1);
  assert.deepEqual(h.events,['haven-account-data-quiesce','haven-account-data-change']);
  assert.equal(h.api.accountDataChanging(),true,'old React state stays fenced until reload');
});
test('a failed snapshot does not call the destructive RPC or cancel another operation',async()=>{
  const h=harness({prepareFail:true});
  await assert.rejects(h.api.changeAccountData(id),/quota/);
  assert.equal(h.calls.filter(c=>c[0]==='account_data_reset').length,0); assert.equal(h.cancels,0);
  assert.equal(h.api.accountDataChanging(),false);
});
test('participant save failure aborts before snapshot or RPC',async()=>{
  const h=harness(); h.api.onAccountDataQuiesce(()=>{throw Error('notes_conflict');});
  await assert.rejects(h.api.changeAccountData(id),/notes_conflict/); assert.equal(h.prepares,0); assert.equal(h.cancels,0);
});
test('ambiguous transport failure retains the journal and fences old writes',async()=>{
  const h=harness({rpcError:'network'});
  await assert.rejects(h.api.changeAccountData(id),/reset_unconfirmed/);
  assert.equal(h.cancels,0); assert.equal(h.api.accountDataChanging(),true); assert.equal(h.commits,0);
});
test('definitive stale-generation rejection cancels only the matching local operation',async()=>{
  const h=harness({rpcError:'40001'});
  await assert.rejects(h.api.changeAccountData(id),/reset_failed/);
  assert.equal(h.cancels,1); assert.deepEqual(h.calls.find(c=>c[0]==='cancel'),['cancel',id,0,operation]);
  assert.equal(h.api.accountDataChanging(),false);
});
test('server commit plus device failure cannot be reported as success or unblocked',async()=>{
  const h=harness({commitFail:true});
  await assert.rejects(h.api.changeAccountData(id),/reset_device_pending/);
  assert.equal(h.cancels,0); assert.equal(h.api.accountDataChanging(),true); assert.equal(h.events.includes('haven-account-data-change'),false);
});
test('duplicate clicks and another account are rejected',async()=>{
  const h=harness(); await assert.rejects(h.api.changeAccountData('other'),/reset_busy/);
  const first=h.api.changeAccountData(id); await assert.rejects(h.api.changeAccountData(id),/reset_busy/); await first;
  assert.equal(h.prepares,1);
});
test('expired or unknown restore is rejected before a snapshot or mutation',async()=>{
  const h=harness(); await assert.rejects(h.api.changeAccountData(id,operation),/reset_expired/);
  assert.equal(h.prepares,0); assert.equal(h.cancels,0);
});
test('another tab pending stamp and newer generation block local writes without touching auth',()=>{
  const h=harness(); h.memory.set(`haven-data-generation:${id}`,'pending:other-operation');
  assert.equal(h.api.localDataWriteAllowed(`account:${id}`),false);
  h.memory.set(`haven-data-generation:${id}`,'1'); assert.equal(h.api.deviceDataWriteAllowed(),false);
  h.memory.set(`haven-data-generation:${id}`,'0'); assert.equal(h.api.deviceDataWriteAllowed(),true);
  assert.equal(h.api.dataRequestHeaders({'authorization':'fixture'}).get('authorization'),'fixture');
  assert.equal(h.api.dataRequestHeaders().get('x-haven-data-generation'),'0');
});
