import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createAdmin } from '../admin.mjs';

test('upgrading an existing database preserves user content and runs only once',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE items(id TEXT PRIMARY KEY,kind TEXT,body TEXT);CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT)');
  const put=(kind,x)=>db.prepare('INSERT INTO items VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(x.id,kind,JSON.stringify(x));
  const get=(id,kind)=>{const row=db.prepare('SELECT body FROM items WHERE id=? AND kind=?').get(id,kind);return row?JSON.parse(row.body):null;};
  const all=kind=>db.prepare('SELECT body FROM items WHERE kind=? ORDER BY rowid').all(kind).map(r=>JSON.parse(r.body));
  const original={id:'existing-project',name:'既有产品',category:'定制摆件',stage:'旧流程',description:'不能丢失的工艺说明',due:'2026-12-01'};
  const member={id:'existing-member',name:'用户改过的姓名',roleIds:['custom-role'],weeklyCapacity:32,bio:'已有简介'};
  const log={id:'existing-log',memberId:member.id,taskId:'existing-task',hours:3,note:'已有工作记录'};
  put('project',original);put('member',member);put('log',log);
  const args={db,all,get,put,error:msg=>{throw Error(msg);},str:x=>x,body:async()=>({}),defaultStages:['2D设计']};
  const admin=createAdmin(args),p=get(original.id,'project');assert.deepEqual({...p,categoryId:undefined,customFields:undefined},{...original,categoryId:undefined,customFields:undefined});
  assert.equal(get(p.categoryId,'category').name,'定制摆件');assert.ok(admin.stageNames().includes('旧流程'));assert.deepEqual(get(member.id,'member'),member);assert.deepEqual(get(log.id,'log'),log);
  const cat=get(p.categoryId,'category');put('category',{...cat,name:'用户随后更名'});createAdmin(args);assert.equal(get(cat.id,'category').name,'用户随后更名');assert.deepEqual(get(log.id,'log'),log);db.close();
});
