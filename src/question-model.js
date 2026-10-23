import sourceCorrections from '../data/source-corrections.json' with {type:'json'};
// Additive semantic question and typed assessment model. No DOM or I/O.
const corrections=new Map(sourceCorrections.corrections.map(c=>[c.id,c]));
export function curateSourceQuestion(question) {
 const patch=corrections.get(question?.id);
 if(!patch)return {...question};
 if(patch.action==='exclude')return {...question,contentWarning:'历史题目已退出新题池：'+patch.reason};
 const q={...question,answer:patch.answer,verify:patch.verify};
 if(q.answerSpec)q.answerSpec={...q.answerSpec,value:patch.answer};
 return q;
}
export const excludedSourceIds=new Set(sourceCorrections.corrections.filter(c=>c.action==='exclude').map(c=>c.id));
const normalize = value => ['string','number'].includes(typeof value) && String(value).length <= 256
  ? String(value).normalize('NFKC').replace(/\s+/gu,'').replace(/[−–]/g,'-').replace(/[⁄∕]/g,'/').replace(/，/g,',').toLowerCase() : '';
function rational(text) {
  if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\/[+-]?(?:\d+(?:\.\d*)?|\.\d+))?$/.test(text)) return null;
  const decimal=s=>{let sign=1n;if(s[0]==='-'){sign=-1n;s=s.slice(1);}else if(s[0]==='+')s=s.slice(1);const [w,f='']=s.split('.');return [sign*BigInt((w||'0')+f),10n**BigInt(f.length)];};
  const [a,b]=text.split('/'),[an,ad]=decimal(a),[bn,bd]=b===undefined?[1n,1n]:decimal(b);
  return bn===0n?null:[an*bd,ad*bn];
}
function same(a,b) {
  a=normalize(a);b=normalize(b);if(!a||!b)return false;
  const x=rational(a),y=rational(b);
  return x&&y?x[0]*y[1]===y[0]*x[1]:a===b&&!a.includes('/')&&!/^(?:nan|[+-]?infinity)$/.test(a);
}
const blank=v=>v==null||typeof v==='string'&&!v.trim();
function fingerprint(q){return JSON.stringify([q.prompt.replace(/\s+/g,''),q.answer,q.choices||null,q.student?.blocks||[],q.student?.tasks||[]]);}
function hash(s){let h=2166136261;for(const ch of s)h=Math.imul(h^ch.charCodeAt(0),16777619);return(h>>>0).toString(36);}

// Deliberately narrow: a single scalar binary-result task, not NL equivalence.
// Authors may declare a binary operation for a story; legacy imports use only
// this exact calculation grammar. Diagrams are optional support, not responses.
export function mathematicalTaskIdentity(q) {
 const spec=q.answerSpec,tasks=q.student?.tasks;
 if(q.dimension==='reasoning'||q.choices?.length||spec&&spec.kind!=='scalar'||tasks&&(tasks.length!==1||!['number','text'].includes(tasks[0].kind)))return null;
 const prompt=String(q.prompt||'').normalize('NFKC').replace(/\s+/gu,'');
 const match=prompt.match(/^(?:计算:)?(\d+)([+＋−－\-×÷*\/])(\d+)[=＝](?:□|\?)(?:[。.]可以用十框图先凑十[。.]?|[。.]?)$/u);
 const declared=q.mathematicalTaskIdentity;
 const operation=declared?.kind==='binary-result'?declared:match?{kind:'binary-result',operator:match[2],operands:[Number(match[1]),Number(match[3])]}:null;
 if(!operation||!Array.isArray(operation.operands)||operation.operands.length!==2||!operation.operands.every(Number.isSafeInteger))return null;
 const operator=({'+':'+','＋':'+','-':'-','－':'-','−':'-','×':'*','*':'*','÷':'/','/':'/'})[operation.operator];
 const [a,b]=operation.operands,result=operator==='+'?a+b:operator==='-'?a-b:operator==='*'?a*b:operator==='/'&&b!==0?a/b:NaN;
 if(!Number.isSafeInteger(result)||!same(String(result),spec?.value??q.answer))return null;
 return {kind:'binary-result',operator,operands:[a,b]};
}
export function questionDedupKey(q) {
 const task=mathematicalTaskIdentity(q);
 return task?`math:${JSON.stringify(task)}`:q.prompt?JSON.stringify([q.prompt.replace(/\s+/g,''),q.answer,q.choices||null,q.student?.blocks||null,q.student?.tasks||null]):q.id||q.fingerprint||JSON.stringify(q);
}

