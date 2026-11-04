export function createAdminUI(ctx){
  const {esc,field,options,modal,api,refresh,toast,heading,avatar,editMember,editRole}=ctx;
  let tab='categories';
  const labels={categories:'项目分类',fields:'项目字段',stages:'流程选项',members:'人员资料',roles:'工种管理'};
  const data=()=>ctx.getData();
  const list=kind=>kind==='categories'?data().categories:kind==='fields'?data().fieldDefs:kind==='stages'?data().stageOptions:kind==='members'?data().members:data().roles;
  const path=(kind,id='')=>'/api/admin/'+kind+(id?'/'+id:'');
  const categoryName=id=>data().categories.find(c=>c.id===id)?.name||'全部分类';
  function row(kind,item,child=false){
    const hint=kind==='fields'?`${({text:'文字',number:'数字',select:'下拉选项'})[item.type]} · ${categoryName(item.categoryId)} · ${item.required?'必填':'选填'}`:kind==='stages'?`排序 ${item.order} · 改名会同步项目与任务`:kind==='members'?item.role:kind==='roles'?`${data().members.filter(m=>m.roleIds?.includes(item.id)).length} 位成员使用`:child?'二级分类':'一级分类';
    return `<article class="setting-row ${child?'child-setting':''}"><div class="setting-icon">${kind==='members'?avatar(item.id):kind==='categories'?(child?'·':'◇'):kind==='fields'?'☷':'↗'}</div><div class="setting-info"><strong>${esc(item.name)} ${item.coordinator?'<span class="coordinator-badge">统筹</span>':''}</strong><p>${esc(hint)}</p></div><span class="setting-state">${item.active===false?'已停用':'在用'}</span><div class="setting-actions">${kind==='categories'&&!child?`<button class="btn" data-setting="categories" data-parent="${item.id}">＋ 子分类</button>`:''}<button class="btn" data-setting="${kind}" data-setting-id="${item.id}">编辑</button>${!['members','roles'].includes(kind)?`<button class="text-btn danger" data-delete-setting="${kind}" data-setting-id="${item.id}">删除</button>`:''}</div></article>`;
  }
  function page(){
    const kind=tab;
    let items=list(kind),content='';
    if(kind==='categories')content=items.filter(c=>!c.parentId).map(c=>row(kind,c)+items.filter(x=>x.parentId===c.id).map(x=>row(kind,x,true)).join('')).join('');
    else content=items.map(i=>row(kind,i)).join('');
    const subtitle={categories:'管理一级分类与二级子分类，新建项目时直接选择。',fields:'配置材质、尺寸、工艺要求等项目字段，可指定适用分类。',stages:'调整流程名称、显示顺序和启用状态，前台表单实时同步。',members:'上传头像，修改姓名、简介、工种、参考工时与统筹职责。',roles:'维护可多选的工种，修改后同步到团队分工。'}[kind];
    return heading('STUDIO CONTROL CENTER','后台设置','在这里维护分类、表单和团队资料，让工作空间适应你的流程。')+`<div class="admin-notice">共享试用版 · 设置会影响全员，目前尚无登录权限限制。</div><div class="admin-layout"><div class="admin-tabs">${Object.entries(labels).map(([key,label])=>`<button data-admin-tab="${key}" class="${tab===key?'active':''}"><span>${label}</span><small>${list(key).length}</small></button>`).join('')}</div><section class="panel admin-panel"><div class="admin-section-head"><div><h2>${labels[kind]}</h2><p>${subtitle}</p></div><button class="btn primary" data-setting="${kind}">＋ 新增${kind==='members'?'成员':kind==='roles'?'工种':kind==='fields'?'字段':kind==='stages'?'流程':'分类'}</button></div>${content||'<div class="empty">还没有设置项，点击右上方新增。</div>'}</section></div><p class="page-note">设置保存在当前电脑数据库，同一服务的手机和电脑会自动同步。已有数据引用的项目无法直接删除，可改用停用。</p>`;
  }
  function edit(kind,id,parentId=''){
    if(kind==='members'){editMember(id||'new');return;}
    if(kind==='roles'){editRole(id||'new');return;}
    const old=list(kind).find(x=>x.id===id),item=old||{name:'',active:true,order:list(kind).length,parentId:parentId||null,type:'text',options:[],categoryId:null,required:false};
    let fields=field('名称',`<input name="name" value="${esc(item.name)}" required maxlength="40">`);
    if(kind==='categories')fields+=field('上级分类',`<select name="parentId"><option value="">无 · 作为一级分类</option>${options(data().categories.filter(c=>!c.parentId&&c.id!==id),'id','name',item.parentId)}</select>`);
    if(kind==='fields')fields+=`<div class="form-grid">${field('字段类型',`<select name="type">${[['text','文字'],['number','数字'],['select','下拉选项']].map(([v,n])=>`<option value="${v}" ${v===item.type?'selected':''}>${n}</option>`).join('')}</select>`)}${field('适用分类',`<select name="categoryId"><option value="">全部分类</option>${options(data().categories,'id','name',item.categoryId)}</select>`)}</div>${field('下拉选项（每行一项，仅下拉类型生效）',`<textarea name="options" placeholder="925银\n黄铜\n青铜">${esc(item.options.join('\n'))}</textarea>`)}<label class="check-label"><input name="required" type="checkbox" ${item.required?'checked':''}> 必填字段</label><p class="page-note">已有数据的字段不能更改类型或适用分类；已使用的下拉选项不能直接移除。可停用旧字段后新增。</p>`;
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
