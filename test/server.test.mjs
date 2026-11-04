import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

const dir=mkdtempSync(join(tmpdir(),'zhuxu-test-'));
let proc,base;
async function start(){proc=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'0',DB_PATH:join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe']});let output='';base=await new Promise((resolve,reject)=>{proc.stdout.on('data',c=>{output+=c;const m=output.match(/端口 (\d+)/);if(m)resolve('http://127.0.0.1:'+m[1]);});proc.stderr.on('data',c=>{output+=c;});proc.once('exit',code=>reject(new Error('启动失败 '+code+' '+output)));});}
async function stop(){if(proc && proc.exitCode===null){const end=once(proc,'exit');proc.kill();await end;}}
async function request(path,body,method='POST'){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
before(start);after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});
test('initial state contains the five-person roster and a complete demo workflow',async()=>{const s=await(await fetch(base+'/api/state')).json();assert.deepEqual(s.members.map(m=>m.name),['杨彦杰','张宏浩','岳普泽','牟平','高洪剑']);assert.equal(s.members.find(m=>m.name==='张宏浩').coordinator,true);assert.equal(s.collaborationPolicy.taskCreation,'all-members');assert.equal(s.collaborationPolicy.taskAssignment,'all-members');assert.equal(s.collaborationPolicy.projectVisibility,'all-members');assert.equal(s.roles.length,9);assert.equal(s.members[1].roleIds.length,3);assert.equal(s.projects.length,4);assert.ok(s.stages.includes('3D拆件'));assert.equal(s.tasks.length,8);assert.equal(s.demo,true);});
test('project, task, work log, status update and restart persistence',async()=>{
 const p=await request('/api/projects',{name:'集成测试项目',collection:'测试',category:'戒指',stage:'2D设计',owner:'m1',due:'2026-12-01',tone:'silver'});assert.equal(p.status,201);
 const t=await request('/api/tasks',{title:'测试任务',projectId:p.body.id,assignee:'m2',stage:'3D设计',due:'2026-12-01',estimate:2});assert.equal(t.status,201);assert.equal(t.body.status,'待开始');
 const log=await request('/api/logs',{taskId:t.body.id,memberId:'m2',date:'2026-11-04',hours:1.5,quantity:2,note:'完成模型',link:'https://example.com/model'});assert.equal(log.status,201);
 assert.equal((await request('/api/tasks/'+t.body.id,{status:'已完成'},'PATCH')).body.status,'已完成');
 assert.equal((await request('/api/projects/'+p.body.id,{stage:'生产加工'},'PATCH')).body.stage,'生产加工');
 await stop();await start();const s=await(await fetch(base+'/api/state')).json();assert.equal(s.tasks.find(x=>x.id===t.body.id).status,'已完成');assert.equal(s.logs.find(x=>x.id===log.body.id).hours,1.5);assert.equal(s.projects.length,5);
});
test('validation rejects bad references, invalid dates, hours, quantities and unsafe links',async()=>{
 const valid={taskId:'t1',memberId:'m1',date:'2026-11-04',hours:1,quantity:1,note:'测试',link:''};
 for(const change of [{hours:-1},{hours:25},{hours:'no'},{quantity:1.5},{quantity:-1},{link:'javascript:alert(1)'},{memberId:'missing'},{taskId:'missing'},{date:'2026-02-30'},{note:''}]) assert.equal((await request('/api/logs',{...valid,...change})).status,400);
 assert.equal((await request('/api/tasks/t1',{status:'invalid'},'PATCH')).status,400);
 assert.equal((await request('/api/tasks/missing',{status:'已完成'},'PATCH')).status,404);
});
test('two independent subscribers receive live updates',async()=>{
 const controllers=[new AbortController(),new AbortController()];const readers=[];
 try{
  for(const c of controllers){const r=await fetch(base+'/api/events',{signal:c.signal});assert.equal(r.headers.get('content-type'),'text/event-stream');const reader=r.body.getReader();readers.push(reader);assert.match(new TextDecoder().decode((await reader.read()).value),/connected/);}
  const waits=readers.map(async reader=>{const result=await reader.read();return new TextDecoder().decode(result.value);});
  await request('/api/tasks/t1',{status:'进行中'},'PATCH');
  const timeout=setTimeout(()=>controllers.forEach(c=>c.abort()),3000);
  try {for(const result of await Promise.all(waits))assert.match(result,/data: changed/);}finally{clearTimeout(timeout);}
 }finally{controllers.forEach(c=>c.abort());}
});
test('serves frontend with security headers and rejects unknown paths',async()=>{const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/铸序/);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal((await fetch(base+'/server.mjs')).status,404);assert.equal((await fetch(base+'/api/missing')).status,404);});
test('configurable members and roles preserve history while preventing invalid assignments',async()=>{
 const r=await request('/api/roles',{name:'包装与发货'});assert.equal(r.status,201);
 assert.equal((await request('/api/roles',{name:'包装与发货'})).status,400);
 const m=await request('/api/members',{name:'测试成员',roleIds:[r.body.id,'r6'],weeklyCapacity:32,active:true,color:'#e9dfcf'});assert.equal(m.status,201);
 assert.equal((await request('/api/roles/'+r.body.id,{active:false},'PATCH')).status,400);
 assert.equal((await request('/api/roles/'+r.body.id,{name:'打包发货'},'PATCH')).status,200);
 let s=await(await fetch(base+'/api/state')).json();assert.match(s.members.find(x=>x.id===m.body.id).role,/打包发货/);
 const t=await request('/api/tasks',{title:'成员停用测试',projectId:'p1',assignee:m.body.id,stage:'生产加工',due:'2026-12-01',estimate:1});assert.equal(t.status,201);
 assert.equal((await request('/api/members/'+m.body.id,{active:false},'PATCH')).status,400);
 assert.equal((await request('/api/tasks/'+t.body.id,{assignee:'m4',due:'2026-12-03'},'PATCH')).status,200);
 assert.equal((await request('/api/members/'+m.body.id,{active:false},'PATCH')).status,200);
 assert.equal((await request('/api/tasks',{title:'无效分配',projectId:'p1',assignee:m.body.id,stage:'生产加工',due:'2026-12-01',estimate:1})).status,400);
 assert.equal((await request('/api/roles/'+r.body.id,{active:false},'PATCH')).status,200);
 s=await(await fetch(base+'/api/state')).json();assert.ok(s.members.some(x=>x.id===m.body.id));assert.equal(s.tasks.find(x=>x.id===t.body.id).assignee,'m4');
 assert.equal((await request('/api/members',{name:'空工种',roleIds:[],weeklyCapacity:40})).status,400);
});
test('parallel work, dependency gating and explicit handoff confirmation',async()=>{
 const baseTask={projectId:'p1',assignee:'m1',stage:'3D设计',due:'2026-12-01',estimate:2};
 const a=await request('/api/tasks',{...baseTask,title:'上游建模',requiresApproval:true,reviewer:'m3'});
 const b=await request('/api/tasks',{...baseTask,title:'依赖拆件',stage:'3D拆件',dependencies:[a.body.id]});
 const c=await request('/api/tasks',{...baseTask,title:'并行宣发',stage:'宣发内容'});
 assert.equal((await request('/api/tasks/'+c.body.id,{status:'进行中'},'PATCH')).status,200);
 assert.equal((await request('/api/tasks/'+b.body.id,{status:'进行中'},'PATCH')).status,400);
 assert.equal((await request('/api/tasks/'+b.body.id,{status:'已完成'},'PATCH')).status,400);
 assert.equal((await request('/api/tasks/'+a.body.id,{status:'已完成'},'PATCH')).status,400);
 assert.equal((await request('/api/tasks/'+a.body.id,{status:'待确认'},'PATCH')).status,200);
 assert.equal((await request('/api/tasks/'+a.body.id+'/confirm',{memberId:'m1'})).status,400);
 const confirmed=await request('/api/tasks/'+a.body.id+'/confirm',{memberId:'m3'});assert.equal(confirmed.status,200);assert.equal(confirmed.body.confirmedBy,'m3');assert.ok(confirmed.body.confirmedAt);
 assert.equal((await request('/api/tasks/'+b.body.id,{status:'进行中'},'PATCH')).status,200);
 assert.equal((await request('/api/tasks/'+a.body.id,{status:'待开始'},'PATCH')).status,400);
 assert.equal((await request('/api/tasks',{...baseTask,title:'跨项目非法依赖',projectId:'p2',dependencies:[a.body.id]})).status,400);
 assert.equal((await request('/api/projects/p1',{workflowMode:'交接确认'},'PATCH')).body.workflowMode,'交接确认');
 await stop();await start();const s=await(await fetch(base+'/api/state')).json();assert.equal(s.tasks.find(t=>t.id===a.body.id).confirmedBy,'m3');assert.equal(s.projects.find(p=>p.id==='p1').workflowMode,'交接确认');assert.equal(s.members.filter(m=>m.name==='高洪剑').length,1);
});
