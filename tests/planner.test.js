import test from 'node:test';
import assert from 'node:assert/strict';
import {planWorksheet, summarizeAvailability} from '../src/planner.js';

const fixture = () => ({topics:[
 {id:'tA',name:'Addition',grade:1,semester:'上'},
 {id:'tB',name:'Patterns',grade:1,semester:'上'},
 {id:'other',name:'Other',grade:1,semester:'下'}
], questions:[], dependencies:[{topicId:'tA',prerequisiteId:'other'}]});
const mk = (topicId,dimension,level,n,family='family-'+dimension) => Array.from({length:n},(_,i)=>({
 id:`${topicId}/${dimension}/${level}/${i}`,topicId,topicName:topicId,grade:1,dimension,level,
 prompt:`${topicId} ${dimension} task ${i}`,answer:String(i%5),fingerprint:`${topicId}/${dimension}/${level}/${i}`,
 familyId:family,templateId:`template-${family}`,source:'test'
}));
const deps = {
 generateCandidates(_catalog,{topicId,dimensions,level}) { return {questions:(topicId==='tA'?dimensions.flatMap(d=>mk('tA',d,level,8,d==='basic'?'direct':'family-'+d)):[]),warnings:[]}; },
 getAvailability(_catalog,{topicId,dimensions,level}) { const ds=dimensions.map(id=>({id,level,availableCount:topicId==='tA'?8:0,templateCount:topicId==='tA'?2:0})); return {availableCount:ds.reduce((a,x)=>a+x.availableCount,0),templateCount:Math.max(0,...ds.map(x=>x.templateCount)),dimensions:ds,warnings:[]}; }
};
const opts=(x={})=>({grade:1,semester:'上',topicId:'tA',dimensions:['basic','fill'],level:2,count:6,seed:'fixed',mode:'custom',...x});

test('availability unions unique questions and families across levels and dimensions',async()=>{ const c=fixture(); const d={...deps,getAvailability(_c,{level,dimensions}){return {dimensions:dimensions.map(id=>({id,level,availableCount:2,templateCount:1})),warnings:[]}},generateCandidates(_c,{level,dimensions}){return {questions:dimensions.flatMap(id=>mk('tA',id,level,2,'same')),warnings:[]}}}; const r=await summarizeAvailability(c,opts({mode:'daily',level:2}),d); assert.equal(r.availableCount,4); assert.equal(r.templateCount,1); });

test('daily blueprint has explicit progression quotas and actual sections match returned questions',async()=>{ const r=await planWorksheet(fixture(),opts({mode:'daily',count:12,level:3}),deps); assert.deepEqual(r.sections.map(s=>s.questionIds.length),[4,4,2,2]); assert.deepEqual(r.sections.flatMap(s=>s.questionIds),r.questions.map(q=>q.id)); });

test('remediation caps originals, warns, and does not pad unless related practice is opted in',async()=>{ const wrong=Array.from({length:8},(_,i)=>({id:`w${i}`,answer:String(i)})); const r=await planWorksheet(fixture(),opts({mode:'remediation',wrongQuestions:wrong,count:6}),deps); assert.equal(r.questions.length,6); assert.deepEqual(r.questions,wrong.slice(0,6)); assert.ok(r.warnings.some(x=>/remaining|未纳入/.test(x))); });

test('custom plan preserves exact topic, dimensions and level and returns complete ordered section IDs',async()=>{
 const r=await planWorksheet(fixture(),opts(),deps);
 assert.equal(r.questions.length,6);assert.ok(r.questions.every(q=>q.topicId==='tA'&&q.level===2&&['basic','fill'].includes(q.dimension)));
 assert.equal(r.sections.flatMap(s=>s.questionIds).length,r.questions.length);
 assert.deepEqual(r.sections.flatMap(s=>s.questionIds),r.questions.map(q=>q.id));
 assert.equal(r.plan.levelPolicy,'exact');assert.equal(r.versions.schema,2);
});

test('daily mode explicitly describes mixed tiers and never exceeds selected level',async()=>{
 const r=await planWorksheet(fixture(),opts({mode:'daily',level:3,count:12}),deps);
 assert.match(r.plan.description,/混合|mixed/i);assert.match(r.plan.levelPolicy,/up to 3/i);
 assert.ok(r.questions.every(q=>q.level<=3));
});

test('seed is reproducible and planner does not mutate catalog or options',async()=>{
 const c=fixture(),o=opts(),before=structuredClone({c,o});
 const a=await planWorksheet(c,o,deps),b=await planWorksheet(c,o,deps);
 assert.deepEqual(a,b);assert.deepEqual({c,o},before);
});

test('availability reports each requested dimension and level without pooling levels',async()=>{
 const r=await summarizeAvailability(fixture(),opts(),deps);
 assert.deepEqual(r.dimensions.map(x=>[x.id,x.level,x.availableCount]),[['basic',2,8],['fill',2,8]]);
 assert.equal(r.availableCount,16);
});

test('scarcity reports deficits instead of padding duplicates or crossing scope',async()=>{
 const r=await planWorksheet(fixture(),opts({topicId:'missing',count:6}),deps);
 assert.equal(r.questions.length,0);assert.ok(r.quality.warnings.some(x=>/deficit|short|不足/i.test(x)));
 assert.equal(r.sections.flatMap(s=>s.questionIds).length,0);
});

test('remediation preserves stored wrong questions byte-for-byte and labels original version',async()=>{
 const wrong={id:'old:1',prompt:'Original prompt',answer:'4',schemaVersion:1,dimension:'basic',level:1};
 const r=await planWorksheet(fixture(),opts({mode:'remediation',wrongQuestions:[wrong],count:6}),deps);
 assert.deepEqual(r.questions[0],wrong);assert.equal(r.questions[0].schemaVersion,1);
 assert.ok(r.quality.warnings.some(x=>/诊断|human|人工/i.test(x)));
});

test('remediation respects per-sheet count without deleting remaining stored questions',async()=>{
 const wrong=[0,1,2,3,4,5,6].map(i=>({id:`legacy-${i}`,answer:String(i),version:i%2?'v1':'v2',schemaVersion:i%2?1:2}));
 const before=structuredClone(wrong);
 const r=await planWorksheet(fixture(),opts({mode:'remediation',wrongQuestions:wrong,count:6}),deps);
 assert.deepEqual(r.questions,wrong.slice(0,6));
 assert.deepEqual(wrong,before,'records outside this sheet must remain unchanged');
 assert.match(r.warnings.join(' '),/1道原错题未纳入/);
 assert.deepEqual(r.sections.flatMap(s=>s.questionIds),wrong.slice(0,6).map(q=>q.id));
});

test('imbalanced candidate pool sizes do not let one topic dominate selected items',async()=>{
 const catalog=fixture();
 const balancedDeps={...deps,generateCandidates(_c,{level,dimensions}){return{questions:[...mk('tA',dimensions[0],level,80,'shared-family'),...mk('tB',dimensions[0],level,8,'shared-family')],warnings:[]};}};
 const r=await planWorksheet(catalog,opts({topicId:'all',dimensions:['basic'],count:12}),balancedDeps);
 const counts=r.questions.reduce((m,q)=>(m[q.topicId]=(m[q.topicId]||0)+1,m),{});
 assert.ok(counts.tB>=4,JSON.stringify(counts));
 assert.equal(new Set(r.questions.map(q=>q.fingerprint)).size,r.questions.length);
});
