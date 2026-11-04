import { ancestorPath, treeRows } from './domain.js';
export function createAdminUI(ctx){
  const {esc,field,options,modal,api,refresh,toast,heading,avatar,editMember,editRole}=ctx;
  let tab='categories';
  const labels={categories:'项目分类',fields:'项目字段',stages:'流程选项',members:'人员资料',roles:'工种管理',departments:'部门管理',teams:'小组管理',labels:'颜色标签',ai:'AI连接'};
  const data=()=>ctx.getData();
  const list=kind=>kind==='categories'?data().categories:kind==='fields'?data().fieldDefs:kind==='stages'?data().stageOptions:kind==='members'?data().members:kind==='departments'?data().departments:kind==='teams'?data().teams:kind==='labels'?data().taskLabels:kind==='ai'?[]:data().roles;
  const path=(kind,id='')=>'/api/admin/'+kind+(id?'/'+id:'');
  const categoryName=id=>data().categories.find(c=>c.id===id)?.name||'全部分类';
  function row(kind,item,depth=1){const child=depth>1;
    const hint=kind==='fields'?`${({text:'文字',number:'数字',select:'下拉选项'})[item.type]} · ${categoryName(item.categoryId)} · ${item.required?'必填':'选填'}`:kind==='stages'?`排序 ${item.order} · 改名会同步项目与任务`:kind==='members'?item.role:kind==='roles'?`${data().members.filter(m=>m.roleIds?.includes(item.id)).length} 位成员使用`:kind==='departments'?item.description:kind==='teams'?(data().departments.find(d=>d.id===item.departmentId)?.name||'未分组'):kind==='labels'?'用于任务颜色分类':`第${depth}级分类`;
    return `<article class="setting-row ${child?'child-setting':''}" style="--tree-depth:${depth}"><div class="setting-icon">${kind==='members'?avatar(item.id):kind==='categories'?(child?'·':'◇'):kind==='fields'?'☷':'↗'}</div><div class="setting-info"><strong>${esc(item.name)} ${item.coordinator?'<span class="coordinator-badge">统筹</span>':''}</strong><p>${esc(hint)}</p></div><span class="setting-state">${item.active===false?'已停用':'在用'}</span><div class="setting-actions">${kind==='categories'&&depth<5?`<button class="btn" data-setting="categories" data-parent="${item.id}">＋ 子分类</button>`:''}<button class="btn" data-setting="${kind}" data-setting-id="${item.id}">编辑</button>${!['members','roles'].includes(kind)?`<button class="text-btn danger" data-delete-setting="${kind}" data-setting-id="${item.id}">删除</button>`:''}</div></article>`;
  }
  function page(){
    const kind=tab;
    let items=list(kind),content='';
    if(kind==='categories')content=treeRows(items).map(c=>row(kind,c,c.depth)).join('');
    else content=items.map(i=>row(kind,i)).join('');
    const subtitle={categories:'分类最多五级，可持续细分；字段会继承适用上级分类。',fields:'配置材质、尺寸、工艺要求等项目字段，可指定适用分类。',stages:'调整流程名称、显示顺序和启用状态，前台表单实时同步。',members:'上传头像，修改姓名、简介、工种、参考工时与统筹职责。',roles:'维护部门、工种职能与能力要求，为任务匹配提供依据。',departments:'按产品、设计、生产、内容、电商、财务等职能分组，可自行排序。',teams:'设置部门下的小组及组长，成员归属在人员资料中调整。',labels:'配置任务颜色标签，优先级与颜色分类分别管理。',ai:'查看模型连接状态，未接入时可使用明确标注的规则整理。'}[kind];
    if(kind==='ai')return heading('INTELLIGENCE CONNECTION','AI连接','模型只生成建议，任务分配与经验结论由人员复核。')+`<div class="admin-tabs ai-back"><button data-admin-tab="categories">← 返回后台</button></div><section class="panel ai-settings"><h2>${data().ai.configured?'已配置模型服务':'DeepSeek尚未连接'}</h2><p>${data().ai.configured?esc(data().ai.host)+' · '+esc(data().ai.model):'已按DeepSeek预置兼容接口，尚需在本机启动窗口输入密钥。当前可使用规则整理与能力匹配。'}</p><h3>在运行电脑上配置</h3><p>Windows 可关闭普通启动窗口，双击 start-ai.cmd 按提示配置。也可设置服务端变量 STUDIO_AI_BASE_URL、STUDIO_AI_MODEL、STUDIO_AI_API_KEY。密钥不要发到聊天或写进仓库。</p><p>支持国内模型的兼容接口。DeepSeek、通义千问、豆包的模型名称和接口地址各不相同，请按已购买服务的文档配置后重启。</p><p>实际调用前会确认发送哪些记录；生成结果显示来源，可作为经验草稿人工复核。</p></section>`;
    return heading('STUDIO CONTROL CENTER','后台设置','在这里维护分类、表单和团队资料，让工作空间适应你的流程。')+`<div class="admin-notice">共享试用版 · 设置会影响全员，目前尚无登录权限限制。</div><div class="admin-layout"><div class="admin-tabs">${Object.entries(labels).map(([key,label])=>`<button data-admin-tab="${key}" class="${tab===key?'active':''}"><span>${label}</span><small>${list(key).length}</small></button>`).join('')}</div><section class="panel admin-panel"><div class="admin-section-head"><div><h2>${labels[kind]}</h2><p>${subtitle}</p></div><button class="btn primary" data-setting="${kind}">＋ 新增${kind==='members'?'成员':kind==='roles'?'工种':kind==='fields'?'字段':kind==='stages'?'流程':kind==='departments'?'部门':kind==='teams'?'小组':kind==='labels'?'标签':'分类'}</button></div>${content||'<div class="empty">还没有设置项，点击右上方新增。</div>'}</section></div><p class="page-note">设置保存在当前电脑数据库，同一服务的手机和电脑会自动同步。已有数据引用的项目无法直接删除，可改用停用。</p>`;
  }
  function edit(kind,id,parentId=''){
    if(kind==='members'){editMember(id||'new');return;}
    if(kind==='roles'){editRole(id||'new');return;}
    const old=list(kind).find(x=>x.id===id),item=old||{name:'',active:true,order:list(kind).length,parentId:parentId||null,type:'text',options:[],categoryId:null,required:false};
    let fields=field('名称',`<input name="name" value="${esc(item.name)}" required maxlength="40">`);
    if(kind==='categories')fields+=field('上级分类',`<select name="parentId"><option value="">无 · 作为一级分类</option>${options(treeRows(data().categories).filter(c=>c.id!==id&&ancestorPath(data().categories,c.id).every(a=>a.id!==id)&&c.depth<5).map(c=>({...c,name:ancestorPath(data().categories,c.id).map(x=>x.name).join(' / ')})),'id','name',item.parentId)}</select>`);
    if(kind==='fields')fields+=`<div class="form-grid">${field('字段类型',`<select name="type">${[['text','文字'],['number','数字'],['select','下拉选项']].map(([v,n])=>`<option value="${v}" ${v===item.type?'selected':''}>${n}</option>`).join('')}</select>`)}${field('适用分类',`<select name="categoryId"><option value="">全部分类</option>${options(treeRows(data().categories).map(c=>({...c,name:ancestorPath(data().categories,c.id).map(a=>a.name).join(' / ')})),'id','name',item.categoryId)}</select>`)}</div>${field('下拉选项（每行一项，仅下拉类型生效）',`<textarea name="options" placeholder="925银\n黄铜\n青铜">${esc(item.options.join('\n'))}</textarea>`)}<label class="check-label"><input name="required" type="checkbox" ${item.required?'checked':''}> 必填字段</label><p class="page-note">已有数据的字段不能更改类型或适用分类；已使用的下拉选项不能直接移除。可停用旧字段后新增。</p>`;
    if(kind==='departments')fields+=field('部门职能',`<textarea name="description">${esc(item.description||'')}</textarea>`);
    if(kind==='teams')fields+=field('所属部门',`<select name="departmentId" required>${options(data().departments.filter(d=>d.active),'id','name',item.departmentId)}</select>`)+field('组长（选填）',`<select name="leaderId"><option value="">待指定</option>${options(data().members.filter(m=>m.active!==false),'id','name',item.leaderId)}</select>`);
    if(kind==='labels')fields+=field('标签颜色',`<input type="color" name="color" value="${item.color||'#899be5'}">`);
    fields+=field('显示顺序（数字小的靠前）',`<input name="order" type="number" min="0" max="10000" value="${item.order}" required>`)+`<label class="check-label"><input name="active" type="checkbox" ${item.active?'checked':''}> 启用</label>`;
    modal(`<div class="eyebrow">STUDIO SETTINGS</div><h2>${old?'编辑':'新增'}${labels[kind]}</h2><form data-settings-form="${kind}" ${id?`data-id="${id}"`:''}>${fields}<p class="form-error" role="alert"></p><div class="form-actions"><button type="button" class="btn" data-close>取消</button><button class="btn primary" type="submit">保存设置</button></div></form>`);
  }
  async function click(button){
    if(button.dataset.adminTab){tab=button.dataset.adminTab;ctx.render();return true;}
    if(button.dataset.setting){edit(button.dataset.setting,button.dataset.settingId,button.dataset.parent);return true;}
    if(button.dataset.deleteSetting){
      if(!confirm('确定删除这个设置项？如果已有数据引用，系统会阻止删除。'))return true;
      await api(path(button.dataset.deleteSetting,button.dataset.settingId),'DELETE');await refresh();toast('设置项已删除');return true;
    }
    return false;
  }
  async function submit(form){
    if(!form.dataset.settingsForm)return false;
    const kind=form.dataset.settingsForm,fd=new FormData(form),b=Object.fromEntries(fd);b.active=fd.has('active');b.required=fd.has('required');
    if(kind==='fields')b.options=String(b.options||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    const button=form.querySelector('[type=submit]');button.disabled=true;
    try{await api(path(kind,form.dataset.id),form.dataset.id?'PATCH':'POST',b);document.querySelector('#modal').close();await refresh();toast('设置已保存，前台已同步');}catch(e){form.querySelector('.form-error').textContent=e.message;}finally{button.disabled=false;}
    return true;
  }
  return {page,click,submit};
}
