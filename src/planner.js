import {questionDedupKey} from './question-model.js';
const VERSION='2.0.0';
const MODES=new Set(['custom','daily','thinking','remediation']);
const DIMENSIONS=new Set(['basic','fill','equivalence','pattern','reverse','reasoning','application']);
function random(seed){let h=2166136261;for(const ch of seed)h=Math.imul(h^ch.charCodeAt(0),16777619);return()=>{h+=0x6D2B79F5;let t=Math.imul(h^(h>>>15),h|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function validate(c,o){
 if(!c||!['topics','questions','dependencies'].every(k=>Array.isArray(c[k])))throw new TypeError('规划需要完整课程目录、题目和依赖图');
 if(!o||![1,2,3].includes(o.grade)||!['all','上','下'].includes(o.semester)||typeof o.topicId!=='string'||!Array.isArray(o.dimensions)||!o.dimensions.length||o.dimensions.some(d=>!DIMENSIONS.has(d))||![1,2,3].includes(o.level)||![6,12,18].includes(o.count)||typeof o.seed!=='string'||!o.seed.trim()||o.seed.length>120||!MODES.has(o.mode||'custom'))throw new TypeError('练习规划选项无效');
}
const levels=o=>o.mode==='daily'||o.mode==='thinking'?Array.from({length:o.level},(_,i)=>i+1):[o.level];
const family=q=>q.familyId||q.templateId||q.dimension||'legacy';
const answer=q=>String(q.answerSpec?.value??q.answer??'');
const semanticKey=questionDedupKey;
function unique(pool){const seen=new Set();return pool.filter(q=>{const k=semanticKey(q);if(seen.has(k))return false;seen.add(k);return true;});}
async function dependencies(given){return given?.generateCandidates?given:{...await import('./engine.js'),...given};}
async function collect(c,o,deps){
 const allowed=new Set(c.topics.filter(t=>t.grade===o.grade&&(o.semester==='all'||t.semester===o.semester)&&(o.topicId==='all'||t.id===o.topicId)).map(t=>t.id));
 if(!allowed.size)return {pool:[],warnings:['所选范围没有可出题知识点。'],perLevel:[]};
 const pool=[],warnings=[],perLevel=[];
 for(const level of levels(o)){
  const result=await deps.generateCandidates(c,{...o,level});
  const qs=(result.questions||[]).filter(q=>allowed.has(q.topicId)&&q.grade===o.grade&&o.dimensions.includes(q.dimension)&&q.level===level);
  pool.push(...qs);perLevel.push({level,questions:qs});warnings.push(...(result.warnings||[]));
 }
 return {pool,warnings:[...new Set(warnings)],perLevel};
}
export async function summarizeAvailability(catalog,options,given){
 validate(catalog,options);const deps=await dependencies(given),o={...options,mode:options.mode||'custom'};
 if(o.mode==='remediation'&&o.addRelated!==true){const qs=unique(o.wrongQuestions||[]);return {availableCount:qs.length,templateCount:new Set(qs.map(family)).size,dimensions:[],warnings:['仅统计本机原错题，不自动补入新题。']};}
 const {pool,perLevel,warnings}=await collect(catalog,o,deps),qs=unique(pool);
 return {availableCount:qs.length,templateCount:new Set(qs.map(family)).size,dimensions:perLevel.flatMap(({level,questions})=>[...new Set(o.dimensions)].map(id=>{const subset=unique(questions.filter(q=>q.dimension===id));return {id,level,availableCount:subset.length,templateCount:new Set(subset.map(family)).size};})),warnings,inventory:'当前固定种子的去重候选池；大数域为有界采样，不代表数学库存上限。'};
}
function quotas(count){const weights=[4,4,2,2],raw=weights.map(w=>Math.floor(count*w/12));for(let i=0,left=count-raw.reduce((a,b)=>a+b,0);left>0;i=(i+1)%4,left--)raw[i]++;return raw;}
function blueprint(o){
 if(o.mode==='custom')return [{id:'custom',title:'自定义严格练习',description:`仅使用第${o.level}级及明确选择的维度，不跨级补题。`,count:o.count,level:o.level,role:'practice'}];
 const counts=quotas(o.count),names=o.mode==='thinking'?['建立支架','独立思考','比较与检验','综合练习']:['热身回顾','主目标练习','表示与变式','综合检验'];
 return names.map((title,i)=>({id:`section-${i+1}`,title,count:counts[i],level:i===0?1:i===1?Math.min(2,o.level):o.level,role:i===2?'representation':i===3?'reasoning':'practice',description:`预先规划${counts[i]}题，第${i===0?1:i===1?Math.min(2,o.level):o.level}级，限所选知识点和维度。`}));
}
function maxStreak(qs){let prev,run=0,max=0;for(const q of qs){const a=answer(q);run=a===prev?run+1:1;prev=a;max=Math.max(max,run);}return max;}
function selectSlots(pool,plans,o){
 const selected=[],used=new Set(),sections=[],deficits=[];
 const topicCounts=new Map(),dimensionCounts=new Map(),familyCounts=new Map();
 for(const plan of plans){
  const section={...plan,questionIds:[]};
  for(let slot=0;slot<plan.count;slot++){
   let eligible=pool.filter(q=>q.level===plan.level&&!used.has(semanticKey(q)));
   if(!eligible.length){deficits.push({section:plan.id,slot:slot+1,level:plan.level});continue;}
   const last=selected.at(-1),tail=selected.slice(-3);
   if(tail.length===3&&tail.every(q=>answer(q)===answer(tail[0]))){const alternatives=eligible.filter(q=>answer(q)!==answer(last));if(alternatives.length)eligible=alternatives;}
   const tie=new Map(eligible.map(q=>[q,random(`${o.seed}\0${plan.id}\0${slot}\0${q.id}`)()]));
   const score=q=>(dimensionCounts.get(q.dimension)||0)*100+(topicCounts.get(q.topicId)||0)*80+(familyCounts.get(family(q))||0)*20+(last&&family(last)===family(q)?12:0)+(plan.role==='representation'&&!q.student?.blocks?.some(b=>b.type==='diagram')?8:0)+(plan.role==='reasoning'&&!['reasoning','reverse','equivalence','application'].includes(q.dimension)?8:0)+tie.get(q);
   eligible.sort((a,b)=>score(a)-score(b)||String(a.id).localeCompare(String(b.id)));
   const q=eligible[0];selected.push(q);used.add(semanticKey(q));section.questionIds.push(q.id);
   for(const [map,k] of [[topicCounts,q.topicId],[dimensionCounts,q.dimension],[familyCounts,family(q)]])map.set(k,(map.get(k)||0)+1);
  }
  if(section.questionIds.length)sections.push(section);
 }
 return {questions:selected,sections,deficits};
}
function quality(questions,warnings,deficits=[]){
 const familyCounts={};for(const q of questions)familyCounts[family(q)]=(familyCounts[family(q)]||0)+1;
 const answerMaxStreak=maxStreak(questions);
 if(answerMaxStreak>3)warnings.push(`保持分区级别与所选范围后，答案最长连续${answerMaxStreak}题相同；请减少题量或选择更多任务家族。`);
 if(deficits.length)warnings.push(`蓝图槽位不足：缺${deficits.length}题。未复制题目、降级或扩大知识范围。`);
 return {warnings:[...new Set(warnings)],familyCounts,answerMaxStreak,goals:[...new Set(questions.map(q=>q.topicName||q.topicId).filter(Boolean))],deficits};
}
export async function planWorksheet(catalog,options,given){
 validate(catalog,options);const o={...options,dimensions:[...new Set(options.dimensions)],mode:options.mode||'custom'},deps=await dependencies(given);
 const warnings=[],descriptions={custom:`自定义：严格使用第${o.level}级和所选范围，不降级补题。`,daily:`每日巩固：明确混合第1至${o.level}级，按热身、主目标、变式和检验的槽位选题。`,thinking:`思维专题：明确混合第1至${o.level}级，按支架到独立的分区选题。`,remediation:'错题补救：原题原样保留；不从一次错误推断能力，默认不加入新题。'};
 let result;
 if(o.mode==='remediation'){
  const originals=o.wrongQuestions||[],questions=originals.slice(0,o.count),sections=questions.length?[{id:'originals',title:'原错题回看',description:'历史题目原样重练，不重新生成。',questionIds:questions.map(q=>q.id)}]:[];
  warnings.push('原题版本保留；单次错误不用于诊断，理由或绘图仍需人工核阅。');
  if(originals.length>o.count)warnings.push(`${originals.length-o.count}道原错题未纳入本卷，仍完整保留在错题本中。`);
  if(o.addRelated===true&&questions.length<o.count){const fresh=await collect(catalog,o,deps),used=new Set(questions.map(semanticKey));const extra=selectSlots(fresh.pool.filter(q=>!used.has(semanticKey(q))),[{id:'related',title:'明确选择的相关练习',description:'仅在用户明确启用时加入所选范围新题。',level:o.level,count:o.count-questions.length,role:'practice'}],o);questions.push(...extra.questions);sections.push(...extra.sections);warnings.push(...fresh.warnings);}
  result={questions,sections,deficits:[]};
 }else{
  const collected=await collect(catalog,o,deps);warnings.push(...collected.warnings);
  result=selectSlots(collected.pool,blueprint(o),o);
 }
 const q=quality(result.questions,warnings,result.deficits);
 if(o.topicId==='all')q.warnings.push('全年级范围是本次抽样范围，不代表本卷覆盖全部知识点；建议明确一个学习主题。');
 if(Array.isArray(o.learnedTopicIds)){
  const learned=new Set(o.learnedTopicIds),needed=new Set(result.questions.flatMap(item=>catalog.dependencies.filter(e=>e.topicId===item.topicId).map(e=>e.prerequisiteId)).filter(id=>!learned.has(id)));
  if(needed.size)q.warnings.push(`有${needed.size}个前置知识未在已学列表中确认；本卷未擅自补入范围外题目。`);
 }
 return {questions:result.questions,warnings:q.warnings,seed:o.seed,requestedCount:o.count,sections:result.sections,quality:q,versions:{schema:2,engine:deps.ENGINE_VERSION||'2.0.0',planner:VERSION,catalog:catalog.revision||deps.CATALOG_VERSION||'external-catalog'},plan:{mode:o.mode,description:descriptions[o.mode],levelPolicy:['daily','thinking'].includes(o.mode)?`mixed-level up to ${o.level}`:'exact',blueprint:blueprint(o.mode==='remediation'?{...o,mode:'custom'}:o)}};
}
