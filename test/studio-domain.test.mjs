import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ancestorPath,validateTreeMove,treeRows,recommendMembers} from '../public/domain.js';
import {aiStatus,analyzeWithModel,organizeLessons} from '../ai.mjs';

test('five-level category moves validate the entire subtree and reject loops',()=>{
 const nodes=Array.from({length:5},(_,i)=>({id:String(i),parentId:i?String(i-1):null}));
 assert.equal(ancestorPath(nodes,'4').length,5);assert.deepEqual(treeRows(nodes).map(n=>n.depth),[1,2,3,4,5]);
 assert.throws(()=>validateTreeMove(nodes,'5','4'),/5级/);assert.throws(()=>validateTreeMove(nodes,'0','4'),/循环/);
 const other=[...nodes,{id:'root2',parentId:null}];assert.throws(()=>validateTreeMove(other,'0','root2'),/5级/);
});
test('capability matching uses declared skills and remaining workload, excluding inactive staff',()=>{
 const members=[{id:'a',skills:['3D制作','拆件'],weeklyCapacity:40},{id:'b',skills:['3D制作'],weeklyCapacity:40},{id:'c',skills:['3D制作','拆件'],active:false}];
 const result=recommendMembers(members,[{assignee:'a',status:'进行中',estimate:10}],['3D制作','拆件']);
 assert.equal(result[0].memberId,'a');assert.deepEqual(result[1].missing,['拆件']);assert.equal(result.length,2);assert.equal(result[0].score,94);
 assert.equal(recommendMembers([{id:'new',skills:[]}],[],['3D制作'])[0].matched.length,0);
});
test('rule organization is labelled correctly and does not invent missing causes',()=>{
 const r=organizeLessons([{title:'缩孔',problem:'样件局部出现孔洞',category:'铸造',status:'待分析'}]);assert.equal(r.mode,'rules');assert.match(r.content,/需验证/);assert.match(r.content,/样件局部出现孔洞/);assert.equal(r.model,null);
});
test('model adapter calls a compatible endpoint and never returns credentials',async()=>{
 const env={STUDIO_AI_BASE_URL:'https://model.example/v1',STUDIO_AI_MODEL:'example-model',STUDIO_AI_API_KEY:'test-placeholder-key'};let captured;
 const result=await analyzeWithModel('lessons',{records:[{problem:'样件问题'}]},{env,fetcher:async(url,options)=>{captured={url:String(url),options};return new Response(JSON.stringify({choices:[{message:{content:'需进一步验证原因。'}}]}),{status:200});}});
 assert.equal(captured.url,'https://model.example/v1/chat/completions');assert.equal(JSON.parse(captured.options.body).model,'example-model');assert.equal(result.mode,'model');assert.equal(result.content,'需进一步验证原因。');assert.equal(JSON.stringify(aiStatus(env)).includes('test-placeholder-key'),false);assert.equal(JSON.stringify(result).includes('test-placeholder-key'),false);
});
test('missing, failed or malformed model services remain explicit failures',async()=>{
 await assert.rejects(analyzeWithModel('lessons',{}, {env:{}}),/尚未配置/);
 const env={STUDIO_AI_BASE_URL:'https://model.example',STUDIO_AI_MODEL:'test',STUDIO_AI_API_KEY:'placeholder'};
 await assert.rejects(analyzeWithModel('lessons',{}, {env,fetcher:async()=>new Response('{}',{status:401})}),/401/);
 await assert.rejects(analyzeWithModel('lessons',{}, {env,fetcher:async()=>new Response('invalid',{status:200})}),/有效分析/);
 await assert.rejects(analyzeWithModel('lessons',{}, {env:{...env,STUDIO_AI_BASE_URL:'http://unsafe.example'}}),/HTTPS/);
});
