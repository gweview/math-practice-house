import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const catalog = Object.fromEntries(await Promise.all(['topics','questions','dependencies'].map(async k => [k, JSON.parse(await readFile(new URL(`../data/${k}.json`, import.meta.url)))])));
const engine = await import('../src/engine.js').catch(() => ({}));
const options = (overrides={}) => ({grade:1,semester:'all',topicId:'all',dimensions:['basic'],level:1,count:6,seed:'test',...overrides});
test('invalid options and malformed catalogs are rejected, not silently coerced', () => {
 for (const bad of [{grade:0},{grade:'1'},{semester:'春'},{topicId:'missing'},{topicId:'cnm_p060'}, {dimensions:[]},{dimensions:['unknown']},{dimensions:'basic'},{level:4},{count:7},{seed:12}]) {
  assert.throws(()=>engine.generateWorksheet(catalog,options(bad)),/选项|知识点/);
 }
 assert.throws(()=>engine.generateWorksheet({},options()),/数据/);
 const result=engine.generateWorksheet(catalog,options({semester:'下',topicId:'cnm_p006'}));
 assert.equal(result.questions.length,0);assert.ok(result.warnings.length);
});

test('topic-compatible arithmetic fill questions are reproducible, bounded and independently correct', () => {
 assert.deepEqual(engine.getCapabilities(catalog.topics.find(t=>t.id==='cnm_p014')),['basic']);
 const ids=['cnm_p006','cnm_p007','cnm_p010','cnm_p011','cnm_p018','cnm_p020','cnm_p021','cnm_p025','cnm_p026','cnm_p027','cnm_p030','cnm_p031','cnm_p032','cnm_p033','cnm_p034','cnm_p039','cnm_p042','cnm_p044','cnm_p046','cnm_p064','cnm_p065','cnm_p071','cnm_p072','cnm_p074','cnm_p083'];
 for(const id of ids) for(let seed=0;seed<8;seed++) {
  const topic=catalog.topics.find(t=>t.id===id);
  assert.ok(engine.getCapabilities(topic).includes('fill'));
  const o=options({grade:topic.grade,topicId:id,dimensions:['fill'],count:18,seed:String(seed)});
  const result=engine.generateWorksheet(catalog,o);
  assert.ok(result.questions.length>0&&result.questions.length<=18,id);assert.deepEqual(result,engine.generateWorksheet(catalog,o));
  if(result.questions.length<18)assert.ok(result.warnings.length);
  assert.equal(new Set(result.questions.map(q=>q.fingerprint)).size,result.questions.length);
  for(const q of result.questions) {
   const m=q.prompt.match(/^(\d+) ([＋－×÷]) □ ＝ (\d+)$/);assert.ok(m,q.prompt);
   const a=Number(m[1]),b=Number(q.answer),r=Number(m[3]);
   const actual=m[2]==='＋'?a+b:m[2]==='－'?a-b:m[2]==='×'?a*b:a/b;
   assert.equal(actual,r);assert.ok(Number.isInteger(b)&&b>=0);assert.equal(q.source,'original');
   if(topic.grade===1){assert.ok(!/[×÷]/.test(q.prompt));assert.ok(a<=100&&b<=100&&r<=100);}
   if(id==='cnm_p006')assert.ok(r<=5);
   if(id==='cnm_p018')assert.ok(a%10+b%10<10&&r<=20);
   if(id==='cnm_p020')assert.equal(a,9);
   if(id==='cnm_p025')assert.equal(b,9);
   if(id==='cnm_p030')assert.ok(a%10===0&&b%10===0);
   if(id==='cnm_p039')assert.ok(a<=6&&b<=6);
   if(id==='cnm_p042')assert.ok(a>=7&&a<=9&&b<=9);
  }
 }
});

