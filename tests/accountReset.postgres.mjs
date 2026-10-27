// Disposable in-memory PostgreSQL only. Never connects to Supabase.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
// Optional isolated test runtime; PGLITE_MODULE can be a file: URL to an
// existing @electric-sql/pglite installation. No production dependency added.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const uid = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const op = '33333333-3333-4333-8333-333333333333', restore = '44444444-4444-4444-8444-444444444444';
const seed = `
create role anon; create role authenticated; create role service_role;
create schema auth; create schema backup; create schema study; create schema cron;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
grant usage on schema public,auth to anon,authenticated,service_role;
grant execute on function auth.uid() to public;
create table profiles(id uuid primary key references auth.users(id),full_name text,preferences jsonb not null default '{}');
create table semesters(id uuid primary key,user_id uuid references auth.users(id),name text,is_active boolean,progress jsonb);
create unique index active_term on semesters(user_id) where is_active;
create table courses(id uuid primary key,user_id uuid references auth.users(id),semester_id uuid references semesters(id),name text);
create table scheduled_pushes(id uuid primary key,user_id uuid references auth.users(id),send_at timestamptz,sent_at timestamptz,cancelled_at timestamptz);
create table study.members(group_id uuid,user_id uuid references auth.users(id),havi_name text,havi_color text,flower_color text,primary key(group_id,user_id));
create table study.room_pages(user_id uuid,is_open boolean,awake boolean);
create table study.ready_choices(user_id uuid);
create table study.focus_choices(user_id uuid);
create table study.rounds(id uuid primary key,starts_at timestamptz);
create table study.awards(id uuid primary key,user_id uuid,round_id uuid references study.rounds(id),applied_at timestamptz);
create function backup.guard_preferences() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce((new.preferences->>'xp')::int,0)<coalesce((old.preferences->>'xp')::int,0) then new.preferences:=old.preferences; end if;
 return new;
end;
$$;
create trigger profiles_guard_preferences before update of preferences on profiles for each row execute function backup.guard_preferences();
create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
insert into auth.users values('${uid}'),('${other}');
insert into profiles values('${uid}','Fixture A','{"xp":50,"theme":"rose","onboardingSeen":true}'),('${other}','Fixture B','{"xp":90}');
insert into semesters values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${uid}','Old term',false,'{"xp":10}'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','${uid}','Current term',true,'{"xp":50}'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${other}','Other term',true,'{"xp":90}');
insert into courses values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','${uid}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Old course'),('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','${uid}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','New course'),('ffffffff-ffff-4fff-8fff-ffffffffffff','${other}','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Other course');
insert into study.members values('99999999-9999-4999-8999-999999999999','${uid}','Fixture Havi','#123456','#abcdef'),('99999999-9999-4999-8999-999999999999','${other}','Other Havi','#654321','#fedcba');
insert into study.room_pages values('${uid}',true,true),('${other}',true,true);
insert into study.ready_choices values('${uid}'),('${other}');
insert into study.focus_choices values('${uid}'),('${other}');
insert into scheduled_pushes values('10101010-1010-4010-8010-101010101010','${uid}',clock_timestamp()+interval '1 day',null,null),('20202020-2020-4020-8020-202020202020','${uid}',clock_timestamp()-interval '1 day',null,null),('30303030-3030-4030-8030-303030303030','${uid}',clock_timestamp()-interval '1 day',clock_timestamp(),null),('40404040-4040-4040-8040-404040404040','${other}',clock_timestamp()+interval '1 day',null,null);
`;
let checks=0;
function check(ok,message){assert.ok(ok,message);checks++;console.log('PASS '+message);}
async function query(sql,args=[]){return (await db.query(sql,args)).rows;}
async function as(user,gen){await query("select set_config('test.uid',$1,false),set_config('request.headers',$2,false)",[user,gen===null?'{}':JSON.stringify({'x-haven-data-generation':String(gen)})]);}
try {
 await db.exec(seed);
 for(const t of ['grade_components','attendance_sessions','attendance_absences','timetable_entries','tasks','planner_items']){
  await db.exec(`create table ${t}(id uuid primary key,user_id uuid references auth.users(id),course_id uuid references courses(id),semester_id uuid references semesters(id),value text);`);
  await query(`insert into ${t} values(gen_random_uuid(),$1,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','fixture')`,[uid]);
 }
 await db.exec(await readFile(new URL('../supabase/migrations/20261027110944_account_data_reset_recovery.sql',import.meta.url),'utf8'));
 check(true,'migration compiles on real isolated PostgreSQL');
 await as(uid,null);
 const first=(await query('select public.account_data_reset($1,0,$2) as s',[op,uid]))[0].s;
 check(first.generation===1&&first.snapshots.length===1,'reset produces one recoverable snapshot and advances generation');
 check(Math.abs((Date.parse(first.latest.expiresAt)-Date.parse(first.latest.createdAt))/86400000-30)<0.001,'each recovery copy has a thirty-day expiry');
 check(!JSON.stringify(first).includes('payload'),'public status exposes metadata only');
 check((await query('select count(*)::int n from courses where user_id=$1',[uid]))[0].n===0,'all terms courses removed');
 check((await query('select count(*)::int n from semesters where user_id=$1',[uid]))[0].n===0,'all terms progress removed');
 for(const t of ['grade_components','attendance_sessions','attendance_absences','timetable_entries','tasks','planner_items'])check((await query(`select count(*)::int n from ${t} where user_id=$1`,[uid]))[0].n===0,`${t} is cleared across terms`);
 check((await query('select count(*)::int n from scheduled_pushes where user_id=$1 and sent_at is null and cancelled_at is null',[uid]))[0].n===0,'all prior pending reminders are cancelled');
 check((await query('select havi_name from study.members where user_id=$1',[uid]))[0].havi_name==='Havi','personal appearance resets without deleting shared membership');
 check((await query('select is_open from study.room_pages where user_id=$1',[other]))[0].is_open===true,'another member remains in the shared session');
 check((await query('select count(*)::int n from courses where user_id=$1',[other]))[0].n===1,'another account remains untouched');
 check((await query('select preferences from profiles where id=$1',[uid]))[0].preferences.xp===undefined,'authorized reset bypasses counter guard only inside its transaction');
 const duplicate=(await query('select public.account_data_reset($1,0,$2) as s',[op,uid]))[0].s;
 check(duplicate.generation===1&&duplicate.snapshots.length===1,'duplicate request does not reset twice');
 await assert.rejects(()=>query("update profiles set preferences='{}' where id=$1",[uid]),/reload before saving/);check(true,'legacy/missing generation cannot recreate data after reset');
 await as(uid,1);
 await query("insert into semesters values('abababab-abab-4bab-8bab-abababababab',$1,'After reset',true,'{}')",[uid]);
 await query("insert into courses values('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',$1,'abababab-abab-4bab-8bab-abababababab','Fresh course')",[uid]);
 const restored=(await query('select public.account_data_restore($1,1,$2,$3) s',[restore,op,uid]))[0].s;
 check(restored.generation===2&&restored.snapshots.length===2,'restore first preserves newer state as another snapshot');
 check((await query('select count(*)::int n from semesters where user_id=$1',[uid]))[0].n===2,'restore returns the complete previous semester state');
 check((await query('select count(*)::int n from courses where user_id=$1',[uid]))[0].n===2,'restore returns all previous courses');
 check((await query('select preferences from profiles where id=$1',[uid]))[0].preferences.xp===50,'restore returns previous progress');
 for(const t of ['grade_components','attendance_sessions','attendance_absences','timetable_entries','tasks','planner_items'])check((await query(`select count(*)::int n from ${t} where user_id=$1`,[uid]))[0].n===1,`${t} is restored with original keys and values`);
 check((await query('select havi_name from study.members where user_id=$1',[uid]))[0].havi_name==='Fixture Havi','restore returns owned appearance');
 check((await query('select count(*)::int n from scheduled_pushes where user_id=$1 and sent_at is null and cancelled_at is null',[uid]))[0].n===1,'restore reactivates only future unsent reminders');
 await as(uid,2);
 await query("update profiles set preferences='{\"xp\":0}' where id=$1",[uid]);
 check((await query('select preferences from profiles where id=$1',[uid]))[0].preferences.xp===50,'ordinary saves retain the original monotonic guard after restore');
 await query('update study.room_pages set is_open=false where user_id=$1',[other]);
 check(true,'existing authorized host-side room mutations are not rejected by the generation fence');
 const again='55555555-5555-4555-8555-555555555555';
 await query('select public.account_data_restore($1,2,$2,$3)',[again,restore,uid]);
 check((await query('select name from courses where user_id=$1',[uid]))[0].name==='Fresh course','newer state can itself be restored');
 await as(other,0);
 await assert.rejects(()=>query('select public.account_data_restore(gen_random_uuid(),0,$1,$2)',[op,other]),/unavailable/);check(true,'cross-account restore is rejected');
 await assert.rejects(()=>query('select public.account_data_reset(gen_random_uuid(),0,$1)',[uid]),/authenticated/i);check(true,'an account switch cannot reset the newly signed-in account');
 await as('',null);
 await assert.rejects(()=>query('select public.account_data_reset(gen_random_uuid(),0,$1)',[uid]),/authenticated/i);check(true,'unauthenticated reset is rejected');
 await query('update account_reset.snapshots set expires_at=created_at+interval \'1 second\',created_at=created_at-interval \'2 days\' where id=$1',[op]);
 // Use transaction timestamp, not modified payload/client-supplied data.
 await query("update account_reset.snapshots set expires_at=clock_timestamp()-interval '1 day',created_at=clock_timestamp()-interval '2 days' where id=$1",[op]);
 await as(uid,3);
 await assert.rejects(()=>query('select public.account_data_restore(gen_random_uuid(),3,$1,$2)',[op,uid]),/unavailable/);check(true,'expired recovery cannot be restored');
 const count=(await query('select count(*)::int n from courses where user_id=$1',[uid]))[0].n;
 await db.exec(`create function public.fixture_failure() returns trigger language plpgsql as $$begin raise exception 'forced fixture failure';end$$;create trigger fixture_failure before delete on public.semesters for each row execute function public.fixture_failure();`);
 await assert.rejects(()=>query('select public.account_data_reset(gen_random_uuid(),3,$1)',[uid]),/forced fixture failure/);
 check((await query('select count(*)::int n from courses where user_id=$1',[uid]))[0].n===count,'late failure rolls back already-deleted child rows');
 check((await query('select generation from account_reset.state where user_id=$1',[uid]))[0].generation===3,'late failure rolls back generation and snapshot');
 await db.exec('drop trigger fixture_failure on public.semesters');
 const perms=(await query("select has_function_privilege('anon','public.account_data_reset(uuid,bigint,uuid)','execute') a,has_function_privilege('authenticated','public.account_data_reset(uuid,bigint,uuid)','execute') b,has_schema_privilege('authenticated','account_reset','usage') c"))[0];
 check(!perms.a&&perms.b&&!perms.c,'only authenticated wrapper access; payload schema remains private');
 await db.exec('set role authenticated');
 await assert.rejects(()=>query('select payload from account_reset.snapshots'),/permission denied/);check(true,'authenticated sessions cannot read recovery payloads directly');
 const authenticatedStatus=(await query('select public.account_data_status() s'))[0].s;
 check(authenticatedStatus.generation===3,'authenticated status wrapper works without granting private schema access');
 await db.exec('reset role');
 await as('',null);
 await query("insert into study.rounds values('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',clock_timestamp()-interval '1 day')");
 await query("insert into study.awards values(gen_random_uuid(),$1,'11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',null)",[uid]);
 check((await query('select applied_at from study.awards where user_id=$1',[uid]))[0].applied_at!==null,'late pre-reset award cannot recreate cleared progress');
 console.log(JSON.stringify({passed:checks,engine:'PostgreSQL 18.6 / PGlite',productionConnections:0}));
} finally {await db.close();}
