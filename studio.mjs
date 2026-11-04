import { randomUUID } from 'node:crypto';
import { validateTreeMove, recommendMembers, priorityOptions } from './public/domain.js';
import { aiStatus, analyzeWithModel, organizeLessons } from './ai.mjs';

export function createStudio({db,all,get,put,error,str,body,activeMember,broadcast}){
  const now=()=>new Date().toISOString();
  if(!db.prepare("SELECT key FROM meta WHERE key='studio-v5'").get()){
    db.exec('BEGIN');try{
      const names=['产品与企划','视觉与设计','3D与工艺研发','生产与供应链','内容与品牌营销','电商运营与客服','财务与综合支持'];
      names.forEach((name,i)=>put('department',{id:'dept-'+i,name,active:true,order:i,description:'可按工作室实际分工调整'}));
      const roleDepartments={r1:1,r2:2,r3:4,r4:0,r5:2,r6:3,r7:6,r8:3,r9:6};
      for(const r of all('role'))if(roleDepartments[r.id]!==undefined)put('role',{...r,departmentId:'dept-'+roleDepartments[r.id],skills:[r.name],responsibilities:''});
      for(const m of all('member')){
        const roles=(m.roleIds||[]).map(id=>get(id,'role')).filter(Boolean);
        put('member',{...m,departmentIds:[...new Set(roles.map(r=>r.departmentId).filter(Boolean))],skills:[...new Set(roles.flatMap(r=>r.skills||[]))],positionLevel:m.coordinator?'负责人':'组员',managerId:null,teamId:null});
      }
      [['label-design','设计','#8f9eff'],['label-production','生产','#e5b676'],['label-content','内容','#a58de3'],['label-finance','财务','#77c6b3']].forEach(([id,name,color],order)=>put('taskLabel',{id,name,color,active:true,order}));
      db.prepare("INSERT INTO meta VALUES ('studio-v5','1')").run();db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  if(!db.prepare("SELECT key FROM meta WHERE key='role-library-v6'").get()){
    const library=[
      ['role-pending','待定职能',null,[],'入职后先填写能力，再由负责人确认具体分工'],
      ['role-product','产品企划',0,['产品规划','需求分析'],'产品定位、选品与项目节奏'],
      ['role-store','店铺运营',5,['电商运营','商品上架','数据复盘'],'商品上架、活动配置与店铺经营'],
      ['role-ad','推广投流',5,['投放优化','数据分析'],'推广计划、投放复盘与预算协作'],
      ['role-service','客服与售后',5,['客户沟通','售后处理'],'咨询转化、订单沟通与售后闭环'],
      ['role-video','摄影与剪辑',4,['产品摄影','视频剪辑'],'产品影像、短视频与素材管理'],
      ['role-live','直播运营',4,['直播策划','内容制作'],'直播排期、脚本与现场协作'],
      ['role-warehouse','仓储与发货',3,['库存管理','订单履约'],'库存核对、包装与发货'],
      ['role-quality','质检品控',3,['质量检验','工艺检查'],'样件与成品质检、问题记录'],
      ['role-purchase','供应链采购',3,['供应商沟通','采购跟单'],'材料采购、供应商与到货进度']
    ];
    for(const [id,name,index,skills,responsibilities] of library)if(!get(id,'role')&&!all('role').some(r=>r.name===name))put('role',{id,name,departmentId:index===null?null:'dept-'+index,skills,responsibilities,active:true});
    db.prepare("INSERT INTO meta VALUES ('role-library-v6','1')").run();
  }
  const array=(value,max=50)=>{if(!Array.isArray(value)||value.length>max||value.some(x=>typeof x!=='string'||x.length>80))error('列表格式错误');return [...new Set(value.map(x=>x.trim()).filter(Boolean))];};
  const text=(v,max=4000)=>typeof v==='string'?v.trim().slice(0,max):'';
  const validIds=(ids,kind)=>{const values=array(ids);if(values.some(id=>!get(id,kind)||get(id,kind).active===false))error('请选择在用的'+(kind==='member'?'成员':'组织项'));return values;};
  function memberFields(b){
    const departmentIds=validIds(b.departmentIds||[],'department'),skills=array(b.skills||[]),level=b.positionLevel||'组员';
    if(!['负责人','部门总管','组长','组员'].includes(level))error('职位层级无效');
    if(b.teamId&&!get(b.teamId,'team')?.active)error('请选择在用小组');
    if(b.teamId&&!departmentIds.includes(get(b.teamId,'team').departmentId))error('所属小组必须位于该成员的部门中');
    if(b.managerId){if(!activeMember(b.managerId)||b.managerId===b.id)error('直属负责人无效');const nodes=all('member').map(m=>({id:m.id,parentId:m.managerId||null}));try{validateTreeMove(nodes,b.id||'new-member',b.managerId,20);}catch(e){error(e.message);}}
    return {departmentIds,skills,positionLevel:level,managerId:b.managerId||null,teamId:b.teamId||null};
  }
  function roleFields(b){if(b.departmentId&&!get(b.departmentId,'department')?.active)error('工种所属部门无效');return {departmentId:b.departmentId||null,skills:array(b.skills||[]),responsibilities:text(b.responsibilities,2000)};}
  function taskFields(b,old){
    const parentId=b.parentTaskId||null;
    if(parentId){const parent=get(parentId,'task');if(!parent||parent.projectId!==b.projectId||(parent.status==='已完成'&&old?.parentTaskId!==parentId))error('父任务必须属于同项目且尚未完成');}
    try{validateTreeMove(all('task').map(t=>({id:t.id,parentId:t.parentTaskId||null})),old?.id||'new-task',parentId,5);}catch(e){error(e.message);}
    const priority=b.priority||'normal';if(!priorityOptions.some(p=>p.id===priority))error('优先级无效');
    const labelId=b.labelId||null;if(labelId&&!get(labelId,'taskLabel')?.active&&old?.labelId!==labelId)error('任务标签无效');
    const referenceLinks=b.referenceLinks||[];if(!Array.isArray(referenceLinks)||referenceLinks.length>10||referenceLinks.some(link=>{try{const u=new URL(link);return typeof link!=='string'||link.length>2000||!['http:','https:'].includes(u.protocol)||u.username||u.password;}catch{return true;}}))error('最多添加10个不含凭据的http/https参考链接');
    const collaborators=validIds(b.collaborators||[],'member');
    let reviewerIds=validIds(b.reviewerIds|| (b.reviewer?[b.reviewer]:[]),'member');
    const required=b.requiresApproval===true;if(required&&!reviewerIds.length)error('请指定至少一位交接确认人');if(!required)reviewerIds=[];
    const candidateId=old?.id||'new-task',tasks=[...all('task').filter(t=>t.id!==candidateId),{...b,id:candidateId,parentTaskId:parentId}],visiting=new Set(),done=new Set();
    const visit=id=>{if(visiting.has(id))error('任务层级与前置关系形成循环依赖');if(done.has(id))return;visiting.add(id);const current=tasks.find(t=>t.id===id);for(const dep of [...(current?.dependencies||[]),...tasks.filter(t=>t.parentTaskId===id).map(t=>t.id)])visit(dep);visiting.delete(id);done.add(id);};
    tasks.forEach(t=>visit(t.id));
    if(old?.status==='已完成'&&(JSON.stringify(reviewerIds)!==JSON.stringify(old.reviewerIds|| (old.reviewer?[old.reviewer]:[]))||parentId!==(old.parentTaskId||null)))error('已完成任务不能更换层级或确认人');
    return {parentTaskId:parentId,priority,labelId,notes:text(b.notes),requiredSkills:array(b.requiredSkills||[]),collaborators,collaborationDetail:text(b.collaborationDetail),referenceLinks,reviewerIds,reviewer:reviewerIds[0]||null,requiresApproval:required};
  }
  function completionReady(task){
    if(all('task').some(t=>t.parentTaskId===task.id&&t.status!=='已完成'))error('子任务尚未全部完成，不能提交完成或确认');
    if((task.dependencies||[]).some(id=>get(id,'task')?.status!=='已完成'))error('前置任务尚未完成');
  }
  function approve(task,memberId){
    const reviewers=task.reviewerIds?.length?task.reviewerIds:task.reviewer?[task.reviewer]:[];
    if(!reviewers.includes(memberId)||!activeMember(memberId))error('该成员不在本任务确认名单内');
    if(task.confirmations?.[memberId])error('该成员已经确认');completionReady(task);
    const confirmations={...(task.confirmations||{}),[memberId]:now()},completed=reviewers.every(id=>confirmations[id]);
    return {...task,confirmations,status:completed?'已完成':'待确认',confirmedBy:completed?memberId:null,confirmedAt:completed?now():null};
  }
  function snapshot(){return {departments:all('department').sort((a,b)=>a.order-b.order),teams:all('team'),taskLabels:all('taskLabel'),lessons:all('lesson'),discussions:all('discussion'),analyses:all('analysis'),ai:aiStatus()};}
  async function handle(req,res,path,json){
    const organizational=path.match(/^\/api\/admin\/(departments|teams|labels)(?:\/([\w-]+))?$/);
    if(organizational){
      const kind={departments:'department',teams:'team',labels:'taskLabel'}[organizational[1]],id=organizational[2],old=id?get(id,kind):null;
      if(id&&!old){json(404,{error:'设置项不存在'});return true;}
      if(req.method==='GET'){json(200,id?old:all(kind));return true;}
      if(req.method==='DELETE'&&id){
        const used=kind==='department'?all('member').some(m=>m.departmentIds?.includes(id))||all('role').some(r=>r.departmentId===id)||all('team').some(t=>t.departmentId===id):kind==='team'?all('member').some(m=>m.teamId===id):all('task').some(t=>t.labelId===id);
        if(used)error('已有引用，请停用并保留历史');db.prepare('DELETE FROM items WHERE id=? AND kind=?').run(id,kind);broadcast();json(200,{ok:true});return true;
      }
      if(req.method==='POST'&&!id||req.method==='PATCH'&&id){
        const b={...old,...await body(req)},name=str(b.name,'名称',40);if(all(kind).some(x=>x.id!==id&&x.name===name))error('名称已存在');
        const item={id:id||randomUUID(),name,description:text(b.description,2000),active:b.active!==false,order:Number(b.order||0)};
        if(!Number.isFinite(item.order)||item.order<0||item.order>10000)error('排序值无效');
        if(kind==='department'&&!item.active&&(all('member').some(m=>m.active!==false&&m.departmentIds?.includes(id))||all('team').some(t=>t.active&&t.departmentId===id)))error('请先调整部门中的在用成员及小组，再停用部门');
        if(kind==='team'){if(!get(b.departmentId,'department')?.active)error('请选择在用部门');item.departmentId=b.departmentId;item.leaderId=b.leaderId||null;if(item.leaderId&&!activeMember(item.leaderId))error('组长无效');if(old&&all('member').some(m=>m.teamId===id)&&old.departmentId!==item.departmentId)error('小组已有成员，不能直接更换部门');}
        if(kind==='taskLabel'){if(!/^#[\da-f]{6}$/i.test(b.color||''))error('请选择颜色');item.color=b.color;}
        put(kind,item);broadcast();json(old?200:201,item);return true;
      }
      json(405,{error:'方法不支持'});return true;
    }
    if(req.method==='POST'&&path==='/api/recommendations'){
      const b=await body(req),skills=array(b.requiredSkills||[]),members=all('member').filter(m=>!b.departmentId||m.departmentIds?.includes(b.departmentId)),candidates=recommendMembers(members,all('task'),skills);
      if(b.mode==='model'){
        const payload={requirements:skills,task:text(b.task,1000),candidates:candidates.slice(0,20).map(c=>({...c,name:get(c.memberId,'member').name,skills:get(c.memberId,'member').skills||[]}))};
        json(200,{...await analyzeWithModel('assignment',payload),candidates});
      }else json(200,{mode:'rules',candidates,explanation:'75%能力标签覆盖 + 25%待办预计工时余量；仅供人工分配参考，不代表绩效或录用结论。'});
      return true;
    }
    if(req.method==='POST'&&path==='/api/role-fit'){
      const b=await body(req),m=get(b.memberId,'member');if(!m||m.active===false)error('请选择在用成员');
      const roles=all('role').filter(r=>r.active&&r.id!=='role-pending');
      const matches=roles.map(r=>{const needed=r.skills||[],matched=needed.filter(s=>m.skills?.includes(s));return {roleId:r.id,name:r.name,matched,missing:needed.filter(s=>!m.skills?.includes(s)),score:needed.length?Math.round(matched.length/needed.length*100):0};}).sort((a,b)=>b.score-a.score);
      if(b.mode==='model')json(200,{...await analyzeWithModel('rolefit',{member:{name:m.name,skills:m.skills||[]},roles:roles.map(r=>({name:r.name,skills:r.skills||[],responsibilities:r.responsibilities||''}))}),matches});
      else json(200,{mode:'rules',matches});return true;
    }
    const discussion=path.match(/^\/api\/tasks\/([\w-]+)\/discussions$/);
    if(req.method==='POST'&&discussion){
      const task=get(discussion[1],'task');if(!task){json(404,{error:'任务不存在'});return true;}
      const b=await body(req);if(!activeMember(b.memberId))error('请选择在用成员');const item={id:randomUUID(),taskId:task.id,memberId:b.memberId,content:str(b.content,'协作内容',4000),createdAt:now()};put('discussion',item);broadcast();json(201,item);return true;
    }
    if(req.method==='POST'&&path==='/api/lessons/analyze'){
      const b=await body(req),ids=array(b.lessonIds||[],100);const lessons=all('lesson').filter(l=>ids.includes(l.id)&&(!b.projectId||l.projectId===b.projectId));if(!lessons.length)error('请选择需要整理的经验记录');
      const result=b.mode==='model'?await analyzeWithModel('lessons',{records:lessons.map(({title,problem,cause,solution,prevention,status,category})=>({title,problem,cause,solution,prevention,status,category}))}):organizeLessons(lessons);
      const item={id:randomUUID(),lessonIds:lessons.map(l=>l.id),projectId:b.projectId||null,...result};put('analysis',item);broadcast();json(201,item);return true;
    }
    const lesson=path.match(/^\/api\/lessons(?:\/([\w-]+))?$/);
    if(lesson){
      const id=lesson[1],old=id?get(id,'lesson'):null;if(id&&!old){json(404,{error:'记录不存在'});return true;}
      if(req.method==='GET'){json(200,id?old:all('lesson'));return true;}
      if(req.method==='POST'&&!id||req.method==='PATCH'&&id){
        const b={...old,...await body(req)};if(!get(b.projectId,'project')||!activeMember(b.memberId))error('项目或记录成员无效');if(b.taskId&&get(b.taskId,'task')?.projectId!==b.projectId)error('关联任务必须属于此项目');
        if(!['待分析','处理中','已解决','已沉淀'].includes(b.status))error('问题状态无效');
        const item={id:id||randomUUID(),projectId:b.projectId,taskId:b.taskId||null,memberId:b.memberId,title:str(b.title,'问题标题',120),category:str(b.category||'其他','问题分类',40),problem:str(b.problem,'问题经过',4000),cause:text(b.cause),solution:text(b.solution),prevention:text(b.prevention),tags:array(b.tags||[]),status:b.status,createdAt:old?.createdAt||now(),updatedAt:now()};put('lesson',item);broadcast();json(old?200:201,item);return true;
      }
      json(405,{error:'方法不支持'});return true;
    }
    return false;
  }
  return {snapshot,memberFields,roleFields,taskFields,completionReady,approve,handle};
}