test('arithmetic reverse, reasoning and application use valid original problems at supported levels', () => {
 for(const id of ['cnm_p010','cnm_p032','cnm_p039','cnm_p083']) for(const level of [1,2]) for(const dimension of ['fill','reverse','reasoning','application']) {
  const t=catalog.topics.find(t=>t.id===id);
  assert.ok(engine.getCapabilities(t).includes(dimension));
  const r=engine.generateWorksheet(catalog,options({grade:t.grade,topicId:id,dimensions:[dimension],level,count:12}));
  assert.equal(r.questions.length,12);
  for(const q of r.questions){
   const {a,b,result,op,offset}=q.visual;
   const expected=op==='＋'?a+b:op==='－'?a-b:op==='×'?a*b:a/b;
   assert.equal(result,expected);
   if(dimension==='fill'||dimension==='reverse')assert.equal(Number(q.answer),level===2&&dimension==='fill'?a:dimension==='reverse'?a:b);
   else assert.equal(Number(q.answer),dimension==='reasoning'||dimension==='application'&&level===2?expected-offset:expected);
   if(dimension==='application'&&level===2)assert.match(q.prompt,/再拿走/);
   assert.ok(q.hint&&q.explanation&&q.prompt);assert.equal(q.level,level);
  }
 }
 const q=engine.generateWorksheet(catalog,options({topicId:'cnm_p010',dimensions:['reverse'],level:3}));
 assert.equal(q.questions.length,0);assert.ok(q.warnings.length);
});

test('grade-three equivalence has unique solutions, including two-relation challenge substitution', () => {
 const t=catalog.topics.find(t=>t.id==='cnm_p224'); assert.ok(engine.getCapabilities(t).includes('equivalence'));
 for(const level of [1,2,3])for(let seed=0;seed<12;seed++) {
  const r=engine.generateWorksheet(catalog,options({grade:3,topicId:t.id,dimensions:['equivalence'],level,count:18,seed:String(seed)}));
  assert.equal(r.questions.length,18);
  for(const q of r.questions){
   const {ratio,blue,green,secondRatio,total}=q.visual;
   const solutions=[];
   for(let red=1;red<=1000;red++)for(let b=1;b<=100;b++) if(red===ratio*b&&(level===1?b===blue:level===2?b===secondRatio*green:red+b===total))solutions.push(red);
   assert.deepEqual(solutions,[Number(q.answer)]);
   assert.match(q.prompt,/红珠/);assert.ok(q.explanation.includes(q.answer));
  }
 }
});
test('grade-two patterns state their rule explicitly and produce independently calculated next terms', () => {
 const t=catalog.topics.find(t=>t.id==='cnm_p060'); assert.ok(engine.getCapabilities(t).includes('pattern'));
 for(const level of [1,2,3])for(let seed=0;seed<20;seed++) {
  const r=engine.generateWorksheet(catalog,options({grade:2,topicId:t.id,dimensions:['pattern'],level,count:18,seed:String(seed)}));
  assert.equal(r.questions.length,18);
  for(const q of r.questions){
   const {start,step,secondStep,terms}=q.visual;
   let n=start;const expected=[n];
   for(let i=0;i<4;i++){n+=level===1?step:level===2?(i%2===0?step:secondStep):step*(i+1);expected.push(n);}
   assert.deepEqual(terms,expected.slice(0,4));assert.equal(Number(q.answer),expected[4]);
   assert.match(q.prompt,/规则：/);assert.ok(q.prompt.includes(String(step)));assert.ok(n<=1000);
  }
 }
});

