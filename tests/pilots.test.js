import test from 'node:test';
import assert from 'node:assert/strict';
import {pilotCandidates} from '../src/templates/pilots.js';

const topics=['cnm_p020','cnm_p018','cnm_p047','cnm_p060','cnm_p224','cnm_p089'];
const topic=id=>({id,name:id,grade:id==='cnm_p020'||id==='cnm_p018'?1:id==='cnm_p047'||id==='cnm_p060'?2:3});
const rng=()=>0.314159;

test('nonpilot topics return null; pilot unsupported dimensions return empty',()=>{
 assert.equal(pilotCandidates(topic('cnm_p001'),'basic',1,rng),null);
 assert.deepEqual(pilotCandidates(topic('cnm_p020'),'pattern',1,rng),[]);
});

test('each pilot has deterministic real task families and student-visible diagram',()=>{
 for(const id of topics){
  const families=new Set();let diagrams=0;
  for(let level=1;level<=3;level++)for(const d of ['basic','fill','reverse','reasoning','application','equivalence','pattern']){
   const qs=pilotCandidates(topic(id),d,level,rng);if(qs===null)continue;
   for(const q of qs){
    assert.equal(q.schemaVersion,2);assert.ok(q.prompt&&q.answer!==undefined&&q.explanation);
    assert.ok(q.student.tasks.length&&q.student.blocks.length);
    families.add(q.familyId);if(q.student.blocks.some(b=>b.type==='diagram'))diagrams++;
    assert.ok(!q.prompt.includes('他说错了'),q.prompt);
   }
  }
  assert.ok(families.size>=3,`${id} families=${families.size}`);
  assert.ok(diagrams>0,`${id} missing diagram`);
 }
});

test('9-plus candidates vary the unknown and retain tenframe facts only',()=>{
 const qs=pilotCandidates(topic('cnm_p020'),'fill',1,rng);
 assert.ok(new Set(qs.map(q=>q.answer)).size>=3);
 assert.ok(qs.some(q=>q.student.blocks.some(b=>b.type==='diagram'&&b.kind==='tenframe')));
});

test('judgment tasks omit verdict from prompt and retain numeric primary answer',()=>{
 for(const id of ['cnm_p047','cnm_p089']){
  const q=pilotCandidates(topic(id),id==='cnm_p047'?'reasoning':'reasoning',2,rng).find(x=>x.answerSpec.kind==='multipart');
  assert.ok(q);assert.equal(q.answerSpec.parts[0].id,'judgment');assert.equal(q.answer,q.answerSpec.parts[1].spec.value);
  assert.doesNotMatch(q.prompt,/对。|错。|他说错了/);
 }
});
