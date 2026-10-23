import {createQuestion,toQuestionV2,assessAnswer as assessTypedAnswer,excludedSourceIds,questionDedupKey} from './question-model.js';
import {pilotCandidates} from './templates/pilots.js';
export const ENGINE_VERSION='2.0.0';
export const CATALOG_VERSION='1e9f3d278b90e5a5c36e832c340e262feff0ca78+curation-v2';
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
 const pilot={cnm_p020:['basic','fill','reverse','reasoning','application'],cnm_p018:['basic','fill','reverse','reasoning','application'],cnm_p047:['basic','fill','reverse','reasoning','application'],cnm_p060:['basic','pattern','reasoning'],cnm_p224:['basic','equivalence','reasoning'],cnm_p089:['basic','reverse','reasoning','application']};
 if(pilot[topic?.id]&&topic?.grade===(['cnm_p020','cnm_p018'].includes(topic.id)?1:['cnm_p047','cnm_p060'].includes(topic.id)?2:3))return [...pilot[topic.id]];
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
 const config={familyId:`${t.id}:${dimension}:${level===3?'chain':level===2?'variant':'direct'}`,prompt,answer,explanation,hint,visual,
  difficultyDescriptor:{steps:dimension==='reverse'?level:dimension==='reasoning'?2:level===1?1:2,reasoningMoves:[dimension],numberRange:arithmeticSpec(t)?.[2],carry:t.id==='cnm_p018'?'no-carry':'profile-constrained'}};
 if(dimension==='reasoning') {
  const truth=visual?.claimTruth??(visual?.type==='time'?visual.endHour===9:undefined);
  config.tasks=[...(truth===undefined?[]:[{id:'judgment',label:'判断说法',kind:'choice',options:[{key:'yes',text:'正确'},{key:'no',text:'不正确'}]}]),{id:'answer',label:'实际数量',kind:'number'},{id:'reason',label:'请说明理由或画图',kind:'manual'}];
  config.answerSpec={kind:'multipart',parts:[...(truth===undefined?[]:[{id:'judgment',spec:{kind:'choice',value:truth?'yes':'no'}}]),{id:'answer',spec:{kind:'scalar',value:String(answer)}},{id:'reason',spec:{kind:'rubric',manual:true}}]};
 }
 return createQuestion(t,dimension,level,config);
}
function validateArithmeticChain(n,a,b,r,c,step2,final,max) {
 if(![a,b,r,c,final].every(Number.isInteger)||[a,b,r,c,final].some(x=>x<0))return false;
 if([6,7].includes(n)&&[a,b,r,c,final].some(x=>x>5))return false;
 if(n===18&&(a%10+b%10>=10||r>20||final>20||(step2==='＋'&&r%10+c%10>=10)))return false;
 if([30,64,65].includes(n)&&(a%10||b%10||r%10||c%10||final%10))return false;
 if([19,20,21].includes(n)&&final>20)return false;
 if([25,26,27].includes(n)&&final<0)return false;
 return Number.isInteger(final)&&final>=0&&final<=max;
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
   const prompt=dimension==='reverse'?`活动在 ${endHour} 时 ${endMinute} 分结束，一共用了 ${duration} 分钟。开始时是9时几分？`:`活动从9时 ${startMinute} 分开始，到 ${endHour} 时 ${endMinute} 分结束。小林把分钟数直接相减，认为用了 ${endMinute-startMinute} 分钟。这种算法对吗？请验证，并写出实际用了多少分钟？`;
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
 if(!arithmeticSpec(t)||!['fill','reverse','reasoning','application'].includes(dimension))return [];
 return arithmeticCandidates(t,rng).filter(p=>!(dimension==='fill'&&((level===1&&p.op==='÷'&&p.a===0)||(level===2&&p.b===0&&p.op==='×')))).map(({a,b,r,op})=>{
  const n=Number(t.id.replace('cnm_p','')),unit=[30,64,65].includes(n)?10:1;
  const operandMax=arithmeticSpec(t)[2],max=op==='×'?operandMax*9:operandMax;
  const offset=Math.min(r,level===1?unit:Math.max(unit,Math.floor(r/2/unit)*unit));
  // Validate the actual extra operation at every tier, including reasoning L1.
  const subtractsOffset=dimension==='reasoning'||level===2&&['reverse','application'].includes(dimension);
  if(level<3&&!validateArithmeticChain(n,a,b,r,subtractsOffset?offset:0,'－',subtractsOffset?r-offset:r,max))return null;
  if(level<3&&unit===10&&subtractsOffset&&(offset===0||r-offset===0))return null;
  if(level===3) {
   const c=(2+((a+b)/unit%4))*unit;
   const step2=(op==='×'||op==='÷')?'＋':(r+c<=max?'＋':'－'), chained=step2==='＋'?r+c:r-c;
   if(a===0||b===0||((op==='×'||op==='÷')&&(a<=1||b<=1)))return null;
   if(dimension!=='reverse'&&!validateArithmeticChain(n,a,b,r,c,step2,chained,max))return null;
   if(dimension==='fill') {
    if(chained<0||(op==='÷'&&(a===0||b<=1))||(op==='×'&&(a<=1||b<=1)))return null;
    const firstUnknown=n===25;
    return originalQuestion(t,dimension,level,firstUnknown?`□ ${op} ${b} ${step2} ${c} ＝ ${chained}`:`${a} ${op} □ ${step2} ${c} ＝ ${chained}`,firstUnknown?a:b,`先逆推第二步：${chained} ${step2==='＋'?'－':'＋'} ${c} ＝ ${r}；再还原第一步，代回检验：${a} ${op} ${b} ${step2} ${c} ＝ ${chained}。`,'从结果倒着推：先还原最后一步，再找缺少的数。',{type:'arithmetic',a,b,result:r,op,offset,step2,c,final:chained,unknownFirst:firstUnknown});
   }
   if(dimension==='reverse') {
    if(r<2*unit)return null;
    const o1=Math.max(unit,Math.floor(r/2/unit)*unit), o2=(2+((a*3+b)/unit%4))*unit, end=r-o1+o2;
    if(!validateArithmeticChain(n,a,b,r,o1,'－',r-o1,max)||!validateArithmeticChain(n,a,b,r-o1,o2,'＋',end,max))return null;
    return originalQuestion(t,dimension,level,`想一个数，把它${op==='＋'?`加上 ${b}`:op==='－'?`减去 ${b}`:op==='×'?`乘 ${b}`:`除以 ${b}`}，再减去 ${o1}，再加上 ${o2}，得到 ${end}。原来的数是多少？`,a,`倒着还原：${end} － ${o2} ＝ ${r-o1}，${r-o1} ＋ ${o1} ＝ ${r}；再逆推第一步，代回检验：${a} ${op} ${b} ＝ ${r}。`,'从最后的结果开始，把每一步换成相反的运算倒着还原。',{type:'arithmetic',a,b,result:r,op,offset,step2:o2,c:o1,final:end});
   }
   if(dimension==='reasoning') {
    if(chained<0)return null;
    const truth=((a+b)/unit)%2===0,claim=chained+(truth?0:chained+unit<=max?unit:-unit);
    return originalQuestion(t,dimension,level,`小林说：“${a} ${op} ${b} 再${step2==='＋'?'加':'减'} ${c} 等于 ${claim}。”这句话正确吗？请判断，写出实际得数，并说明理由。`,chained,`先算 ${a} ${op} ${b} ＝ ${r}，再算 ${r} ${step2} ${c} ＝ ${chained}。所以小林的说法${truth?'正确':'不正确'}。`,'独立计算两步后，再检验小林的说法。',{type:'arithmetic',a,b,result:r,op,offset,step2,c,final:chained,claimTruth:truth});
   }
   if(op==='＋') {
    if(r+c>max||a+b===0)return null;
    return originalQuestion(t,dimension,level,`盒里有 ${a} 张卡片，又放入 ${b} 张，后来又放入 ${c} 张，现在有多少张？`,r+c,`先合并前两次：${a} ＋ ${b} ＝ ${r}，再加上后来放入的：${r} ＋ ${c} ＝ ${r+c}。`,'分两步想：先求放入一次后的数量，再处理第二次放入。',{type:'arithmetic',a,b,result:r,op,offset,step2:'＋',c,final:r+c});
   }
   if(op==='－') {
    if(r<c)return null;
    return originalQuestion(t,dimension,level,`有 ${a} 张卡片，送出 ${b} 张，又送出 ${c} 张，还剩多少张？`,r-c,`先算送出一次后剩的：${a} － ${b} ＝ ${r}，再送出：${r} － ${c} ＝ ${r-c}。`,'分两步想：先求送出一次后剩多少，再求又送出后剩多少。',{type:'arithmetic',a,b,result:r,op,offset,step2:'－',c,final:r-c});
   }
   if(op==='×') {
    return originalQuestion(t,dimension,level,`每袋有 ${a} 颗珠子，${b} 袋都装好后，又单独拿来 ${c} 颗，一共有多少颗？`,r+c,`先算袋里的：${a} × ${b} ＝ ${r}，再加上单独的：${r} ＋ ${c} ＝ ${r+c}。`,'分两步想：先求袋里的总数，再加上袋外的。',{type:'arithmetic',a,b,result:r,op,offset,step2:'＋',c,final:r+c});
   }
   if(r<=c)return null;
   return originalQuestion(t,dimension,level,`把 ${a} 张卡片平均分给 ${b} 人，每人分到后，又把自己分到的卡片中的 ${c} 张放回盒里。每人手里还剩多少张？`,r-c,`先平均分：${a} ÷ ${b} ＝ ${r}，每人再放回 ${c} 张：${r} － ${c} ＝ ${r-c}。`,'分两步想：先求每人分到多少，再求放回后手里剩多少。',{type:'arithmetic',a,b,result:r,op,offset,step2:'－',c,final:r-c});
  }
  let prompt,answer,explanation,hint;
  const equation=`${a} ${op} ${b} ＝ ${r}`;
  if(dimension==='fill') {
   const unknownFirst=level===2||t.id==='cnm_p025';
   prompt=unknownFirst?`□ ${op} ${b} ＝ ${r}`:`${a} ${op} □ ＝ ${r}`;
   answer=unknownFirst?a:b;explanation=`把 ${answer} 代入：${equation}。`;hint='用相反的运算寻找缺少的数，再代回检验。';
  } else if(dimension==='reverse') {
   prompt=`想一个数，把它${op==='＋'?`加上 ${b}`:op==='－'?`减去 ${b}`:op==='×'?`乘 ${b}`:`除以 ${b}`}，结果是 ${r}。原来的数是多少？`;
   if(level===2)prompt=`想一个数，把它${op==='＋'?`加上 ${b}`:op==='－'?`减去 ${b}`:op==='×'?`乘 ${b}`:`除以 ${b}`}后，再减去 ${offset}，得到 ${r-offset}。原来的数是多少？`;
   answer=a;explanation=`${level===2?`先还原减去的 ${offset}，得到 ${r}；`:''}再逆推，代回检验：${equation}。`;hint='从最后的结果开始，按相反顺序一步步还原。';
  } else if(dimension==='reasoning') {
   const truth=((a+b)/unit)%2===0;
   prompt=`小林说：“${a} ${op} ${b} 的结果比 ${offset} 多 ${r-offset+(truth?0:unit)}。”这个说法正确吗？写出实际多的数量，并说明理由。`;
   answer=r-offset;explanation=`先算 ${equation}，再算 ${r}－${offset}＝${answer}。小林的说法${truth?'正确':'不正确'}。`;hint='独立算出结果，再比较数量关系。';
   return originalQuestion(t,dimension,level,prompt,answer,explanation,hint,{type:'arithmetic',a,b,result:r,op,offset,claimTruth:truth});
  } else {
   prompt=op==='＋'?`盒里有 ${a} 张卡片，又放入 ${b} 张，现在有多少张？`:op==='－'?`有 ${a} 张卡片，送出 ${b} 张，还剩多少张？`:op==='×'?`每袋有 ${a} 颗珠子，${b} 袋一共有多少颗？`:`把 ${a} 张卡片平均分给 ${b} 人，每人有多少张？`;
   answer=r;explanation=`${op==='＋'?'合并':op==='－'?'求剩余':op==='×'?'求相同数量的总数':'平均分'}，${equation}。`;hint='先判断是合并、去掉、相同的几份，还是平均分。';
   if(level===2){
    prompt=op==='＋'?`盒里有 ${a} 张卡片，又放入 ${b} 张，然后再拿走 ${offset} 张，剩多少张？`:op==='－'?`有 ${a} 张卡片，先送出 ${b} 张，然后再拿走 ${offset} 张，还剩多少张？`:op==='×'?`每袋有 ${a} 颗珠子，把 ${b} 袋合在一起，然后再拿走 ${offset} 颗，还剩多少颗？`:`把 ${a} 张卡片平均分给 ${b} 人，小明是其中一人。再拿走小明分到的卡片中的 ${offset} 张，小明还剩多少张？`;
    answer=r-offset;explanation+=`再拿走用减法：${r}－${offset}＝${answer}。`;hint='先求第一步的数量，再处理拿走的数量。';
   }
  }
  return originalQuestion(t,dimension,level,prompt,answer,explanation,hint,{type:'arithmetic',a,b,result:r,op,offset});
 }).filter(Boolean);
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
 question=toQuestionV2(question);
 if(question.answerSpec.kind==='quantity'||question.answerSpec.kind==='tuple'||value&&typeof value==='object')return assessTypedAnswer(question,value).status==='correct';
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
function validateOptions(catalog,options) {
 validateCatalog(catalog);
 if(!options||![1,2,3].includes(options.grade)||!['all','上','下'].includes(options.semester)||!Array.isArray(options.dimensions)||!options.dimensions.length||options.dimensions.some(d=>!DIMENSIONS.some(x=>x.id===d))||![1,2,3].includes(options.level)||![6,12,18].includes(options.count)||typeof options.seed!=='string'||!options.seed.trim()||options.seed.length>120)throw new TypeError('练习选项无效');
 if(options.topicId!=='all'&&!catalog.topics.some(t=>t.id===options.topicId&&t.grade===options.grade))throw new RangeError('知识点不属于所选年级');
}
export function generateCandidates(catalog,options) {
 validateOptions(catalog,options);
 const {grade,semester,topicId,dimensions,level,seed}=options,pool=[],warnings=[];
 const selected=catalog.topics.filter(t=>t.grade===grade&&(semester==='all'||t.semester===semester)&&(topicId==='all'||t.id===topicId));
 const dimensionIds=[...new Set(dimensions)];
 for(const topic of selected) {
  for(const dimension of dimensionIds) {
   const rng=random(`${seed}\0${topic.id}\0${dimension}\0${level}`);
   const authored=pilotCandidates(topic,dimension,level,rng);
   if(authored!==null)pool.push(...authored);
   else if(dimension!=='basic')pool.push(...generateOriginal(topic,dimension,level,rng));
  }
  if(dimensions.includes('basic'))for(const original of catalog.questions.filter(q=>q.topicId===topic.id&&q.difficulty===(level===1?'basic':level===2?'standard':'__none'))) {
   if(excludedSourceIds.has(original.id))continue;
   const q=toQuestionV2({...original,topicName:topic.name,grade:topic.grade,dimension:'basic',level,hint:'先读题，再结合这个知识点想一想。',source:'taxonomy'});
   q.fingerprint=fingerprint(q);pool.push(q);
  }
 }
 const seen=new Set(),questions=[];
 for(const q of pool) {
  const key=q.fingerprint||fingerprint(q);if(seen.has(key))continue;seen.add(key);
  q.prerequisites=[...new Set([...(q.prerequisites||[]),...catalog.dependencies.filter(e=>e.topicId===q.topicId).map(e=>e.prerequisiteId)])];
  questions.push(q);
 }
 for(const id of dimensionIds)if(!questions.some(q=>q.dimension===id))warnings.push(`当前知识点与难度暂不支持“${DIMENSIONS.find(d=>d.id===id).label}”，不会替换成其他维度。`);
 return {questions,warnings,seed,requestedCount:options.count,versions:{schema:2,engine:ENGINE_VERSION,catalog:CATALOG_VERSION},inventory:'bounded-candidate-pool'};
}
export function getAvailability(catalog,options) {
 const result=generateCandidates(catalog,options),seen=new Set();
 const unique=qs=>qs.filter(q=>{const key=questionDedupKey(q);if(seen.has(key))return false;seen.add(key);return true;});
 const questions=unique(result.questions);
 return {availableCount:questions.length,templateCount:new Set(questions.map(q=>q.familyId)).size,
  dimensions:[...new Set(options.dimensions)].map(id=>{const qs=result.questions.filter(q=>q.dimension===id),keys=new Set();const distinct=qs.filter(q=>{const key=questionDedupKey(q);if(keys.has(key))return false;keys.add(key);return true;});return {id,level:options.level,availableCount:distinct.length,templateCount:new Set(distinct.map(q=>q.familyId)).size};}),
  warnings:result.warnings,inventory:'当前种子的有限候选池；大数域为有界采样，不声称数学上限。'};
}
export function assessAnswer(question,value){return assessTypedAnswer(question,value);}
export function generateWorksheet(catalog,options) {
 const result=generateCandidates(catalog,options),rng=random(`${options.seed}\0selection`),questions=[],seen=new Set();
 const queues=[...new Set(options.dimensions)].map(d=>shuffle(result.questions.filter(q=>q.dimension===d),rng));
 while(questions.length<options.count&&queues.some(q=>q.length))for(const queue of queues){if(questions.length===options.count)break;while(queue.length){const q=queue.pop();if(!seen.has(questionDedupKey(q))){seen.add(questionDedupKey(q));questions.push(q);break;}}}
 const warnings=[...result.warnings];
 if(questions.length<options.count)warnings.push(`本次生成获得 ${questions.length} 道不重复题，未达到 ${options.count} 道；未使用其他难度或知识点补齐。`);
 return {...result,questions,warnings};
}
