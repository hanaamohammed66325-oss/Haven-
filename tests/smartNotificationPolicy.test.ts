import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smartCandidates } from '@/lib/smartNotificationPolicy';
import type { Suggestion } from '@/lib/smartSuggestions';
import type { Semester } from '@/types';
const semester = { startDate:'2026-08-23', endDate:'2027-01-01' } as Semester;
const s = (kind: Suggestion['kind'], id: string = kind): Suggestion => ({kind,id,text:'body',priority:1,color:'x'});
const now = new Date('2026-10-07T12:00:00');
test('season identity survives reopening, date and language changes, but changes by term', () => {
 const a=smartCandidates([s('midterm-week')],semester,now)[0];
 const b=smartCandidates([{...s('midterm-week'),text:'Arabic'}],semester,new Date('2026-10-08'))[0];
 assert.equal(a.key,b.key); assert.equal(a.cooldownDays,0);
 assert.notEqual(a.key,smartCandidates([s('midterm-week')],{...semester,startDate:'2027-08-23'},now)[0].key);
});
test('no daily fallback, checkin duplicate, or smart absence route', () => {
 assert.deepEqual(smartCandidates([s('all-good'),s('checkin'),s('att-warn'),s('att-danger')],semester,now),[]);
});
test('deadline sends only tomorrow and today, each with a separate stable identity', () => {
 const item=s('exam','exam-2026-10-08-Math');
 assert.equal(smartCandidates([item],semester,new Date('2026-10-06T12:00:00')).length,0);
 const a=smartCandidates([item],semester,now)[0];
 const b=smartCandidates([item],semester,new Date('2026-10-08T12:00:00'))[0];
 assert.notEqual(a.key,b.key);
 assert.equal(smartCandidates([item],semester,new Date('2026-10-09T12:00:00')).length,0);
 assert.notEqual(a.key,smartCandidates([s('exam','exam-2026-10-09-Math')],semester,new Date('2026-10-08T12:00:00'))[0].key);
});
test('nonurgent suggestions have a seven-day rolling cooldown',()=>{
 assert.deepEqual(smartCandidates([s('ungraded'),s('gpa-goal')],semester,now).map(c=>c.cooldownDays),[7,7]);
});
