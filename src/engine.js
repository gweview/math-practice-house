export const DIMENSIONS = [
 ['basic','基础练习','直接运用知识'],['fill','填空补全','寻找算式中缺失的数'],
 ['equivalence','等量代换','根据相等关系逐步代换'],['pattern','规律探索','按照明确规则继续排列'],
 ['reverse','逆向思考','从结果倒推已知量'],['reasoning','推理判断','检验关系并作出判断'],
 ['application','生活应用','在具体情境中选择运算'],
].map(([id,label,description])=>({id,label,description}));
export const LEVELS = [{id:1,label:'起步'},{id:2,label:'进阶'},{id:3,label:'挑战'}];

function random(seed) {
 let h=2166136261;
 for (const ch of seed) h=Math.imul(h^ch.charCodeAt(0),16777619);
 return () => {h+=0x6D2B79F5;let t=Math.imul(h^(h>>>15),1|h);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};
}
function shuffle(items,rng) {
 const out=[...items];
 for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
 return out;
}
function fingerprint(q) {
 return JSON.stringify([q.prompt.replace(/\s+/g,''),q.answer,q.choices||null]);
}
// Explicit curriculum allow-list: unknown topics remain source-only.
const ARITHMETIC = {
 6:[1,'＋',5],7:[1,'－',5],10:[1,'＋',10],11:[1,'－',10],18:[1,'＋',20],
 19:[1,'＋',20],20:[1,'＋',20],21:[1,'＋',20],25:[1,'－',19],26:[1,'－',19],27:[1,'－',19],
 30:[1,'＋',100],31:[1,'＋',100],32:[1,'－',100],33:[1,'＋',100],34:[1,'－',100],
 38:[2,'×',6],39:[2,'×',6],42:[2,'×',9],43:[2,'÷',6],44:[2,'÷',9],46:[2,'÷',6],47:[2,'÷',9],48:[2,'×',9],
 64:[2,'＋',990],65:[2,'－',990],71:[2,'＋',999],72:[2,'－',999],
 74:[3,'×',999],75:[3,'×',990],83:[3,'÷',999],84:[3,'÷',999],
};
function arithmeticSpec(t) {
 const spec=ARITHMETIC[Number(t?.id?.replace('cnm_p',''))];
 return spec&&t.grade===spec[0]?spec:null;
}
export function getCapabilities(topic) {
 if((topic?.id==='cnm_p089'&&topic.grade===3)||(topic?.id==='cnm_p063'&&topic.grade===2))return ['basic','reverse','reasoning'];
 if(topic?.id==='cnm_p060'&&topic.grade===2)return ['basic','pattern'];
 if(topic?.id==='cnm_p224'&&topic.grade===3)return ['basic','equivalence'];
 return arithmeticSpec(topic)?['basic','fill','reverse','reasoning','application']:['basic'];
}
function arithmeticCandidates(t,rng) {
 const [,op,max]=arithmeticSpec(t), n=Number(t.id.replace('cnm_p','')), pairs=[];
 const accept=(a,b)=>{
  const r=op==='＋'?a+b:op==='－'?a-b:op==='×'?a*b:a/b;
  if(!Number.isInteger(r)||r<0||((op==='＋'||op==='－')&&r>max))return;
  if(n===18&&(a<11||a>19||b>9||a%10+b%10>=10))return;
  if([31,32].includes(n)&&(a<10||a>99||!(b<=9||b%10===0)))return;
  if([33,34].includes(n)&&(a<10||a>99||b<10||b>99))return;
  if(op==='÷'&&max<=9&&r>max)return;
  if([74,75,83,84].includes(n)&&a<10)return;
  if([19,20,21].includes(n)&&!(a+b>10&&a+b<20&&b<=9&&(n===20?a===9:n===21?[6,7,8].includes(a):a>=6&&a<=9)))return;
  if([25,26,27].includes(n)&&!(a>=11&&a<=18&&b>a%10&&(n===25?b===9:n===26?[6,7,8].includes(b):[2,3,4,5].includes(b))))return;
  if([30,64,65].includes(n)&&(a%10||b%10))return;
  if(n===42&&a<7)return;
  if(n===44&&b<7)return;
  if(n===75&&!(a>=100&&(a%10===0||Math.floor(a/10)%10===0)))return;
  if([71,72].includes(n)&&(a<100||b<100))return;
  pairs.push({a,b,r,op});
 };
 const maxA=op==='÷'?(max<=9?max*max:max):max;
 const maxB=(op==='×'||op==='÷')?(max<=9?max:9):max;
 // Exhaust small domains; bounded random sampling for large domains.
 if([64,65].includes(n))for(let a=100;a<=maxA;a+=10)for(let b=100;b<=maxB;b+=10)accept(a,b);
 else if(maxA*maxB<=12000)for(let a=op==='×'?1:0;a<=maxA;a++)for(let b=op==='÷'||op==='×'?1:0;b<=maxB;b++)accept(a,b);
 else for(let i=0;i<2400;i++)accept(Math.floor(rng()*(maxA+1)),Math.floor(rng()*(maxB+1)));
 return shuffle(pairs,rng).slice(0,400);
}
function originalQuestion(t,dimension,level,prompt,answer,explanation,hint,visual) {
 const q={topicId:t.id,topicName:t.name,grade:t.grade,dimension,level,prompt,answer:String(answer),explanation,hint,source:'original',...(visual?{visual}:{})};
 q.fingerprint=fingerprint(q);q.id=`original:${t.id}:${dimension}:${q.fingerprint}`;
 return q;
}
function generateOriginal(t,dimension,level,rng) {
 if(level<=2&&['reverse','reasoning'].includes(dimension)&&t.id==='cnm_p089'&&t.grade===3) {
  const out=[];
  for(let width=2;width<=12;width++)for(let length=width+2;length<=25;length++) {
   const strip=level===1?0:1+Math.floor(rng()*3),area=(length-strip)*width;
   const prompt=dimension==='reverse'?(level===1?`长方形面积是 ${area} 平方厘米，宽 ${width} 厘米，长是多少厘米？`:`长方形宽 ${width} 厘米，沿长切去 ${strip} 厘米后，剩下面积是 ${area} 平方厘米。原来长多少厘米？`):`长方形长 ${length} 厘米、宽 ${width} 厘米。长减少1厘米、宽增加1厘米，周长不变。新面积比原来多多少平方厘米？`;
   const answer=dimension==='reverse'?length:(length-1)*(width+1)-length*width;
   const explanation=dimension==='reverse'?`${area}÷${width}＋${strip}＝${length}（厘米）。`:`原面积 ${length}×${width}＝${length*width}，新面积 ${length-1}×${width+1}＝${(length-1)*(width+1)}，相差 ${answer} 平方厘米。周长相等不代表面积相等。`;
   out.push(originalQuestion(t,dimension,level,prompt,answer,explanation,'长方形面积等于长乘宽。画图区分长、宽和面积。',{type:'rectangle',length,width,strip}));
  }
  return out;
 }
 if(level<=2&&['reverse','reasoning'].includes(dimension)&&t.id==='cnm_p063'&&t.grade===2) {
  const out=[];
  for(let startMinute=1;startMinute<=45;startMinute++)for(let duration=5;duration<=45;duration+=5) {
   const elapsed=9*60+startMinute+duration,endHour=Math.floor(elapsed/60),endMinute=elapsed%60;
   if(level===1&&endHour!==9||level===2&&endHour!==10)continue;
   const prompt=dimension==='reverse'?`活动在 ${endHour} 时 ${endMinute} 分结束，一共用了 ${duration} 分钟。开始时是9时几分？`:`活动从9时 ${startMinute} 分开始，到 ${endHour} 时 ${endMinute} 分结束。小林把分钟数直接相减，认为用了 ${endMinute-startMinute} 分钟。${endHour===9?'这种算法对吗？请验证，并写出实际用了多少分钟？':'这种算法不可靠，实际用了多少分钟？'}`;
   const answer=dimension==='reverse'?startMinute:duration;
   const explanation=dimension==='reverse'?`从结束时间倒退 ${duration} 分钟，得到9时 ${startMinute} 分，所以填 ${answer}。`:`${endHour===10?`先从9时 ${startMinute} 分到10时是 ${60-startMinute} 分钟，再加 ${endMinute} 分钟。`:`同一小时内：${endMinute}－${startMinute}＝${duration}。`}共 ${duration} 分钟。`;
   out.push(originalQuestion(t,dimension,level,prompt,answer,explanation,'跨过整点时，先算到整点，再算整点之后；1小时有60分钟。',{type:'time',startMinute,duration,endHour,endMinute}));
  }
  return out;
 }
 if(t.id==='cnm_p060'&&t.grade===2&&dimension==='pattern') {
  const out=[];
  for(let start=1;start<=25;start++)for(let step=1;step<=9;step++) {
   const secondStep=step+1+Math.floor(rng()*4),terms=[start];let next=start;
   for(let i=0;i<4;i++){next+=level===1?step:level===2?(i%2===0?step:secondStep):step*(i+1);terms.push(next);}
   const rule=level===1?`每次加 ${step}`:level===2?`交替加 ${step}、加 ${secondStep}，从加 ${step} 开始`:`依次加 ${step}、${step*2}、${step*3}……，每次所加的数比上一次多 ${step}`;
   out.push(originalQuestion(t,dimension,level,`规则：${rule}。按此规则填下一个数：${terms.slice(0,4).join('、')}、□。`,next,`下一次加 ${next-terms[3]}，${terms[3]}＋${next-terms[3]}＝${next}。`,'必须按照题目给定的规则，不仅凭前几项猜测。',{type:'pattern',start,step,secondStep,terms:terms.slice(0,4)}));
  }
  return out;
 }
 if(t.id==='cnm_p224'&&t.grade===3&&dimension==='equivalence') {
  const out=[];
  for(let ratio=2;ratio<=8;ratio++)for(let v=2;v<=15;v++) {
   const secondRatio=2+Math.floor(rng()*4),green=v,blue=level===2?secondRatio*green:v,red=ratio*blue,total=red+blue;
   const relation=`1袋红珠与 ${ratio} 袋蓝珠一样重。`;
   const prompt=relation+(level===1?`1袋蓝珠重 ${blue} 克。`:level===2?`1袋蓝珠与 ${secondRatio} 袋绿珠一样重，1袋绿珠重 ${green} 克。`:`1袋红珠和1袋蓝珠一共重 ${total} 克。`)+`每种珠子每袋重量相同。1袋红珠重多少克？`;
   const explanation=level===3?`把红珠换成 ${ratio} 袋蓝珠，一共 ${ratio+1} 袋蓝珠，${total}÷${ratio+1}＝${blue}，红珠重 ${blue}×${ratio}＝${red} 克。`:level===2?`先代换蓝珠：${secondRatio}×${green}＝${blue}，再代换红珠：${ratio}×${blue}＝${red} 克。`:`用等重关系代换：${ratio}×${blue}＝${red} 克。`;
   out.push(originalQuestion(t,dimension,level,prompt,red,explanation,'把同样重的部分换成同一种珠子，再计算。',{type:'equivalence',ratio,blue,green,secondRatio,total}));
  }
  return out;
 }
 if(!arithmeticSpec(t)||!['fill','reverse','reasoning','application'].includes(dimension)||level===3)return [];
 return arithmeticCandidates(t,rng).filter(p=>!(dimension==='fill'&&((level===1&&p.op==='÷'&&p.a===0)||(level===2&&p.b===0&&p.op==='×')))).map(({a,b,r,op})=>{
  const offset=Math.min(r,level===1?1:Math.max(1,Math.floor(r/2)));
  let prompt,answer,explanation,hint;
  const equation=`${a} ${op} ${b} ＝ ${r}`;
  if(dimension==='fill') {
   prompt=level===1?`${a} ${op} □ ＝ ${r}`:`□ ${op} ${b} ＝ ${r}`;
   answer=level===1?b:a;explanation=`把 ${answer} 代入：${equation}。`;hint='用相反的运算寻找缺少的数，再代回检验。';
  } else if(dimension==='reverse') {
   prompt=`想一个数，把它${op==='＋'?`加上 ${b}`:op==='－'?`减去 ${b}`:op==='×'?`乘 ${b}`:`除以 ${b}`}，结果是 ${r}。原来的数是多少？`;
   if(level===2)prompt=`想一个数，把它${op==='＋'?`加上 ${b}`:op==='－'?`减去 ${b}`:op==='×'?`乘 ${b}`:`除以 ${b}`}后，再减去 ${offset}，得到 ${r-offset}。原来的数是多少？`;
   answer=a;explanation=`${level===2?`先还原减去的 ${offset}，得到 ${r}；`:''}再逆推，代回检验：${equation}。`;hint='从最后的结果开始，按相反顺序一步步还原。';
  } else if(dimension==='reasoning') {
   prompt=`小林说：“${a} ${op} ${b} 的结果比 ${offset} 多 ${Math.max(0,r-offset)+1}。”多的数量说错了。实际多多少？`;
   answer=r-offset;explanation=`先算 ${equation}，再算 ${r}－${offset}＝${answer}。`;hint='先独立算出结果，再与给出的数比较，不要直接接受小林的判断。';
  } else {
   prompt=op==='＋'?`盒里有 ${a} 张卡片，又放入 ${b} 张，现在有多少张？`:op==='－'?`有 ${a} 张卡片，送出 ${b} 张，还剩多少张？`:op==='×'?`每袋有 ${a} 颗珠子，${b} 袋一共有多少颗？`:`把 ${a} 张卡片平均分给 ${b} 人，每人有多少张？`;
   answer=r;explanation=`${op==='＋'?'合并':op==='－'?'求剩余':op==='×'?'求相同数量的总数':'平均分'}，${equation}。`;hint='先判断是合并、去掉、相同的几份，还是平均分。';
   if(level===2){
    prompt=op==='＋'?`盒里有 ${a} 张卡片，又放入 ${b} 张，然后再拿走 ${offset} 张，剩多少张？`:op==='－'?`有 ${a} 张卡片，先送出 ${b} 张，然后再拿走 ${offset} 张，还剩多少张？`:op==='×'?`每袋有 ${a} 颗珠子，把 ${b} 袋合在一起，然后再拿走 ${offset} 颗，还剩多少颗？`:`把 ${a} 张卡片平均分给 ${b} 人，小明是其中一人。再拿走小明分到的卡片中的 ${offset} 张，小明还剩多少张？`;
    answer=r-offset;explanation+=`再拿走用减法：${r}－${offset}＝${answer}。`;hint='先求第一步的数量，再处理拿走的数量。';
   }
  }
  return originalQuestion(t,dimension,level,prompt,answer,explanation,hint,{type:'arithmetic',a,b,result:r,op,offset});
 });
}
function normalize(value) {
 if(!['string','number'].includes(typeof value)||String(value).length>256)return '';
 return String(value).normalize('NFKC').replace(/\s+/gu,'').replace(/[−–]/g,'-').replace(/[⁄∕]/g,'/').toLowerCase();
}
function rational(text) {
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\/[+-]?(?:\d+(?:\.\d*)?|\.\d+))?$/.test(text))return null;
 function decimal(s) {
  let sign=1n;if(s[0]==='-'){sign=-1n;s=s.slice(1);}else if(s[0]==='+')s=s.slice(1);
  const [whole,frac='']=s.split('.');return [sign*BigInt((whole||'0')+frac),10n**BigInt(frac.length)];
 }
 const [a,b]=text.split('/'),[an,ad]=decimal(a),[bn,bd]=b===undefined?[1n,1n]:decimal(b);
 return bn===0n?null:[an*bd,ad*bn];
}
function equalAnswer(a,b) {
 const x=rational(a),y=rational(b);
 if(x&&y)return x[0]*y[1]===y[0]*x[1];
 // Invalid numeric expressions (e.g. 0/0) must not self-match.
 return a===b&&!a.includes('/')&&!/^(?:nan|[+-]?infinity)$/i.test(a);
}
export function checkAnswer(question,value) {
 const input=normalize(value),answer=normalize(question?.answer);
 if(!input||!answer)return false;
 if(Array.isArray(question.choices)) {
  const correct=question.choices.find(c=>normalize(c.key)===answer);
  return !!correct&&(input.replace(/^\(([a-z])\)$/,'$1')===answer||equalAnswer(input,normalize(correct.text)));
 }
 return equalAnswer(input,answer);
}

