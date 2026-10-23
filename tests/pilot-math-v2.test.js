import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {pilotCandidates} from '../src/templates/pilots.js';import {assessAnswer} from '../src/question-model.js';
const topics=JSON.parse(readFileSync(new URL('../data/topics.json',import.meta.url)));
const pool=(id,d,l)=>pilotCandidates(topics.find(t=>t.id===id),d,l,()=>0.37);
test('every pilot student projection actually contains the question, not just a generic diagram caption',()=>{
 for(const id of ['cnm_p020','cnm_p018','cnm_p047','cnm_p060','cnm_p224','cnm_p089'])for(const d of ['basic','fill','reverse','reasoning','application','pattern','equivalence'])for(const level of [1,2,3])for(const q of pool(id,d,level)||[]){
  assert.ok(q.student.blocks.some(b=>b.type==='text'&&b.text===q.prompt),`${id}/${d}/${level}: pupil cannot see the actual task`);
 }
});
test('chained equal-weight substitution multiplies BOTH ratios from the actual wording',()=>{
 for(const q of pool('cnm_p224','equivalence',2)){
  const ratio=Number(q.prompt.match(/红珠与\s*(\d+)\s*袋蓝珠/)[1]);
  const second=Number(q.prompt.match(/蓝珠与\s*(\d+)\s*袋绿珠/)[1]);
  const unit=Number(q.prompt.match(/绿珠重\s*(\d+)\s*克/)[1]);
  assert.equal(Number(q.answer),ratio*second*unit,q.prompt);
 }
});
test('single-part pilot assessment agrees with its independently presented primary answer',()=>{
 for(const id of ['cnm_p020','cnm_p018','cnm_p047','cnm_p060','cnm_p224','cnm_p089'])for(const d of ['basic','fill','reverse','application','pattern','equivalence'])for(const level of [1,2,3])for(const q of pool(id,d,level)||[])if(q.answerSpec.kind!=='multipart')assert.equal(assessAnswer(q,q.answer).status,'correct',q.prompt);
});
test('pilot judgment pools include both true and false cases without preannouncing a verdict',()=>{
 for(const id of ['cnm_p020','cnm_p018','cnm_p047','cnm_p060','cnm_p224','cnm_p089']){
  const qs=pool(id,'reasoning',2);assert.ok(qs.length);
  const verdicts=new Set(qs.map(q=>q.answerSpec.parts.find(p=>p.id==='judgment')?.spec.value));
  assert.ok(verdicts.has('yes')&&verdicts.has('no'),`${id}: constant judgment shortcut`);
  assert.ok(qs.every(q=>!q.prompt.includes('他说错了')&&!q.prompt.includes('说错了。')));
 }
});
test('basic multiplication verification is objectively checkable without a compulsory essay',()=>{
 const q=pool('cnm_p047','basic',1)[0];
 assert.ok(q.student.tasks.every(t=>t.kind!=='manual'));
 const response=Object.fromEntries(q.answerSpec.parts.map(p=>[p.id,p.spec.value]));
 assert.equal(assessAnswer(q,response).status,'correct');
});
