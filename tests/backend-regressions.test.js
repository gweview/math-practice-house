import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as engine from '../src/engine.js';
import {planWorksheet,summarizeAvailability} from '../src/planner.js';
import {createQuestion,questionDedupKey} from '../src/question-model.js';
const catalog=Object.fromEntries(['topics','questions','dependencies'].map(k=>[k,JSON.parse(readFileSync(new URL(`../data/${k}.json`,import.meta.url),'utf8'))]));
const options=(extra={})=>({grade:1,semester:'all',topicId:'cnm_p030',dimensions:['fill','reverse','reasoning','application'],level:1,count:18,seed:'audit-0',...extra});

// Parse the student wording, not visual/solution metadata: recompute the entire chain.
function solveTens(q){
 const ns=[...q.prompt.matchAll(/\d+/g)].map(m=>Number(m[0]));
 assert.ok(ns.every(n=>n%10===0),`${q.topicId}/${q.dimension}/L${q.level}: ${q.prompt}`);
 if(q.source!=='original')return;
 let actual,intermediate;
 if(q.dimension==='fill'){
  const expr=q.prompt.split('＝')[0].replace('□',q.answer).trim(),parts=expr.match(/^(\d+) ([＋－]) (\d+)(?: ([＋－]) (\d+))?$/);
  assert.ok(parts,q.prompt);const [,a,op,b,op2,c]=parts;
  intermediate=op==='＋'?+a + +b:+a - +b;actual=op2?(op2==='＋'?intermediate + +c:intermediate - +c):intermediate;
  assert.equal(actual,ns.at(-1),q.prompt);
 }else if(q.dimension==='reverse'){
  const m=q.prompt.match(/把它(加上|减去) (\d+)(?:后)?，(.*)/);assert.ok(m,q.prompt);
  intermediate=m[1]==='加上'?+q.answer + +m[2]:+q.answer - +m[2];actual=intermediate;
  for(const step of m[3].matchAll(/再(减去|加上) (\d+)/g)){
   actual+=step[1]==='加上'?+step[2]:-step[2];assert.ok(actual>=0&&actual<= (q.grade===1?100:990),q.prompt);assert.equal(actual%10,0,q.prompt);
  }
  assert.equal(actual,ns.at(-1),q.prompt);
 }else if(q.dimension==='reasoning'){
  const m=q.prompt.match(/(\d+) ([＋－]) (\d+)/);assert.ok(m,q.prompt);
  intermediate=m[2]==='＋'?+m[1] + +m[3]:+m[1] - +m[3];
  const chain=q.prompt.match(/再(加|减) (\d+)/);
  actual=chain?intermediate+(chain[1]==='加'?+chain[2]:-chain[2]):intermediate - ns[2];
  assert.equal(actual,+q.answer,q.prompt);
  assert.equal(q.answerSpec.parts.find(p=>p.id==='judgment').spec.value,actual===ns.at(-1)?'yes':'no',q.prompt);
 }else {
  const [a,b,c]=ns;intermediate=q.prompt.startsWith('盒里')?a+b:a-b;
  actual=c===undefined?intermediate:intermediate+(q.prompt.includes('后来又放入')?c:-c);
  assert.equal(actual,+q.answer,q.prompt);
 }
 for(const n of [intermediate,actual]){assert.equal(n%10,0,q.prompt);assert.ok(n>=0&&n<=(q.grade===1?100:990),q.prompt);}
}

test('review blocker 1: all tens dimensions/levels retain tens through every actual operation',t=>{
 let instances=0;
 for(const topicId of ['cnm_p030','cnm_p064','cnm_p065'])for(const level of [1,2,3])for(const seed of ['audit-0','audit-2','backend-tens']){
  const qs=engine.generateCandidates(catalog,options({topicId,grade:topicId==='cnm_p030'?1:2,level,seed})).questions;
  for(const dimension of ['fill','reverse','reasoning','application']){
   const subset=qs.filter(q=>q.dimension===dimension);assert.ok(subset.length,`${topicId}/${dimension}/L${level} empty`);
   for(const q of subset){solveTens(q);instances++;}
   assert.ok(subset.some(q=>+q.answer>0),'not an all-zero answer escape');
   assert.ok(new Set(subset.map(q=>q.answer)).size>1,'retain numerical variety');
  }
 }
 t.diagnostic(`Independently parsed ${instances} actual prompts: 3 tens profiles × 3 levels × 4 generated dimensions × 3 seeds.`);
});


test('review blocker 1: tens source basic tiers also stay in the declared arithmetic profile',()=>{
 for(const topicId of ['cnm_p030','cnm_p064','cnm_p065'])for(const level of [1,2]){
  const qs=engine.generateCandidates(catalog,options({topicId,grade:topicId==='cnm_p030'?1:2,level,dimensions:['basic']})).questions;
  assert.ok(qs.length);
  for(const q of qs){
   const m=q.prompt.match(/计算：(\d+)([＋－])(\d+)＝/);assert.ok(m,q.prompt);
   const a=+m[1],b=+m[3],r=m[2]==='＋'?a+b:a-b;
   assert.ok([a,b,r].every(n=>n%10===0),q.prompt);assert.equal(r,+q.answer,q.prompt);
  }
 }
});