export function createQuestion(topic,dimension,level,config) {
  if(!topic?.id||!config?.familyId||typeof config.prompt!=='string'||config.answer==null)throw new TypeError('题目缺少目标、家族、题干或答案');
  const answer=String(config.answer),manual=dimension==='reasoning';
  const q={schemaVersion:2,topicId:topic.id,topicName:topic.name,grade:topic.grade,dimension,level,prompt:config.prompt,answer,
    explanation:config.explanation||'',hint:config.hint||'先圈出已知条件，想清要求的量。',source:'original',
    templateId:`${config.familyId}:v2`,familyId:config.familyId,representation:config.blocks?.find(b=>b.type==='diagram')?.kind||'symbolic',
    skills:[topic.id],prerequisites:[...(config.prerequisites||[])],
    difficultyDescriptor:{steps:level===1?1:2,reasoningMoves:[dimension],languageLoad:manual?'medium':'low',support:level===1?'supported':'independent',...config.difficultyDescriptor},
    student:{blocks:config.blocks||[{type:'text',text:config.prompt}],tasks:config.tasks||[{id:'answer',label:'我的答案',kind:'number'}]},
    answerSpec:config.answerSpec||{kind:'scalar',value:answer},solution:{steps:config.solutionSteps||[config.explanation||'']},
    layout:{workspaceKind:manual?'reasoning':dimension==='application'?'application':'short',minWritingMm:manual?36:dimension==='application'?24:8,preferredSpan:1,keepTogether:true,...config.layout},
    ...(config.visual?{visual:config.visual}:{}),...(config.choices?{choices:config.choices}:{})};
  if(config.mathematicalTaskIdentity)q.mathematicalTaskIdentity=config.mathematicalTaskIdentity;
  const identity=mathematicalTaskIdentity(q);if(identity)q.mathematicalTaskIdentity=identity;
  q.fingerprint=fingerprint(q);q.id=`v2:${topic.id}:${hash(q.fingerprint)}`;
  return q;
}

export function toQuestionV2(question,overrides={}) {
  const q=curateSourceQuestion({...question,...overrides});
  q.schemaVersion=2;q.templateId ||= `source:${q.id}`;q.familyId ||= q.source==='original'?`${q.topicId}:${q.dimension}`:`source:${q.topicId}`;
  q.representation ||= 'text';q.skills ||= [q.topicId];q.prerequisites ||= [];
  q.difficultyDescriptor ||= {steps:1,reasoningMoves:['recall'],languageLoad:'low',support:'source'};
  const tuple=/^\d+,\d+$/.test(normalize(q.answer))&&!q.answerSpec;
  if(tuple){
    const [quotient,remainder]=normalize(q.answer).split(',');
    q.student={blocks:[{type:'text',text:q.prompt||''}],tasks:[{id:'quotient',label:'商',kind:'number'},{id:'remainder',label:'余数',kind:'number'}]};
    q.answerSpec={kind:'multipart',parts:[{id:'quotient',spec:{kind:'scalar',value:quotient}},{id:'remainder',spec:{kind:'scalar',value:remainder}}]};
  }
  q.student ||= {blocks:[{type:'text',text:q.prompt||''}],tasks:[{id:'answer',label:'我的答案',kind:q.choices?'choice':'text',...(q.choices?{options:q.choices}:{})}]};
  if(!q.answerSpec)q.answerSpec=q.choices?{kind:'choice',value:String(q.answer)}:/^[+-]?\d+,\d+$/.test(normalize(q.answer))?{kind:'tuple',value:normalize(q.answer)}:{kind:'scalar',value:String(q.answer??'')};
  q.solution ||= {steps:[q.explanation||'']};q.layout ||= {workspaceKind:'short',minWritingMm:8,preferredSpan:1,keepTogether:true};
  const identity=mathematicalTaskIdentity(q);if(identity)q.mathematicalTaskIdentity=identity;
  return q;
}