test('area and elapsed-time reverse/reasoning questions obey their physical constraints', () => {
 for(const [id,grade] of [['cnm_p089',3],['cnm_p063',2]])for(const dimension of ['reverse','reasoning'])for(const level of [1,2]) {
  assert.ok(engine.getCapabilities(catalog.topics.find(t=>t.id===id)).includes(dimension));
  const r=engine.generateWorksheet(catalog,options({grade,topicId:id,dimensions:[dimension],level,count:18}));assert.equal(r.questions.length,18);
  for(const q of r.questions){
   if(id==='cnm_p089'){
    const {length,width,strip}=q.visual;
    assert.ok(length>width+1&&width>0);
    assert.equal(Number(q.answer),dimension==='reverse'?length:(length-1)*(width+1)-length*width);
    assert.match(q.prompt,/厘米/);assert.ok(length-strip>0);
   } else {
    const {startMinute,duration,endHour,endMinute}=q.visual;
    assert.equal(endHour*60+endMinute,9*60+startMinute+duration);
    assert.equal(Number(q.answer),dimension==='reverse'?startMinute:duration);assert.match(q.prompt,/时/);
   }
  }
 }
});

for(const level of [1,2])test(`elapsed-time reasoning level ${level} judges minute subtraction correctly`, () => {
 const r=engine.generateWorksheet(catalog,options({grade:2,topicId:'cnm_p063',dimensions:['reasoning'],level,seed:'review'}));
 assert.equal(r.questions.length,6);
 assert.ok(r.questions[0].prompt.startsWith(level===1?'活动从9时 7 分开始，到 9 时 42 分结束。':'活动从9时 27 分开始，到 10 时 12 分结束。'));
 assert.equal(r.questions[0].answer,level===1?'35':'45');
 for(const q of r.questions) {
  const m=q.prompt.match(/^活动从9时 (\d+) 分开始，到 (\d+) 时 (\d+) 分结束。小林把分钟数直接相减，认为用了 (-?\d+) 分钟。/);
  assert.ok(m,q.prompt);
  const [,start,hour,end,claimed]=m.map(Number);
  const elapsed=hour*60+end-(9*60+start);
  assert.equal(Number(q.answer),elapsed);
  assert.equal(Number(claimed),end-start);
  assert.equal(hour,level===1?9:10);
  if(level===1) {
   assert.equal(Number(claimed),elapsed);
   assert.match(q.prompt,/这种算法对吗？请验证，并写出实际用了多少分钟/);
   assert.doesNotMatch(q.prompt,/不可靠|错误|不正确/);
   assert.match(q.explanation,/同一小时内/);
  } else {
   assert.notEqual(Number(claimed),elapsed);
   assert.match(q.prompt,/这种算法不可靠，实际用了多少分钟/);
   assert.match(q.explanation,/先从9时 .*到10时/);
  }
 }
});

test('answer normalization accepts fullwidth decimals, fractions, choice keys/text and whitespace, never empty as zero', () => {
 const cases=[['0','',false],['0','   ',false],['0',null,false],['0',false,false],['0',0,true],['0','０',true],['12',' １ ２ ',true],['0.5','１ ／ ２',true],['2/4','0.500',true],['-0.5','−１⁄２',true],['1/3','2/6',true],['1/3','0.3333333333',false],['2','1+1',false],['0','0/0',false],['0','1/0',false],['0','Infinity',false],['0','NaN',false]];
 for(const [answer,input,expected] of cases)assert.equal(engine.checkAnswer({answer},input),expected,`${answer} versus ${input}`);
 const q={answer:'B',choices:[{key:'A',text:'一共有5个'},{key:'B',text:'第1个'}]};
 for(const input of ['Ｂ',' b ','第 1 个','（Ｂ）'])assert.equal(engine.checkAnswer(q,input),true);
 for(const input of ['A','一共有5个','',{}])assert.equal(engine.checkAnswer(q,input),false);
 assert.equal(engine.checkAnswer({answer:'A',choices:[{key:'A',text:'1/2'},{key:'B',text:'2'}]},'０．５'),true);
});

