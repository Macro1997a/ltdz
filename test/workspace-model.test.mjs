import { test } from 'node:test';
import assert from 'node:assert/strict';
import { personalWork, coordinationWork } from '../public/workspace-model.js';
const state={tasks:[
 {id:'a',title:'建模',assignee:'m1',due:'2026-11-01',status:'待确认',requiresApproval:true,reviewer:'m2'},
 {id:'b',title:'拆件',assignee:'m2',due:'2026-11-06',status:'待开始',dependencies:['a']},
 {id:'c',title:'已完成任务',assignee:'m2',due:'2026-11-01',status:'已完成'},
 {id:'d',title:'独立宣传',assignee:'m2',due:'2026-11-04',status:'进行中'}
],logs:[{memberId:'m1',date:'2026-11-04',hours:6},{memberId:'m2',date:'2026-11-04',hours:2.5},{memberId:'m2',date:'2026-11-03',hours:4}]};
test('personal view separates assigned tasks, review duties and blocked work',()=>{
 const result=personalWork(state,'m2','2026-11-04');
 assert.deepEqual(result.open.map(t=>t.id),['b','d']);
 assert.deepEqual(result.confirmations.map(t=>t.id),['a']);
 assert.deepEqual(result.blocked.map(t=>t.id),['b']);
 assert.equal(result.hours,2.5);assert.equal(result.overdue.length,0);
 assert.deepEqual(personalWork(state,'missing','2026-11-04').tasks,[]);
});
test('global coordination detects overdue and handoff blockers; confirmation unlocks downstream',()=>{
 const before=coordinationWork(state,'2026-11-04');
 assert.deepEqual(before.overdue.map(t=>t.id),['a']);assert.equal(before.confirmations.length,1);assert.equal(before.blocked.length,1);
 const updated={...state,tasks:state.tasks.map(t=>t.id==='a'?{...t,status:'已完成'}:t)};
 const after=coordinationWork(updated,'2026-11-04');assert.equal(after.confirmations.length,0);assert.equal(after.blocked.length,0);assert.equal(after.overdue.length,0);
});
