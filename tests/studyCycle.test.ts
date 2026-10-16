import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DemoStudyServer,DEMO_ME,DEMO_GROUP} from '../src/lib/study/demo';
import {parseState} from '../src/lib/study/parse';
import {validCycle} from '../src/lib/study/rules';
const free={key:'',courseId:null,task:null,title:null,courseName:null};
test('cycle settings synchronize, enforce ready, use authoritative durations and long breaks every configured round',async()=>{
 const s=new DemoStudyServer('Owner','#a8d98a','#edb7c8',0);const friend=s.members[1].userId;s.setOnline(friend,true);s.openSittingAs(DEMO_ME,2);s.setFocusAs(DEMO_ME,free);s.setFocusAs(friend,free);
 const snap=async()=>parseState(await s.transport.state(DEMO_GROUP))!;
 await s.transport.setDurations!(DEMO_GROUP,35,7,20,2);assert.equal((await snap()).sitting?.longBreakMinutes,20);assert.equal((await snap()).sitting?.sessionsBeforeLong,2);
 await s.transport.startRound(DEMO_GROUP,25,5);assert.equal((await snap()).round,null);
 for(let i=1;i<=3;i++){s.setReadyAs(DEMO_ME,true);s.setReadyAs(friend,true);await s.transport.startRound(DEMO_GROUP,25,5);const v=await snap();assert.equal(v.round?.studyMs,35*60000);assert.equal(v.round?.breakMs,(i===2?20:7)*60000);await assert.rejects(s.transport.setDurations!(DEMO_GROUP,25,5,15,4),/round_running/);s.skipToBoundary();s.skipToBoundary();await assert.rejects(s.transport.setDurations!(DEMO_GROUP,25,5,15,4),/round_running/);s.skipToBoundary();assert.equal((await snap()).round?.seq,i);}
 await assert.rejects(s.transport.setDurations!(DEMO_GROUP,25,5,0,1),/invalid_duration/);
});
test('cycle validators retain old duration calls and reject partial, fractional or out of range settings',()=>{assert.equal(validCycle(undefined,undefined),true);for(const [l,n] of [[15,4],[45,8],[5,2]])assert.equal(validCycle(l,n),true);for(const [l,n] of [[0,4],[15,1],[46,4],[15,9],[15.5,4],[15,undefined]])assert.equal(validCycle(l,n),false);});
