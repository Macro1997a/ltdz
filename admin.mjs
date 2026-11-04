import { ancestorPath, validateTreeMove } from './public/domain.js';
import { randomUUID } from 'node:crypto';

export function createAdmin({db,all,get,put,error,str,body,defaultStages}) {
  db.exec('CREATE TABLE IF NOT EXISTS avatars (member_id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, version TEXT NOT NULL)');
  if(!db.prepare("SELECT key FROM meta WHERE key='admin-v4'").get()){
    db.exec('BEGIN');
    try{
      const rootJewelry={id:'cat-jewelry',name:'首饰',parentId:null,active:true,order:0};put('category',rootJewelry);
      const names=[...new Set(['戒指','项链','耳饰','工艺品',...all('project').map(p=>p.category)])];
      names.forEach((name,i)=>put('category',{id:'cat-'+i,name,parentId:['戒指','项链','耳饰'].includes(name)?rootJewelry.id:null,active:true,order:i+1}));
      for(const p of all('project')){const c=all('category').find(c=>c.name===p.category);if(c)put('project',{...p,categoryId:c.id,customFields:p.customFields||{}});}
      [...new Set([...defaultStages,...all('project').map(p=>p.stage),...all('task').map(t=>t.stage)])].forEach((name,i)=>put('stage',{id:'stage-'+i,name,active:true,order:i}));
      db.prepare("INSERT INTO meta VALUES ('admin-v4','1')").run();db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  const sorted=kind=>all(kind).sort((a,b)=>(a.order||0)-(b.order||0));
  const stageNames=()=>sorted('stage').filter(s=>s.active).map(s=>s.name);
  function snapshot(){return {categories:sorted('category'),fieldDefs:sorted('projectField'),stageOptions:sorted('stage')};}
  function projectFields(b){
    const existing=b.id?get(b.id,'project'):null;
    const c=b.categoryId?get(b.categoryId,'category'):all('category').find(c=>c.name===b.category);
    if(!c||(!c.active&&existing?.categoryId!==c.id))error('请选择在用分类，或先到后台设置新增分类');
    if(ancestorPath(all('category'),c.id).some(x=>!x.active)&&existing?.categoryId!==c.id)error('该分类的上级已停用');
    const custom=b.customFields??{};if(typeof custom!=='object'||custom===null||Array.isArray(custom))error('项目字段格式错误');
    const values=Object.create(null);const definitions=all('projectField');
    for(const key of Object.keys(custom))if(!definitions.some(f=>f.id===key))error('项目字段已被删除，请刷新后重试');
    for(const f of definitions){
      const applicable=f.active&&(!f.categoryId||ancestorPath(all('category'),c.id).some(x=>x.id===f.categoryId));
      let value=custom[f.id];
      if(!applicable){if(existing?.customFields?.[f.id]!==undefined)values[f.id]=existing.customFields[f.id];continue;}
      if(value===undefined||value===null||value===''){if(f.required)error('请填写：'+f.name);continue;}
      if(f.type==='number'){value=Number(value);if(!Number.isFinite(value))error(f.name+'必须是有效数字');}
      else {if(typeof value!=='string'||value.length>1000)error(f.name+'内容过长或格式错误');if(f.type==='select'&&!f.options.includes(value))error(f.name+'不在可选项中');}
      values[f.id]=value;
    }
    return {categoryId:c.id,category:c.name,customFields:values};
  }
  function validate(kind,b,old){
    const name=str(b.name,'名称',40),id=old?.id;
    if(all(kind).some(x=>x.id!==id&&x.name===name&&(kind!=='category'||x.parentId===(b.parentId||null))))error('同级名称已存在');
    const order=Number(b.order??old?.order??all(kind).length);if(!Number.isFinite(order)||order<0||order>10000)error('排序值需在0至10000之间');
    const value={name,active:b.active!==false,order};
    if(kind==='category'){
      const parentId=b.parentId||null,parent=parentId?get(parentId,'category'):null;
      try{validateTreeMove(all('category'),id||'new-category',parentId,5);}catch(e){error(e.message);}
      if(value.active&&parentId&&ancestorPath(all('category'),parentId).some(x=>!x.active))error('请先启用所有上级分类');
      if(!value.active&&all('category').some(c=>c.parentId===id&&c.active))error('请先停用该分类下的子分类');
      return {...value,parentId};
    }
    if(kind==='stage'){
      if(!value.active&&!all('stage').some(s=>s.id!==id&&s.active))error('至少保留一个在用流程');
      return value;
    }
    if(!['text','number','select'].includes(b.type))error('字段类型无效');
    if(b.categoryId&&!get(b.categoryId,'category'))error('字段所属分类不存在');
    const options=b.type==='select'?b.options:[];
    if(!Array.isArray(options)||options.length>50||options.some(o=>typeof o!=='string'||!o.trim()||o.length>80)||b.type==='select'&&!options.length)error('选项需填写1到50项，每项不超过80字');
    if(old&&all('project').some(p=>p.customFields?.[id]!==undefined)){
      if(old.type!==b.type||old.categoryId!==(b.categoryId||null))error('该字段已有数据，不能改变类型或所属分类；可停用并新增字段');
      if(b.type==='select'&&all('project').some(p=>p.customFields?.[id]!==undefined&&!options.includes(p.customFields[id])))error('被项目使用的选项不能移除，请先修改对应项目值');
    }
    return {...value,type:b.type,required:b.required===true,categoryId:b.categoryId||null,options:[...new Set(options.map(o=>o.trim()))]};
  }
  async function handle(req,res,path,json,broadcast){
    const avatarRoute=path.match(/^\/api\/members\/([\w-]+)\/avatar$/);
    if(avatarRoute){
      const id=avatarRoute[1],m=get(id,'member');if(!m){json(404,{error:'成员不存在'});return true;}
      if(req.method==='GET'){
        const a=db.prepare('SELECT * FROM avatars WHERE member_id=?').get(id);if(!a){json(404,{error:'头像不存在'});return true;}
        res.writeHead(200,{'Content-Type':a.mime,'Content-Length':a.data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(Buffer.from(a.data));return true;
      }
      if(req.method==='POST'){
        const b=await body(req,3000000);if(typeof b?.dataUrl!=='string')error('请选择图片');
        const match=b.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);if(!match)error('只支持 PNG、JPG、WebP 图片');
        const bytes=Buffer.from(match[2],'base64');if(bytes.length<12||bytes.length>2*1024*1024)error('图片大小需在2MB以内');
        const signature=match[1]==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
        if(!signature)error('图片格式与文件内容不符');const version=randomUUID();
        db.prepare('INSERT INTO avatars VALUES(?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET mime=excluded.mime,data=excluded.data,version=excluded.version').run(id,match[1],bytes,version);
        put('member',{...m,avatarVersion:version});broadcast();json(200,{avatarVersion:version});return true;
      }
      if(req.method==='DELETE'){db.prepare('DELETE FROM avatars WHERE member_id=?').run(id);put('member',{...m,avatarVersion:null});broadcast();json(200,{ok:true});return true;}
      json(405,{error:'方法不支持'});return true;
    }
    const match=path.match(/^\/api\/admin\/(categories|stages|fields)(?:\/([\w-]+))?$/);if(!match)return false;
    const kind={categories:'category',stages:'stage',fields:'projectField'}[match[1]],id=match[2],old=id?get(id,kind):null;
    if(req.method==='GET'){json(200,id?old:sorted(kind));return true;}
    if(id&&!old){json(404,{error:'设置项不存在'});return true;}
    if(req.method==='DELETE'&&id){
      const used=kind==='category'?all('category').some(c=>c.parentId===id)||all('project').some(p=>p.categoryId===id)||all('projectField').some(f=>f.categoryId===id):kind==='stage'?all('project').some(p=>p.stage===old.name)||all('task').some(t=>t.stage===old.name):all('project').some(p=>p.customFields?.[id]!==undefined);
      if(used)error('该设置已有数据引用，请改用停用，或先移除引用后再删除');
      if(kind==='stage'&&old.active&&stageNames().length<=1)error('至少保留一个在用流程');
      db.prepare('DELETE FROM items WHERE id=? AND kind=?').run(id,kind);broadcast();json(200,{ok:true});return true;
    }
    if(req.method==='POST'&&!id||req.method==='PATCH'&&id){
      const b=await body(req);if(!b||typeof b!=='object'||Array.isArray(b))error('设置内容格式错误');
      const item={...validate(kind,{...old,...b},old),id:id||randomUUID()};
      db.exec('BEGIN');try{put(kind,item);if(kind==='stage'&&old&&old.name!==item.name)for(const k of ['project','task'])for(const x of all(k))if(x.stage===old.name)put(k,{...x,stage:item.name});db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
      broadcast();json(old?200:201,item);return true;
    }
    json(405,{error:'方法不支持'});return true;
  }
  return {stageNames,snapshot,projectFields,handle};
}
