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
test('initial state contains the five-person roster and a complete demo workflow',async()=>{const s=await(await fetch(base+'/api/state')).json();assert.deepEqual(s.members.map(m=>m.name),['杨彦杰','张宏浩','岳普泽','牟平','高洪剑']);assert.equal(s.members.find(m=>m.name==='张宏浩').coordinator,true);assert.equal(s.collaborationPolicy.taskCreation,'all-members');assert.equal(s.collaborationPolicy.taskAssignment,'all-members');assert.equal(s.collaborationPolicy.projectVisibility,'all-members');assert.ok(s.roles.length>=19);assert.ok(s.roles.some(r=>r.name==='店铺运营'));assert.equal(s.members[1].roleIds.length,3);assert.equal(s.projects.length,4);assert.ok(s.stages.includes('3D拆件'));assert.equal(s.tasks.length,8);assert.equal(s.demo,true);});
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
test('serves frontend with security headers and rejects unknown paths',async()=>{const r=await fetch(base+'/');assert.equal(r.status,200);assert.match(await r.text(),/显真文创工作室/);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal((await fetch(base+'/server.mjs')).status,404);assert.equal((await fetch(base+'/api/missing')).status,404);});
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
test('admin categories, custom fields and stage options update projects without losing data',async()=>{
 const cat=await request('/api/admin/categories',{name:'后台测试分类',active:true,order:12});assert.equal(cat.status,201);
 const sub=await request('/api/admin/categories',{name:'子类A',parentId:cat.body.id,active:true});assert.equal(sub.status,201);
 const third=await request('/api/admin/categories',{name:'三级分类',parentId:sub.body.id});assert.equal(third.status,201);
 const fourth=await request('/api/admin/categories',{name:'四级分类',parentId:third.body.id});assert.equal(fourth.status,201);
 const fifth=await request('/api/admin/categories',{name:'五级分类',parentId:fourth.body.id});assert.equal(fifth.status,201);
 assert.equal((await request('/api/admin/categories',{name:'不允许的六级分类',parentId:fifth.body.id})).status,400);
 assert.equal((await request('/api/admin/categories/'+cat.body.id,{parentId:sub.body.id},'PATCH')).status,400);
 const field=await request('/api/admin/fields',{name:'材质',type:'select',options:['925银','黄铜'],required:true,categoryId:cat.body.id});assert.equal(field.status,201);
 const numberField=await request('/api/admin/fields',{name:'尺寸毫米',type:'number',categoryId:cat.body.id});assert.equal(numberField.status,201);
 const project={name:'自定义字段项目',collection:'测试系列',categoryId:sub.body.id,stage:'2D设计',owner:'m1',due:'2026-12-01'};
 assert.equal((await request('/api/projects',project)).status,400);
 assert.equal((await request('/api/projects',{...project,customFields:{[field.body.id]:'错误材质'}})).status,400);
 const p=await request('/api/projects',{...project,customFields:{[field.body.id]:'925银',[numberField.body.id]:12.5}});assert.equal(p.status,201);
 const edited=await request('/api/projects/'+p.body.id,{name:'编辑后的项目',description:'保留字段与分类'},'PATCH');assert.equal(edited.status,200);assert.equal(edited.body.customFields[numberField.body.id],12.5);assert.equal(edited.body.code,p.body.code);
 assert.equal((await request('/api/admin/categories/'+sub.body.id,{name:'子类已改名'},'PATCH')).status,200);
 let state=await(await fetch(base+'/api/state')).json();assert.equal(state.projects.find(x=>x.id===p.body.id).category,'子类已改名');
 assert.equal((await request('/api/admin/fields/'+field.body.id,{options:['黄铜']},'PATCH')).status,400);
 assert.equal((await request('/api/admin/fields/'+field.body.id,{type:'text'},'PATCH')).status,400);
 assert.equal((await request('/api/admin/fields/'+field.body.id,undefined,'DELETE')).status,400);
 assert.equal((await request('/api/admin/categories/'+sub.body.id,undefined,'DELETE')).status,400);
 assert.equal((await request('/api/admin/fields/'+field.body.id,{active:false},'PATCH')).status,200);
 assert.equal((await request('/api/projects/'+p.body.id,{name:'停用字段仍保留'},'PATCH')).body.customFields[field.body.id],'925银');
 const stage=await request('/api/admin/stages',{name:'验收测试',active:true,order:1});assert.equal(stage.status,201);
 const task=await request('/api/tasks',{title:'新流程任务',projectId:p.body.id,assignee:'m3',stage:'验收测试',due:'2026-12-01',estimate:1});assert.equal(task.status,201);
 assert.equal((await request('/api/admin/stages/'+stage.body.id,{name:'成品验收'},'PATCH')).status,200);
 state=await(await fetch(base+'/api/state')).json();assert.equal(state.tasks.find(t=>t.id===task.body.id).stage,'成品验收');
 assert.equal((await request('/api/admin/stages/'+stage.body.id,undefined,'DELETE')).status,400);
 assert.equal((await request('/api/admin/stages/'+stage.body.id,{active:false},'PATCH')).status,200);
 const unused=await request('/api/admin/categories',{name:'可删除分类'});assert.equal((await request('/api/admin/categories/'+unused.body.id,undefined,'DELETE')).status,200);
 await stop();await start();state=await(await fetch(base+'/api/state')).json();assert.equal(state.projects.find(x=>x.id===p.body.id).customFields[numberField.body.id],12.5);assert.equal(state.tasks.find(t=>t.id===task.body.id).stage,'成品验收');
});
test('member avatars validate images, persist across restart and support removal',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJt0AAAAASUVORK5CYII=','base64');
 assert.equal((await request('/api/members/m1/avatar',{dataUrl:'data:image/svg+xml;base64,PHN2Zy8+'})).status,400);
 assert.equal((await request('/api/members/m1/avatar',{dataUrl:'data:image/png;base64,'+Buffer.from('this is not an image').toString('base64')})).status,400);
 const upload=await request('/api/members/m1/avatar',{dataUrl:'data:image/png;base64,'+png.toString('base64')});assert.equal(upload.status,200);
 const edited=await request('/api/members/m1',{nickname:'设计师小杨',bio:'负责设计与建模'},'PATCH');assert.equal(edited.status,200);
 await stop();await start();const state=await(await fetch(base+'/api/state')).json();const m=state.members.find(m=>m.id==='m1');assert.equal(m.avatarVersion,upload.body.avatarVersion);assert.equal(m.nickname,'设计师小杨');
 const image=await fetch(base+'/api/members/m1/avatar');assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 assert.equal((await request('/api/members/m1/avatar',undefined,'DELETE')).status,200);assert.equal((await fetch(base+'/api/members/m1/avatar')).status,404);
});
test('task and project removal protects work logs and dependency history',async()=>{
 const t=await request('/api/tasks',{title:'可编辑和删除的任务',projectId:'p4',assignee:'m1',stage:'2D设计',due:'2026-12-01',estimate:2});assert.equal(t.status,201);
 assert.equal((await request('/api/tasks/'+t.body.id,{title:'名称已改',estimate:3},'PATCH')).body.title,'名称已改');
 assert.equal((await request('/api/tasks/'+t.body.id,undefined,'DELETE')).status,200);
 assert.equal((await request('/api/tasks/t1',undefined,'DELETE')).status,400);
 assert.equal((await request('/api/projects/p1',undefined,'DELETE')).status,400);
 const p=await request('/api/projects',{name:'空项目',collection:'测试',category:'戒指',stage:'2D设计',owner:'m1',due:'2026-12-01'});assert.equal(p.status,201);assert.equal((await request('/api/projects/'+p.body.id,undefined,'DELETE')).status,200);
});
test('admin changes notify both connected clients immediately',async()=>{
 const controls=[new AbortController(),new AbortController()];
 try{
   const readers=await Promise.all(controls.map(async c=>{const r=await fetch(base+'/api/events',{signal:c.signal});const reader=r.body.getReader();await reader.read();return reader;}));
   const pending=readers.map(r=>r.read());const changed=await request('/api/admin/categories',{name:'实时同步测试'});assert.equal(changed.status,201);
   const timeout=setTimeout(()=>controls.forEach(c=>c.abort()),3000);
   try{for(const result of await Promise.all(pending))assert.match(new TextDecoder().decode(result.value),/data: changed/);}finally{clearTimeout(timeout);}
 }finally{controls.forEach(c=>c.abort());}
});
test('task hierarchy, priorities, collaborative discussions and multi-party confirmation persist',async()=>{
 const payload={projectId:'p4',assignee:'m1',stage:'2D设计',due:'2026-12-01',estimate:2};
 const parent=await request('/api/tasks',{...payload,title:'阶段主任务',priority:'high',notes:'需要交叉确认',requiredSkills:['2D设计']});assert.equal(parent.status,201);
 const child=await request('/api/tasks',{...payload,title:'协作子任务',parentTaskId:parent.body.id,requiresApproval:true,reviewerIds:['m1','m2'],collaborators:['m3','m4'],collaborationDetail:'设计与拆件交叉核对',labelId:'label-design',priority:'urgent'});assert.equal(child.status,201);assert.equal(child.body.priority,'urgent');
 assert.equal((await request('/api/tasks/'+parent.body.id,{status:'已完成'},'PATCH')).status,400);
 assert.equal((await request('/api/tasks/'+parent.body.id,{parentTaskId:child.body.id},'PATCH')).status,400);
 assert.equal((await request('/api/tasks',{...payload,title:'不能依赖父任务',parentTaskId:parent.body.id,dependencies:[parent.body.id]})).status,400);
 const note=await request('/api/tasks/'+child.body.id+'/discussions',{memberId:'m3',content:'拆件分模位置请设计确认。'});assert.equal(note.status,201);
 assert.equal((await request('/api/tasks/'+child.body.id,{status:'待确认'},'PATCH')).status,200);
 const first=await request('/api/tasks/'+child.body.id+'/confirm',{memberId:'m1'});assert.equal(first.status,200);assert.equal(first.body.status,'待确认');
 assert.equal((await request('/api/tasks/'+child.body.id+'/confirm',{memberId:'m1'})).status,400);
 assert.equal((await request('/api/tasks/'+child.body.id+'/confirm',{memberId:'m3'})).status,400);
 const second=await request('/api/tasks/'+child.body.id+'/confirm',{memberId:'m2'});assert.equal(second.body.status,'已完成');
 assert.equal((await request('/api/tasks/'+parent.body.id,{status:'已完成'},'PATCH')).status,200);
 assert.equal((await request('/api/tasks/'+child.body.id,{status:'进行中'},'PATCH')).status,400);
 assert.equal((await request('/api/tasks/'+child.body.id,undefined,'DELETE')).status,400);
 await stop();await start();const s=await(await fetch(base+'/api/state')).json();assert.equal(s.discussions.find(d=>d.id===note.body.id).content,'拆件分模位置请设计确认。');assert.equal(Object.keys(s.tasks.find(t=>t.id===child.body.id).confirmations).length,2);
});
test('editing a pending confirmation invalidates previous approvals and validates reference links',async()=>{
 const task=await request('/api/tasks',{title:'确认版本测试',projectId:'p2',assignee:'m1',stage:'3D设计',due:'2026-12-01',estimate:1,requiresApproval:true,reviewerIds:['m1','m2'],referenceLinks:['https://example.com/model']});assert.equal(task.status,201);
 await request('/api/tasks/'+task.body.id,{status:'待确认'},'PATCH');await request('/api/tasks/'+task.body.id+'/confirm',{memberId:'m1'});
 const edit=await request('/api/tasks/'+task.body.id,{notes:'更改验收标准后需要重新确认'},'PATCH');assert.equal(edit.body.status,'进行中');assert.deepEqual(edit.body.confirmations,{});
 assert.equal((await request('/api/tasks/'+task.body.id+'/confirm',{memberId:'m2'})).status,400);
 assert.equal((await request('/api/tasks/'+task.body.id,{referenceLinks:['javascript:alert(1)']},'PATCH')).status,400);
});
test('organization and role capabilities are configurable and recommendations are labelled rules',async()=>{
 const dep=await request('/api/admin/departments',{name:'测试运营部',description:'负责测试运营',order:20});assert.equal(dep.status,201);
 const team=await request('/api/admin/teams',{name:'测试运营一组',departmentId:dep.body.id,leaderId:'m2'});assert.equal(team.status,201);
 const role=await request('/api/roles',{name:'测试直播运营',departmentId:dep.body.id,skills:['直播策划','内容制作'],responsibilities:'负责直播流程与内容'});assert.equal(role.status,201);
 const m=await request('/api/members',{name:'新入职测试',roleIds:[role.body.id],departmentIds:[dep.body.id],teamId:team.body.id,positionLevel:'组员',managerId:'m2',skills:['直播策划'],weeklyCapacity:32});assert.equal(m.status,201);
 assert.equal((await request('/api/members/m2',{managerId:m.body.id},'PATCH')).status,400);
 const match=await request('/api/recommendations',{requiredSkills:['直播策划'],departmentId:dep.body.id});assert.equal(match.status,200);assert.equal(match.body.mode,'rules');assert.equal(match.body.candidates[0].memberId,m.body.id);assert.deepEqual(match.body.candidates[0].matched,['直播策划']);
 assert.equal((await request('/api/admin/departments/'+dep.body.id,undefined,'DELETE')).status,400);
 const label=await request('/api/admin/labels',{name:'内容风险',color:'#fe8888'});assert.equal(label.status,201);assert.equal((await request('/api/admin/labels',{name:'非法色',color:'javascript:x'})).status,400);
});
test('experience records link to projects and support persisted rule organization without pretending AI',async()=>{
 const lesson=await request('/api/lessons',{projectId:'p1',taskId:'t1',memberId:'m2',title:'纹理细节铸后丢失',category:'铸造工艺',problem:'样件纹理不清晰',cause:'怀疑纹理深度不足，未验证',solution:'计划调整模型',prevention:'打样前检查最小纹理深度',status:'处理中',tags:['纹理','铸造']});assert.equal(lesson.status,201);
 assert.equal((await request('/api/lessons',{...lesson.body,projectId:'p2'})).status,400);
 const summary=await request('/api/lessons/analyze',{lessonIds:[lesson.body.id],projectId:'p1',mode:'rules'});assert.equal(summary.status,201);assert.equal(summary.body.mode,'rules');assert.match(summary.body.content,/怀疑纹理深度不足/);
 const model=await request('/api/lessons/analyze',{lessonIds:[lesson.body.id],mode:'model'});assert.equal(model.status,503);
 assert.equal((await request('/api/lessons/'+lesson.body.id,{status:'已沉淀'},'PATCH')).body.status,'已沉淀');
 await stop();await start();const state=await(await fetch(base+'/api/state')).json();assert.equal(state.lessons.find(l=>l.id===lesson.body.id).status,'已沉淀');assert.equal(state.analyses.find(a=>a.id===summary.body.id).mode,'rules');assert.equal(state.ai.configured,false);
});
test('a new member can record capabilities before role assignment and get role-fit guidance',async()=>{
 const m=await request('/api/members',{name:'待分工的新同事',roleIds:['role-pending'],weeklyCapacity:40,skills:['电商运营','商品上架','数据复盘'],departmentIds:[],positionLevel:'组员'});assert.equal(m.status,201);
 const fit=await request('/api/role-fit',{memberId:m.body.id,mode:'rules'});assert.equal(fit.status,200);assert.equal(fit.body.matches[0].name,'店铺运营');assert.equal(fit.body.matches[0].score,100);
 assert.equal((await request('/api/role-fit',{memberId:m.body.id,mode:'model'})).status,503);
 const state=await(await fetch(base+'/api/state')).json();assert.deepEqual(state.members.find(x=>x.id===m.body.id).roleIds,['role-pending']);
});