test('loadCatalog fetches all three module-relative JSON files and rejects failed responses', async t => {
 const urls=[];
 t.mock.method(globalThis,'fetch',async url=>{
  urls.push(String(url));const name=new URL(url).pathname.split('/').pop().replace('.json','');
  return {ok:true,json:async()=>structuredClone(catalog[name])};
 });
 assert.deepEqual(await engine.loadCatalog(),catalog);
 assert.deepEqual(urls.map(u=>u.split('/').pop()).sort(),['dependencies.json','questions.json','topics.json']);
 assert.ok(urls.every(u=>u.includes('/data/')));
 globalThis.fetch=async()=>({ok:false,status:503});
 await assert.rejects(()=>engine.loadCatalog(),/503/);
 globalThis.fetch=async()=>({ok:true,json:async()=>({})});
 await assert.rejects(()=>engine.loadCatalog(),/数据/);
});

test('fill-in equations have exactly one nonnegative integer solution, including zero edge cases', () => {
 for(const id of ['cnm_p006','cnm_p007','cnm_p039','cnm_p046'])for(let seed=0;seed<20;seed++) {
  const topic=catalog.topics.find(t=>t.id===id);
  const r=engine.generateWorksheet(catalog,options({grade:topic.grade,topicId:id,dimensions:['fill'],seed:String(seed),count:18}));
  for(const q of r.questions){
   const m=q.prompt.match(/^(\d+) ([＋－×÷]) □ ＝ (\d+)$/), a=Number(m[1]),target=Number(m[3]),solutions=[];
   for(let b=0;b<=100;b++)if((m[2]==='＋'?a+b:m[2]==='－'?a-b:m[2]==='×'?a*b:b===0?NaN:a/b)===target)solutions.push(b);
   assert.deepEqual(solutions,[Number(q.answer)],q.prompt);
  }
 }
});

test('operand profiles respect oral/written arithmetic and multiplication-table curriculum limits', () => {
 const ids=['cnm_p018','cnm_p031','cnm_p032','cnm_p033','cnm_p034','cnm_p039','cnm_p046','cnm_p044','cnm_p071','cnm_p072','cnm_p074','cnm_p083'];
 for(const id of ids) for(let seed=0;seed<12;seed++) {
  const t=catalog.topics.find(t=>t.id===id);
  const r=engine.generateWorksheet(catalog,options({grade:t.grade,topicId:id,dimensions:['fill'],count:18,seed:String(seed)}));
  assert.ok(r.questions.length);
  for(const q of r.questions){const {a,b,result}=q.visual;
   if(id==='cnm_p018')assert.ok(a>=11&&a<=19&&b<=9);
   if(['cnm_p031','cnm_p032'].includes(id))assert.ok(a>=10&&a<=99&&(b<=9||b%10===0));
   if(['cnm_p033','cnm_p034'].includes(id))assert.ok(a>=10&&a<=99&&b>=10&&b<=99);
   if(id==='cnm_p046')assert.ok(b<=6&&result<=6);
   if(id==='cnm_p044')assert.ok(b>=7&&b<=9&&result<=9);
   if(['cnm_p071','cnm_p072'].includes(id))assert.ok(a>=100&&b>=100&&a<=999&&b<=999);
   if(['cnm_p074','cnm_p083'].includes(id))assert.ok(a>=10&&a<=999&&b>=1&&b<=9);
  }
 }
});

test('mixed dimensions are represented fairly and missing dimensions are warned even when count is full', () => {
 const r=engine.generateWorksheet(catalog,options({topicId:'cnm_p010',dimensions:['basic','fill','reverse','reasoning','application'],count:6}));
 assert.equal(r.questions.length,6);
 assert.deepEqual(new Set(r.questions.map(q=>q.dimension)),new Set(['basic','fill','reverse','reasoning','application']));
 const missing=engine.generateWorksheet(catalog,options({dimensions:['basic','equivalence'],count:6}));
 assert.equal(missing.questions.length,6);assert.ok(missing.warnings.some(w=>w.includes('等量代换')));
 for(const count of [6,12,18])for(const grade of [1,2,3]) {
  const snapshot=JSON.stringify(catalog);
  const o=options({grade,count,semester:'下',dimensions:['fill','reverse','reasoning']});
  const result=engine.generateWorksheet(catalog,o);assert.equal(result.questions.length,count);
  assert.equal(new Set(result.questions.map(q=>q.fingerprint)).size,count);
  assert.equal(JSON.stringify(catalog),snapshot);
  assert.ok(result.questions.every(q=>q.grade===grade&&catalog.topics.find(t=>t.id===q.topicId).semester==='下'));
  if(grade===1)for(const q of result.questions)assert.ok(!/[×÷乘除]/.test(q.prompt));
 }
});

