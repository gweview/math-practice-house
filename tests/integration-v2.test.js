import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as engine from '../src/engine.js';
const catalog=Object.fromEntries(['topics','questions','dependencies'].map(k=>[k,JSON.parse(readFileSync(new URL(`../data/${k}.json`,import.meta.url),'utf8'))]));
const base={grade:1,semester:'all',topicId:'cnm_p006',dimensions:['reverse'],level:3,count:18,seed:'audit-0'};

test('P0 denominator source key accepts 8/C and rejects 5/B independently of verify',()=>{
 const q=catalog.questions.find(q=>q.id==='cnm_p226_q2');
 assert.equal(engine.checkAnswer(q,'8'),true);
 assert.equal(engine.checkAnswer(q,'C'),true);
 assert.equal(engine.checkAnswer(q,'5'),false);
 assert.equal(engine.checkAnswer(q,'B'),false);
 const projected=engine.generateWorksheet(catalog,{...base,grade:3,topicId:'cnm_p226',dimensions:['basic'],level:1,count:6}).questions.find(item=>item.id===q.id);
 assert.equal(projected.choices.find(c=>c.key===projected.answer).text,'8');
 assert.equal(q.answer,'B','original source record remains preserved, correction is a projection');
});

test('full-chain bounded reverse task never leaves the declared five-number scope',()=>{
 for(const seed of ['audit-0','audit-1','audit-2','audit-latest-01']){
  const w=engine.generateWorksheet(catalog,{...base,seed});
  for(const q of w.questions){
   const nums=q.prompt.match(/\d+/g)?.map(Number)||[];
   assert.ok(nums.every(n=>n<=5),q.prompt);
  }
 }
});

test('tens-only fill challenge cannot introduce unit arithmetic',()=>{
 for(const seed of ['audit-0','audit-1','audit-2']){
  const w=engine.generateWorksheet(catalog,{...base,topicId:'cnm_p030',dimensions:['fill'],seed});
  for(const q of w.questions)assert.ok((q.prompt.match(/\d+/g)||[]).map(Number).every(n=>n%10===0),q.prompt);
 }
});

test('six focus pilots expose semantic questions and genuinely distinct template families',()=>{
 assert.equal(typeof engine.generateCandidates,'function','V2 candidate API must exist');
 const pilots=['cnm_p020','cnm_p018','cnm_p047','cnm_p060','cnm_p224','cnm_p089'];
 for(const id of pilots){
  const topic=catalog.topics.find(t=>t.id===id),families=new Set();let diagrams=0;
  for(const level of [1,2,3]){
   const pool=engine.generateCandidates(catalog,{...base,grade:topic.grade,topicId:id,dimensions:engine.getCapabilities(topic),level,count:18,seed:'v2-acceptance'});
   for(const q of pool.questions){
    assert.equal(q.schemaVersion,2,q.id);
    assert.ok(q.templateId&&q.familyId&&q.student?.blocks?.length&&q.student?.tasks?.length,q.id);
    assert.ok(q.answerSpec&&q.layout?.minWritingMm>=0,q.id);
    assert.ok(q.student.blocks.every(b=>['text','equation','diagram'].includes(b.type)),q.id);
    if(q.source==='original'){families.add(q.familyId);diagrams+=q.student.blocks.some(b=>b.type==='diagram')?1:0;}
   }
  }
  assert.ok(families.size>=3,`${id}: only ${families.size} original task families`);
  assert.ok(diagrams>0,`${id}: student diagrams are required`);
 }
});

test('typed unit answers are accepted but manual reasoning is never silently fully graded',()=>{
 assert.equal(typeof engine.assessAnswer,'function');
 const quantity={answer:'12',answerSpec:{kind:'quantity',value:'12',unit:'厘米',aliases:['cm']},student:{tasks:[{id:'answer',kind:'number',label:'长度'}]}};
 for(const value of ['12','１２厘米','12 cm'])assert.equal(engine.assessAnswer(quantity,value).status,'correct',value);
 assert.equal(engine.assessAnswer(quantity,'').status,'unanswered');
 const multipart={answer:'yes',answerSpec:{kind:'multipart',parts:[{id:'judgment',spec:{kind:'choice',value:'yes'}},{id:'reason',spec:{kind:'rubric',manual:true}}]},student:{tasks:[{id:'judgment',kind:'choice',label:'判断',options:[{key:'yes',text:'对'},{key:'no',text:'错'}]},{id:'reason',kind:'manual',label:'理由'}]}};
 const result=engine.assessAnswer(multipart,{judgment:'yes',reason:'我画图说明'});
 assert.notEqual(result.status,'correct');
 assert.ok(['manual','partial'].includes(result.status));
 assert.equal(result.parts.reason.status,'manual');
});
