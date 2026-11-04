export function personalWork(state,memberId,today) {
  const tasks=state.tasks.filter(t=>t.assignee===memberId);
  const open=tasks.filter(t=>t.status!=='已完成');
  const confirmations=state.tasks.filter(t=>t.requiresApproval&&t.reviewer===memberId&&t.status==='待确认');
  const taskById=new Map(state.tasks.map(t=>[t.id,t]));
  const blocked=open.filter(t=>(t.dependencies||[]).some(id=>taskById.get(id)?.status!=='已完成'));
  return {tasks,open,confirmations,blocked,overdue:open.filter(t=>t.due<today),hours:state.logs.filter(l=>l.memberId===memberId&&l.date===today).reduce((sum,l)=>sum+l.hours,0)};
}

export function coordinationWork(state,today) {
  const open=state.tasks.filter(t=>t.status!=='已完成');
  const taskById=new Map(state.tasks.map(t=>[t.id,t]));
  return {overdue:open.filter(t=>t.due<today),confirmations:open.filter(t=>t.status==='待确认'),blocked:open.filter(t=>(t.dependencies||[]).some(id=>taskById.get(id)?.status!=='已完成'))};
}