test('large tens arithmetic domains reliably fill 18 questions instead of random-rejection shortage', () => {
 for(const id of ['cnm_p064','cnm_p065'])for(let seed=0;seed<30;seed++) {
  const r=engine.generateWorksheet(catalog,options({grade:2,topicId:id,dimensions:['fill'],count:18,seed:String(seed)}));
  assert.equal(r.questions.length,18,`${id}:${seed}`);assert.deepEqual(r.warnings,[]);
 }
});

test('catalog validation rejects dangling dependencies and unusable source question records', () => {
 for(const corrupt of [
  c=>c.dependencies.push({topicId:c.topics[0].id,prerequisiteId:'missing'}),
  c=>c.topics.push({...c.topics[0]}),
  c=>c.questions[0].answer='',
  c=>c.questions[0].explanation=undefined,
  c=>c.questions[0].id=undefined,
  c=>c.questions[0].difficulty='challenge',
  c=>{const q=c.questions.find(q=>q.choices);q.answer='Z';},
  c=>{const q=c.questions.find(q=>q.choices);q.choices[1].key=q.choices[0].key;},
 ]){const bad=structuredClone(catalog);corrupt(bad);assert.throws(()=>engine.generateWorksheet(bad,options()),/数据/);}
});

test('nonfinite and malformed fraction answers cannot self-match', () => {
 for(const answer of ['NaN','Infinity','-Infinity','0/0','1/0'])assert.equal(engine.checkAnswer({answer},answer),false);
 assert.equal(engine.checkAnswer({answer:'1/2'},'½'),true);
 assert.equal(engine.checkAnswer({answer:'3，2'},'３, ２'),true);
});

test('public metadata describes seven thinking dimensions and three levels', () => {
 assert.deepEqual(engine.DIMENSIONS?.map(x=>x.id), ['basic','fill','equivalence','pattern','reverse','reasoning','application']);
 assert.ok(engine.DIMENSIONS.every(x=>x.label && x.description));
 assert.deepEqual(engine.LEVELS, [{id:1,label:'起步'},{id:2,label:'进阶'},{id:3,label:'挑战'}]);
});

test('source-only slice covers every topic without relabeling difficulty or padding shortage', () => {
 for (const topic of catalog.topics) for (const level of [1,2,3]) {
  const result=engine.generateWorksheet(catalog,options({grade:topic.grade,topicId:topic.id,semester:topic.semester,level}));
  assert.equal(result.seed,'test');assert.equal(result.requestedCount,6);
  assert.equal(result.questions.length,level===3?0:2);
  assert.ok(result.warnings.length);
  for (const q of result.questions) {
   assert.equal(q.topicId,topic.id); assert.equal(q.grade,topic.grade); assert.equal(q.level,level);
   assert.equal(q.source,'taxonomy'); assert.equal(q.dimension,'basic');
   for(const k of ['id','topicName','prompt','answer','explanation','hint','fingerprint']) assert.equal(typeof q[k],'string');
  }
 }
 const a=engine.generateWorksheet(catalog,options());
 assert.equal(a.questions.length,6);assert.equal(new Set(a.questions.map(q=>q.fingerprint)).size,6);
 assert.deepEqual(a,engine.generateWorksheet(catalog,options()));
});