test('review blocker 2: narrow scalar-task dedup preserves decomposition, judgment, choices and unknowns',async()=>{
 const topic=catalog.topics.find(t=>t.id==='cnm_p020');
 const make=(familyId,prompt,extra={})=>createQuestion(topic,'basic',1,{familyId,prompt,answer:14,...extra});
 const pool=[
  make('direct','9 ＋ 5 ＝ □。可以用十框图先凑十。'),
  make('source-copy','计算：９＋５＝？'),
  make('decomposition','9＋5：填出补数、剩余数、得数。',{tasks:[{id:'left',kind:'number'},{id:'answer',kind:'number'}],answerSpec:{kind:'multipart',parts:[{id:'left',spec:{kind:'scalar',value:'4'}},{id:'answer',spec:{kind:'scalar',value:'14'}}]}}),
  make('judgment','9＋5＝□。说明理由。',{tasks:[{id:'answer',kind:'number'},{id:'reason',kind:'manual'}],answerSpec:{kind:'multipart',parts:[{id:'answer',spec:{kind:'scalar',value:'14'}},{id:'reason',spec:{kind:'rubric',manual:true}}]}}),
  make('choice','计算：9＋5＝？',{choices:[{key:'A',text:'14'},{key:'B',text:'13'}],answer:'A',answerSpec:{kind:'choice',value:'A'}}),
  make('unknown','9＋□＝14',{answer:5}),
 ];
 const deps={generateCandidates:()=>({questions:pool,warnings:[]})};
 const o=options({topicId:topic.id,dimensions:['basic'],count:6,mode:'custom'});
 const availability=await summarizeAvailability(catalog,o,deps),plan=await planWorksheet(catalog,o,deps);
 assert.equal(availability.availableCount,5,'same scalar arithmetic has one identity');
 assert.equal(plan.questions.length,5);
 for(const family of ['decomposition','judgment','choice','unknown'])assert.ok(plan.questions.some(q=>q.familyId===family),family);
});

test('review blocker 2: actual audit-0 daily plan never repeats final-only 9+5 across source/pilot',async()=>{
 const o=options({topicId:'cnm_p020',dimensions:['basic','fill','reverse','reasoning','application'],level:3,mode:'daily'});
 const plan=await planWorksheet(catalog,o);
 const copies=plan.questions.filter(q=>q.answerSpec.kind==='scalar'&&(/^9[＋+]5[＝=][□?？]/u.test(q.prompt.normalize('NFKC').replace(/\s+/g,'').replace(/^计算[:：]/,''))||q.prompt==='盘子里有9颗葡萄，又放入5颗。现在一共有多少颗？'));
 assert.ok(copies.length<=1,copies.map(q=>`${q.id}: ${q.prompt}`).join('\n'));
 assert.deepEqual(plan,await planWorksheet(catalog,o),'seed replay remains deterministic');
});

test('review blocker 3: pure multiplication sources are excluded from verification pools, never rewritten',async()=>{
 const before=readFileSync(new URL('../data/questions.json',import.meta.url),'utf8');
 const excluded=['cnm_p047_q1','cnm_p047_q2','cnm_p047_q4'];
 const ledger=JSON.parse(readFileSync(new URL('../data/source-corrections.json',import.meta.url),'utf8'));
 for(const id of excluded){
  assert.ok(catalog.questions.some(q=>q.id===id&&q.prompt.startsWith('计算：')));
  assert.ok(ledger.corrections.some(c=>c.id===id&&c.action==='exclude'&&/verification|验算/.test(c.reason)),id);
 }
 for(const level of [1,2,3]){
  const o=options({grade:2,topicId:'cnm_p047',dimensions:['basic'],level});
  for(const qs of [engine.generateCandidates(catalog,o).questions,(await planWorksheet(catalog,{...o,mode:'daily'})).questions]){
   assert.ok(qs.length);assert.ok(qs.every(q=>!excluded.includes(q.id)));
   for(const q of qs.filter(q=>q.source==='original'))assert.match(q.prompt,/验算/);
  }
 }
 assert.equal(readFileSync(new URL('../data/questions.json',import.meta.url),'utf8'),before);
});

test('review blocker 4: area L2 is an honest independent formula task without phantom cells',()=>{
 for(const dimension of ['basic','application']){
  const qs=engine.generateCandidates(catalog,options({grade:3,topicId:'cnm_p089',dimensions:[dimension],level:2})).questions.filter(q=>q.source==='original');
  assert.ok(qs.length);
  for(const q of qs){
   assert.doesNotMatch(q.prompt,/每格|数格/);assert.doesNotMatch(q.explanation,/每行|格|行/);
   assert.equal(q.familyId,'area-independent-formula');
   assert.equal(q.student.blocks.find(b=>b.type==='diagram').data.showGrid,false);
   const m=q.prompt.match(/长(\d+)厘米、宽(\d+)厘米/);assert.ok(m,q.prompt);
   assert.equal(+q.answer,+m[1]*+m[2]);assert.match(q.explanation,/长方形面积＝长×宽/);
  }
 }
});

test('optional review: legacy quotient/remainder tuple strings assess like typed objects',()=>{
 const q=catalog.questions.find(q=>q.id==='cnm_p051_q1'),before=JSON.stringify(q);
 assert.equal(engine.checkAnswer(q,'３，２'),true);
 assert.equal(engine.assessAnswer(q,'３，２').status,'correct');
 assert.equal(engine.assessAnswer(q,{quotient:'3',remainder:'2'}).status,'correct');
 assert.notEqual(engine.assessAnswer(q,'3,1').status,'correct');
 assert.equal(engine.assessAnswer(q,'').status,'unanswered');assert.equal(JSON.stringify(q),before);
});

test('optional review: direct-sum pilot basic L3 metadata admits one operation',()=>{
 for(const topicId of ['cnm_p020','cnm_p018']){
  const qs=engine.generateCandidates(catalog,options({topicId,dimensions:['basic'],level:3})).questions;
  assert.ok(qs.length);for(const q of qs)assert.equal(q.difficultyDescriptor.steps,1,q.prompt);
 }
});