export async function loadCatalog() {
 const pairs=await Promise.all(['topics','questions','dependencies'].map(async key=>{
  const url=new URL(`../data/${key}.json`,import.meta.url);
  const response=await fetch(url);
  if(!response.ok)throw new Error(`加载 ${key} 数据失败（HTTP ${response.status}）`);
  return [key,await response.json()];
 }));
 const catalog=Object.fromEntries(pairs);validateCatalog(catalog);return catalog;
}

function validateCatalog(catalog) {
 if(!catalog||!['topics','questions','dependencies'].every(k=>Array.isArray(catalog[k]))) throw new TypeError('数据必须包含知识点、题目与依赖数组');
 const ids=new Set();
 for(const t of catalog.topics) {
  if(!t||typeof t.id!=='string'||!t.id||ids.has(t.id)||typeof t.name!=='string'||![1,2,3].includes(t.grade)||!['上','下'].includes(t.semester)) throw new TypeError('知识点数据无效');
  ids.add(t.id);
 }
 const questionIds=new Set();
 for(const q of catalog.questions) {
  if(!q||!ids.has(q.topicId)||!['id','prompt','answer','explanation'].every(k=>typeof q[k]==='string'&&q[k].trim())||questionIds.has(q.id)||!['basic','standard'].includes(q.difficulty))throw new TypeError('题目数据无效');
  questionIds.add(q.id);
  if(q.type==='choice'||q.choices!==undefined) {
   if(!Array.isArray(q.choices)||q.choices.length<2||q.choices.some(c=>!c||typeof c.key!=='string'||!c.key.trim()||typeof c.text!=='string'||!c.text.trim())||new Set(q.choices.map(c=>normalize(c.key))).size!==q.choices.length||!q.choices.some(c=>c.key===q.answer))throw new TypeError('选择题数据无效');
  }
 }
 for(const edge of catalog.dependencies)if(!edge||!ids.has(edge.topicId)||!ids.has(edge.prerequisiteId)||edge.topicId===edge.prerequisiteId)throw new TypeError('依赖数据无效');
}
export function generateWorksheet(catalog,options) {
 validateCatalog(catalog);
 if(!options||![1,2,3].includes(options.grade)||!['all','上','下'].includes(options.semester)||!Array.isArray(options.dimensions)||!options.dimensions.length||options.dimensions.some(d=>!DIMENSIONS.some(x=>x.id===d))||![1,2,3].includes(options.level)||![6,12,18].includes(options.count)||typeof options.seed!=='string') throw new TypeError('练习选项无效');
 if(options.topicId!=='all'&&!catalog.topics.some(t=>t.id===options.topicId&&t.grade===options.grade)) throw new RangeError('知识点不属于所选年级');
 const {grade,semester,topicId,dimensions,level,count,seed}=options;
 const rng=random(seed), warnings=[], pool=[];
 const selected=catalog.topics.filter(t=>t.grade===grade&&(semester==='all'||t.semester===semester)&&(topicId==='all'||t.id===topicId));
 for(const t of selected) {
  for(const dimension of new Set(dimensions)) if(dimension!=='basic')pool.push(...generateOriginal(t,dimension,level,rng));
  if(dimensions.includes('basic')) for(const original of catalog.questions.filter(q=>q.topicId===t.id&&q.difficulty===(level===1?'basic':level===2?'standard':'__none'))) {
   const q={...original,topicName:t.name,grade:t.grade,dimension:'basic',level,hint:'先读题，再结合这个知识点想一想。',source:'taxonomy'};
   q.fingerprint=fingerprint(q);pool.push(q);
  }
 }
 const seen=new Set(), questions=[];
 const queues=[...new Set(dimensions)].map(d=>{
  const candidates=shuffle(pool.filter(q=>q.dimension===d),rng);
  if(!candidates.length)warnings.push(`当前知识点与难度暂不支持“${DIMENSIONS.find(x=>x.id===d).label}”，不会替换成其他维度。`);
  return candidates;
 });
 // Round-robin dimensions; each queue is finite and each candidate is consumed once.
 while(questions.length<count&&queues.some(q=>q.length))for(const queue of queues) {
  if(questions.length===count)break;
  while(queue.length){const q=queue.pop();if(!seen.has(q.fingerprint)){seen.add(q.fingerprint);questions.push(q);break;}}
 }
 if(questions.length<count)warnings.push(`本次生成获得 ${questions.length} 道不重复题，未达到 ${count} 道；未使用其他难度或知识点补齐。`);
 return {questions,warnings,seed,requestedCount:count};
}