function combine(statuses) {
  if(statuses.every(s=>s==='unanswered'))return 'unanswered';
  if(statuses.includes('incorrect'))return statuses.includes('correct')?'partial':'incorrect';
  if(statuses.includes('unanswered')||statuses.includes('partial'))return 'partial';
  if(statuses.includes('manual'))return 'manual';
  return 'correct';
}
function assessSpec(spec={},value,question={}) {
  if(spec.kind==='multipart') {
    const input=value&&typeof value==='object'?value:{answer:value};const parts={};
    for(const part of spec.parts||[])parts[part.id]=assessSpec(part.spec,input[part.id],question);
    const statuses=Object.values(parts).map(p=>p.status);
    return {status:statuses.length?combine(statuses):'unanswered',parts};
  }
  if(value&&typeof value==='object'&&!Array.isArray(value))value=value.answer??value[question.student?.tasks?.[0]?.id];
  if(blank(value))return {status:'unanswered'};
  if(spec.kind==='rubric'||spec.manual)return {status:'manual'};
  if(spec.kind==='tuple') {
    let values=Array.isArray(value)?value.map(String):normalize(value).split(',');
    if(values.length===1){const match=String(value).match(/商\s*(\d+)\s*[,，、]?\s*余(?:数)?\s*(\d+)/);if(match)values=[match[1],match[2]];}
    const expected=normalize(spec.value??question.answer).split(',');
    return {status:values.length===expected.length&&values.every((v,i)=>same(v,expected[i]))?'correct':'incorrect'};
  }
  if(spec.kind==='quantity') {
    const input=normalize(value),units=[spec.unit,...(spec.aliases||[])].filter(Boolean).map(normalize).sort((a,b)=>b.length-a.length);
    const unit=units.find(u=>input.endsWith(u));
    const number=unit?input.slice(0,-unit.length):input;
    return {status:same(number,spec.value??question.answer)?'correct':'incorrect'};
  }
  if(spec.kind==='choice') {
    const expected=normalize(spec.value??question.answer),input=normalize(value).replace(/^\(([a-z])\)$/,'$1');
    const choices=question.choices||question.student?.tasks?.flatMap(t=>t.options||[])||[];
    const correct=choices.find(c=>normalize(c.key)===expected);
    return {status:input===expected||!!correct&&same(input,correct.text)?'correct':'incorrect'};
  }
  return {status:same(value,spec.value??question.answer)?'correct':'incorrect'};
}
export function assessAnswer(question,value) {
  const q=toQuestionV2(question);
  // Historical tuple answers remain two typed controls, but old saved textual
  // submissions must assess identically without changing the stored question.
  if(q.answerSpec.kind==='multipart'&&q.answerSpec.parts?.length===2&&q.answerSpec.parts[0].id==='quotient'&&q.answerSpec.parts[1].id==='remainder'&&/^\d+,\d+$/.test(normalize(q.answer))&&/^\d+,\d+$/.test(normalize(value))){
   const [quotient,remainder]=normalize(value).split(',');value={quotient,remainder};
  }
  const result=assessSpec(q.answerSpec,value,q);
  return {status:result.status,parts:result.parts||{[q.student?.tasks?.[0]?.id||'answer']:{status:result.status}}};
}
export function assessmentValueMatches(a,b){return same(a,b);}
