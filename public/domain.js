export function ancestorPath(items,id){
  const byId=new Map(items.map(x=>[x.id,x])),seen=new Set(),path=[];
  while(id){if(seen.has(id))throw Error('层级不能形成循环');seen.add(id);const item=byId.get(id);if(!item)throw Error('上级不存在');path.unshift(item);id=item.parentId;}
  return path;
}
export function treeRows(items,parentId=null,depth=1,seen=new Set()){
  return items.filter(x=>(x.parentId||null)===parentId).flatMap(item=>{
    if(seen.has(item.id))return [];const next=new Set(seen);next.add(item.id);
    return [{...item,depth},...treeRows(items,item.id,depth+1,next)];
  });
}
export function validateTreeMove(items,id,parentId,maxDepth=5){
  const candidates=items.filter(x=>x.id!==id);const item=items.find(x=>x.id===id)||{id};
  const updated=[...candidates,{...item,parentId:parentId||null}];
  for(const row of updated)if(ancestorPath(updated,row.id).length>maxDepth)throw Error(`最多支持${maxDepth}级，移动后子项也不能超出限制`);
}
export const priorityOptions=[{id:'urgent',name:'紧急',color:'#f27378'},{id:'high',name:'高优先',color:'#e6ad62'},{id:'normal',name:'普通',color:'#899be5'},{id:'low',name:'低优先',color:'#8a969e'}];
export function recommendMembers(members,tasks,requiredSkills=[]){
  const needed=[...new Set(requiredSkills.map(s=>s.trim()).filter(Boolean))];
  return members.filter(m=>m.active!==false).map(m=>{
    const skills=m.skills||[],matched=needed.filter(s=>skills.includes(s));
    const pending=tasks.filter(t=>t.assignee===m.id&&t.status!=='已完成');
    const remaining=pending.reduce((n,t)=>n+Number(t.estimate||0),0),capacity=Number(m.weeklyCapacity)||40;
    const fit=needed.length?matched.length/needed.length:0;
    const score=Math.round(75*fit+25*Math.max(0,1-remaining/capacity));
    return {memberId:m.id,score,matched,missing:needed.filter(s=>!skills.includes(s)),pendingHours:remaining,pendingCount:pending.length,reason:needed.length?`匹配 ${matched.length}/${needed.length} 项能力；待办预计 ${remaining}h`:`未填写能力要求；仅参考待办预计 ${remaining}h`};
  }).sort((a,b)=>b.score-a.score||a.pendingHours-b.pendingHours);
}
