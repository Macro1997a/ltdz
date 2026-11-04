import { createAdmin } from './admin.mjs';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(root, 'data/studio.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`);
const stages = ['产品规划','2D设计','3D设计','3D拆件','打样铸造','生产加工','宣发内容','上架销售','成本核算','财务对账'];
const workflowModes = ['混合推进','并行协作','交接确认'];
const date = (offset=0) => { const d = new Date(); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10); };
const put = (kind, item) => db.prepare('INSERT INTO items (id,kind,body) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, body=excluded.body').run(item.id,kind,JSON.stringify(item));
if (!db.prepare("SELECT key FROM meta WHERE key='seeded'").get()) {
  const members = [ ['m1','林悦','主理人 / 2D设计','#dce7d8'],['m2','陈默','3D设计 / 打样','#e9dfcf'],['m3','周禾','铸造 / 生产加工','#dddfea'],['m4','许知','内容 / 电商运营','#eadadd'] ];
  members.forEach(([id,name,role,color])=>put('member',{id,name,role,color,weeklyCapacity:40}));
  const projects = [
    {id:'p1',name:'山海 · 纹理银戒',collection:'山海系列',category:'戒指',stage:'3D设计',owner:'m2',due:date(8),tone:'silver',code:'SH-001',description:'将山峦的起伏与海浪纹理，凝结在一枚银戒之中。',target:50},
    {id:'p2',name:'流光 · 黄铜吊坠',collection:'流光系列',category:'项链',stage:'打样铸造',owner:'m3',due:date(5),tone:'gold',code:'LG-002',description:'失蜡铸造黄铜吊坠，探索流动金属的自然形态。',target:30},
    {id:'p3',name:'枝间 · 植物耳饰',collection:'自然造物',category:'耳饰',stage:'宣发内容',owner:'m4',due:date(3),tone:'leaf',code:'ZJ-003',description:'从枝叶中提取形态，以银为媒介，留住自然的呼吸。',target:40},
    {id:'p4',name:'原石 · 桌面香插',collection:'日常器物',category:'工艺品',stage:'2D设计',owner:'m1',due:date(16),tone:'stone',code:'YS-004',description:'粗粝岩石与温润金属的相遇，让日常多一点仪式感。',target:20}
  ]; projects.forEach(p=>put('project',p));
  const tasks = [
    ['t1','p1','戒指纹理细节建模','3D设计','m2','进行中',6,1],
    ['t2','p2','首轮铸造样件检查','打样铸造','m3','待开始',4,0],
    ['t3','p3','小红书首发图文拍摄','宣发内容','m4','进行中',5,0],
    ['t4','p4','香插概念草图 · 3个方向','2D设计','m1','进行中',4,2],
    ['t5','p1','确认戒圈尺寸与壁厚','3D设计','m1','待开始',2,3],
    ['t6','p2','吊坠3D模型定稿','3D设计','m2','已完成',8,-1],
    ['t7','p3','耳饰抛光与质检','生产加工','m3','已完成',6,-2],
    ['t8','p3','整理电商上架素材','上架销售','m4','待开始',3,3]
  ]; tasks.forEach(([id,projectId,title,stage,assignee,status,estimate,offset])=>put('task',{id,projectId,title,stage,assignee,status,estimate,due:date(offset)}));
  [['l1','t1','m2',3,1,'完成戒面基础模型与第一版纹理'],['l2','t4','m1',2,3,'完成三组造型草图'],['l3','t3','m4',2.5,6,'完成六张场景试拍'],['l4','t7','m3',4,12,'完成十二对耳饰的抛光检查']].forEach(([id,taskId,memberId,hours,quantity,note])=>put('log',{id,taskId,memberId,hours,quantity,note,link:'',date:date(),createdAt:new Date().toISOString()}));
  db.prepare("INSERT INTO meta VALUES ('seeded','1')").run();
}
// One-time roster migration: preserve user-created records and the original demonstration provenance.
if (!db.prepare("SELECT key FROM meta WHERE key='team-v2'").get()) {
  db.exec('BEGIN');
  try {
    const roles=['2D设计','3D制作','自媒体账号运营','产品规划','3D产品拆件','生产加工','成本核算','生产进度对接','财务对账'];
    roles.forEach((name,i)=>put('role',{id:'r'+(i+1),name,active:true}));
    const roster=[['m1','林悦','杨彦杰',['r1','r2']],['m2','陈默','张宏浩',['r2','r3','r4']],['m3','周禾','岳普泽',['r5']],['m4','许知','牟平',['r6']],['m5',null,'高洪剑',['r7','r8','r9']]];
    for(const [id,oldName,name,roleIds] of roster){const row=db.prepare("SELECT body FROM items WHERE id=? AND kind='member'").get(id);const old=row?JSON.parse(row.body):null;if(!old||old.name===oldName)put('member',{id,name,roleIds,weeklyCapacity:old?.weeklyCapacity||40,color:old?.color||'#dce7d8',active:true});}
    const demoAdjustments=[['task','t2','title','首轮铸造样件检查','assignee','m3','m4'],['task','t7','title','耳饰抛光与质检','assignee','m3','m4'],['task','t3','title','小红书首发图文拍摄','assignee','m4','m2'],['task','t8','title','整理电商上架素材','assignee','m4','m2'],['project','p2','name','流光 · 黄铜吊坠','owner','m3','m4'],['project','p3','name','枝间 · 植物耳饰','owner','m4','m2'],['log','l3','note','完成六张场景试拍','memberId','m4','m2'],['log','l4','note','完成十二对耳饰的抛光检查','memberId','m3','m4']];
    for(const [kind,id,key,expected,field,oldValue,newValue] of demoAdjustments){const row=db.prepare('SELECT body FROM items WHERE id=? AND kind=?').get(id,kind);if(row){const item=JSON.parse(row.body);if(item[key]===expected&&item[field]===oldValue){item[field]=newValue;put(kind,item);}}}
    db.prepare("INSERT INTO meta VALUES ('team-v2','1')").run();db.exec('COMMIT');
  } catch(e){db.exec('ROLLBACK');throw e;}
}
const clients = new Set();
if (!db.prepare("SELECT key FROM meta WHERE key='collaboration-v3'").get()) {
  const row=db.prepare("SELECT body FROM items WHERE id='m2' AND kind='member'").get();
  if(row){const m=JSON.parse(row.body);if(m.name==='张宏浩')put('member',{...m,coordinator:true});}
  db.prepare("INSERT INTO meta VALUES ('collaboration-v3','1')").run();
}
function get(id,kind) { if(typeof id!=='string')return null;const row=db.prepare('SELECT body FROM items WHERE id=? AND kind=?').get(id,kind); return row?JSON.parse(row.body):null; }
function all(kind) { return db.prepare('SELECT body FROM items WHERE kind=? ORDER BY rowid').all(kind).map(r=>JSON.parse(r.body)); }
function activeMember(id) { const m=get(id,'member');return !!m && m.active!==false; }
const admin=createAdmin({db,all,get,put,error,str,body,defaultStages:stages});
const broadcast=()=>{for(const c of clients)c.write('data: changed\n\n');};
function state() { const result={members:[],roles:[],projects:[],tasks:[],logs:[],stages:admin.stageNames(),...admin.snapshot(),workflowModes,collaborationPolicy:{taskCreation:'all-members',taskAssignment:'all-members',projectVisibility:'all-members'},demo:true}; for(const r of db.prepare('SELECT kind, body FROM items ORDER BY rowid').all()){const key=({member:'members',role:'roles',project:'projects',task:'tasks',log:'logs'})[r.kind];if(key)result[key].push(JSON.parse(r.body));}for(const p of result.projects)p.category=get(p.categoryId,'category')?.name||p.category; for(const m of result.members)m.role=m.roleIds?.map(id=>result.roles.find(r=>r.id===id)?.name).filter(Boolean).join(' / ')||m.role||'未分配工种'; return result; }
function error(message) { throw Object.assign(new Error(message),{status:400}); }
function str(v,name,max=200) { if(typeof v!=='string'||!v.trim()||v.length>max) error(`${name}不能为空，且不能超过${max}字`); return v.trim(); }
function exists(id,kind) { return !!get(id,kind); }
function validDate(d) { return typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d; }
function validate(kind,b) {
  if(!b||typeof b!=='object'||Array.isArray(b))error('请求内容必须为对象');
  if(kind==='role') { const name=str(b.name,'工种名称',30);if(all('role').some(r=>r.name===name&&r.id!==b.id))error('该工种已存在');return {name,active:b.active!==false}; }
  if(kind==='member') { const name=str(b.name,'成员姓名',40);const roleIds=b.roleIds;if(!Array.isArray(roleIds)||!roleIds.length||roleIds.length>30||roleIds.some(id=>!get(id,'role')?.active))error('请至少选择一个在用工种');const weeklyCapacity=Number(b.weeklyCapacity);if(!Number.isFinite(weeklyCapacity)||weeklyCapacity<=0||weeklyCapacity>168)error('周参考工时需大于0且不超过168');return {name,roleIds:[...new Set(roleIds)],weeklyCapacity,coordinator:b.coordinator===true,nickname:typeof b.nickname==='string'?b.nickname.trim().slice(0,40):'',bio:typeof b.bio==='string'?b.bio.trim().slice(0,500):'',active:b.active!==false,color:/^#[\da-f]{6}$/i.test(b.color)?b.color:'#dce7d8'}; }
  if(kind==='project') { const name=str(b.name,'项目名称',80); if((!admin.stageNames().includes(b.stage)&&get(b.id,'project')?.stage!==b.stage)||!activeMember(b.owner)||!validDate(b.due)) error('请选择有效的阶段、负责人和日期'); return {name,stage:b.stage,owner:b.owner,due:b.due,collection:str(b.collection,'系列',40),...admin.projectFields(b),description:typeof b.description==='string'?b.description.slice(0,1000):'',tone:['silver','gold','leaf','stone'].includes(b.tone)?b.tone:'silver',code:'PR-'+randomUUID().slice(0,4).toUpperCase(),target:0,workflowMode:workflowModes.includes(b.workflowMode)?b.workflowMode:'混合推进'}; }
  if(kind==='task') { if(!exists(b.projectId,'project')||!activeMember(b.assignee)||!admin.stageNames().includes(b.stage)||!validDate(b.due)) error('项目、在用成员、阶段或日期无效'); const estimate=Number(b.estimate); if(!Number.isFinite(estimate)||estimate<=0||estimate>1000) error('预计工时需大于0且不超过1000');const dependencies=b.dependencies??[];if(!Array.isArray(dependencies)||dependencies.length>100||dependencies.some(id=>get(id,'task')?.projectId!==b.projectId))error('前置任务必须属于同一项目');const requiresApproval=b.requiresApproval===true;if(requiresApproval&&!activeMember(b.reviewer))error('请选择在用成员作为交接确认人');return {title:str(b.title,'任务名称',120),projectId:b.projectId,assignee:b.assignee,stage:b.stage,due:b.due,estimate,status:'待开始',dependencies:[...new Set(dependencies)],requiresApproval,reviewer:requiresApproval?b.reviewer:null}; }
  if(kind==='log') { if(!exists(b.taskId,'task')||!activeMember(b.memberId)||!validDate(b.date)) error('任务、成员或日期无效'); const hours=Number(b.hours),quantity=Number(b.quantity); if(!Number.isFinite(hours)||hours<=0||hours>24||!Number.isInteger(quantity)||quantity<0||quantity>100000) error('工时需在0到24之间，数量需为非负整数'); const link=typeof b.link==='string'?b.link.trim():''; if(link && (!/^https?:\/\//i.test(link)||link.length>2000)) error('成果链接应为 http 或 https 地址'); return {taskId:b.taskId,memberId:b.memberId,hours,quantity,note:str(b.note,'工作说明',1000),link,date:b.date,createdAt:new Date().toISOString()}; }
  error('不支持的类型');
}
function updateTask(item,b) {
  if(b.title!==undefined)item.title=str(b.title,'任务名称',120);
  if(b.estimate!==undefined){const n=Number(b.estimate);if(!Number.isFinite(n)||n<=0||n>1000)error('预计工时需大于0且不超过1000');item.estimate=n;}
  if(b.stage!==undefined){if(!admin.stageNames().includes(b.stage)&&b.stage!==item.stage)error('流程阶段无效');item.stage=b.stage;}
  if(b.assignee!==undefined){if(!activeMember(b.assignee))error('请选择在用成员');item.assignee=b.assignee;}
  if(b.due!==undefined){if(!validDate(b.due))error('无效截止日期');item.due=b.due;}
  if(b.reviewer!==undefined){if(!item.requiresApproval||!activeMember(b.reviewer)||item.status==='已完成')error('无法调整此交接确认人');item.reviewer=b.reviewer;}
  if(b.status===undefined)return item;
  if(!['待开始','进行中','待确认','已完成'].includes(b.status))error('无效状态');
  if(b.status!=='待开始'&&(item.dependencies||[]).some(id=>get(id,'task')?.status!=='已完成'))error('前置任务尚未完成，暂不能推进');
  if(item.status==='已完成'&&b.status!=='已完成'&&all('task').some(t=>(t.dependencies||[]).includes(item.id)&&t.status!=='待开始'))error('下游任务已开始，不能直接撤回前置任务');
  if(item.requiresApproval&&b.status==='已完成'&&item.status!=='已完成')error('此任务需先提交待确认，再由交接确认操作完成');
  if(!item.requiresApproval&&b.status==='待确认')error('此任务不需要交接确认');
  return {...item,status:b.status,...(b.status!=='已完成'?{confirmedBy:null,confirmedAt:null}:{})};
}
async function body(req,limit=20000) { let s=''; for await(const chunk of req) { s+=chunk; if(Buffer.byteLength(s)>limit) error('请求内容过大'); } try { return JSON.parse(s); } catch { error('无效的JSON'); } }
const server = http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try {
    if(await admin.handle(req,res,path,json,broadcast))return;
    if(req.method==='GET' && path==='/api/state') return json(200,state());
    if(req.method==='GET' && path==='/api/events') { res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('event: connected\ndata: {}\n\n'); clients.add(res);req.on('close',()=>clients.delete(res));return; }
    if(req.method==='POST' && ['/api/projects','/api/tasks','/api/logs','/api/members','/api/roles'].includes(path)) { const kind={'/api/projects':'project','/api/tasks':'task','/api/logs':'log','/api/members':'member','/api/roles':'role'}[path]; const item={...validate(kind,{...await body(req),id:undefined}),id:randomUUID()};put(kind,item); for(const c of clients)c.write('data: changed\n\n');return json(201,item); }
    if(req.method==='POST' && /^\/api\/tasks\/[\w-]+\/confirm$/.test(path)) {
      const id=path.split('/')[3],item=get(id,'task'),b=await body(req);
      if(!item)return json(404,{error:'任务不存在'});
      if(!item.requiresApproval||item.status!=='待确认')error('任务当前不在待确认状态');
      if(b.memberId!==item.reviewer||!activeMember(b.memberId))error('请选择该任务指定的在用交接确认人');
      if((item.dependencies||[]).some(id=>get(id,'task')?.status!=='已完成'))error('前置任务尚未完成');
      item.status='已完成';item.confirmedBy=b.memberId;item.confirmedAt=new Date().toISOString();put('task',item);
      for(const c of clients)c.write('data: changed\n\n');return json(200,item);
    }
    if(req.method==='PATCH' && /^\/api\/(tasks|projects|members|roles)\/[\w-]+$/.test(path)) {
      const [, ,plural,id]=path.split('/'),kind={tasks:'task',projects:'project',members:'member',roles:'role'}[plural];
      let item=get(id,kind);if(!item)return json(404,{error:'记录不存在'});const b=await body(req);
      if(!b||typeof b!=='object'||Array.isArray(b))error('请求内容必须为对象');
      if(kind==='task')item=updateTask(item,b);
      if(kind==='project'){
        if(b.name!==undefined){const updated=validate('project',{...item,...b,id});item={...item,...updated,code:item.code};}
        if(b.stage!==undefined){if(!admin.stageNames().includes(b.stage))error('无效阶段');item.stage=b.stage;}
        if(b.workflowMode!==undefined){if(!workflowModes.includes(b.workflowMode))error('无效协作方式');item.workflowMode=b.workflowMode;}
      }
      if(kind==='member'){
        if(b.active===false&&all('task').some(t=>(t.assignee===id||t.reviewer===id)&&t.status!=='已完成'))error('该成员有未完成的负责或交接任务，请先完成任务或调整分配');
        item={...item,...validate('member',{...item,...b,id})};
      }
      if(kind==='role'){
        if(b.active===false&&all('member').some(m=>m.active!==false&&m.roleIds?.includes(id)))error('该工种仍被在用成员使用，请先调整成员工种');
        item={...item,...validate('role',{...item,...b,id})};
      }
      put(kind,item);for(const c of clients)c.write('data: changed\n\n');return json(200,item);
    }
    if(req.method==='DELETE'&&/^\/api\/(tasks|projects)\/[\w-]+$/.test(path)){
      const [, ,plural,id]=path.split('/'),kind=plural==='tasks'?'task':'project',item=get(id,kind);
      if(!item)return json(404,{error:'记录不存在'});
      if(kind==='task'&&(item.status!=='待开始'||all('log').some(l=>l.taskId===id)||all('task').some(t=>t.dependencies?.includes(id))))error('该任务已有进展、工作记录或下游引用，请保留历史，不能直接删除');
      if(kind==='project'&&all('task').some(t=>t.projectId===id))error('项目下仍有任务，请先处理任务再删除项目');
      db.prepare('DELETE FROM items WHERE id=? AND kind=?').run(id,kind);broadcast();return json(200,{ok:true});
    }
    if(path.startsWith('/api/'))return json(404,{error:'接口不存在'});
    if(req.method!=='GET')return json(405,{error:'方法不支持'});
    const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css'],'/workspace-model.js':['workspace-model.js','text/javascript'],'/admin-ui.js':['admin-ui.js','text/javascript']};
    if(!files[path])return json(404,{error:'页面不存在'});
    const [file,mime]=files[path];res.writeHead(200,{'Content-Type':mime+'; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(readFileSync(join(root,'public',file)));
  } catch(e) { json(e.status||500,{error:e.status?e.message:'服务器错误'}); if(!e.status)console.error(e); }
});
const heartbeat=setInterval(()=>{for(const c of clients)c.write(': heartbeat\n\n');},25000);heartbeat.unref();
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`铸序服务已启动，端口 ${server.address().port}（内部演示，无登录权限控制）`));
