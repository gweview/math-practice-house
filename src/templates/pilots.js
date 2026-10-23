import {createQuestion} from '../question-model.js';
const ALLOWED={cnm_p020:['basic','fill','reverse','reasoning','application'],cnm_p018:['basic','fill','reverse','reasoning','application'],cnm_p047:['basic','fill','reverse','reasoning','application'],cnm_p060:['basic','pattern','reasoning'],cnm_p224:['basic','equivalence','reasoning'],cnm_p089:['basic','reverse','reasoning','application']};
const text=value=>({type:'text',text:value});
const diagram=(kind,data)=>({type:'diagram',kind,data});
const scalar=value=>({kind:'scalar',value:String(value)});
const numericTask=(id,label)=>({id,label,kind:'number'});
function make(topic,dimension,level,config){
 const blocks=[text(config.prompt),...(config.blocks||[]).filter(b=>!(b.type==='text'&&b.text===config.prompt))];
 const directSum=dimension==='basic'&&['nine-tenframe-direct','noncarry-place-value'].includes(config.familyId);
 const binaryResult=['nine-tenframe-direct','nine-combine-story','noncarry-place-value','noncarry-story-combine'].includes(config.familyId)&&config.visual?.type==='arithmetic';
 return createQuestion(topic,dimension,level,{hint:'先读清已知条件，再选择表示或计算的方法。',...config,blocks,
  ...(binaryResult?{mathematicalTaskIdentity:{kind:'binary-result',operator:config.visual.op,operands:[config.visual.a,config.visual.b]}}:{}),
  layout:{workspaceKind:dimension==='application'?'application':'short',minWritingMm:dimension==='application'?24:8,preferredSpan:1,keepTogether:true,...config.layout},
  difficultyDescriptor:{steps:directSum||level===1?1:2,reasoningMoves:[config.familyId],support:level===1?'visual':'independent',languageLoad:'low',...config.difficultyDescriptor}});
}
function judgment(topic,dimension,level,config){
 const valueSpec=config.unit?{kind:'quantity',value:String(config.answer),unit:config.unit}:scalar(config.answer);
 const manual=dimension==='reasoning'||config.requireReason===true;
 const tasks=[{id:'judgment',label:config.judgmentLabel||'这个说法正确吗？',kind:'choice',options:[{key:'yes',text:'正确'},{key:'no',text:'不正确'}]},numericTask('answer',config.answerLabel||'实际数量')];
 const parts=[{id:'judgment',spec:{kind:'choice',value:config.truth?'yes':'no'}},{id:'answer',spec:valueSpec}];
 if(manual){tasks.push({id:'reason',label:'请用算式、图或文字说明理由',kind:'manual'});parts.push({id:'reason',spec:{kind:'rubric',manual:true}});}
 return make(topic,dimension,level,{...config,tasks,answerSpec:{kind:'multipart',parts},layout:{workspaceKind:manual?'reasoning':'short',minWritingMm:manual?30:8,preferredSpan:manual?2:1,keepTogether:true}});
}
function nine(topic,d,l){
 const out=[];
 for(let b=2;b<=9;b++){
  const sum=9+b,left=b-1,visual={type:'arithmetic',a:9,b,result:sum,op:'＋'};
  const known=[diagram('tenframe',{filled:9,totalSlots:10}),diagram('array',{rows:1,columns:b})];
  if(d==='reasoning'){
   const truth=b%2===0,k=truth?b-1:b;
   out.push(judgment(topic,d,l,{familyId:'nine-compensation-compare',prompt:`小明认为9＋${b}与10＋${k}相等。请判断，并写出9＋${b}的得数。`,truth,answer:sum,explanation:`9＋${b}＝${sum}；10＋${k}＝${10+k}，两个结果${truth?'相等':'不相等'}。把1从第二个加数移给9时，总数不变。`,blocks:l===1?known:[],visual}));continue;
  }
  if(d==='reverse'||d==='fill'&&l===3){
   const prompt=d==='reverse'?`盘子里原有9颗珠子，放入一些后共有${sum}颗。放入了多少颗？`:`9＋□＝10＋${left}。方框里填几，才能使两边相等？`;
   out.push(make(topic,d,l,{familyId:d==='reverse'?'nine-recover-addend':'nine-compensation-fill',prompt,answer:b,explanation:d==='reverse'?`${sum}－9＝${b}，所以放入${b}颗。`:`10比9多1，左边另一个加数应比${left}多1，是${b}。`,blocks:[diagram('tenframe',{filled:9,totalSlots:10})],visual}));continue;
  }
  if(l===2){
   const prompt=`计算9＋${b}：先把${b}拆成补给9凑成10的一部分和剩余部分，分别填空，再写得数。`;
   out.push(make(topic,d,l,{familyId:'nine-make-ten-decomposition',prompt,answer:sum,explanation:`把${b}分成1和${left}：9＋1＝10，再算10＋${left}＝${sum}。`,blocks:[known[0]],tasks:[numericTask('makeTen','补给9凑成10'),numericTask('leftover','剩余部分'),numericTask('answer','最后得数')],answerSpec:{kind:'multipart',parts:[{id:'makeTen',spec:scalar(1)},{id:'leftover',spec:scalar(left)},{id:'answer',spec:scalar(sum)}]},visual}));continue;
  }
  out.push(make(topic,d,l,{familyId:d==='application'?'nine-combine-story':'nine-tenframe-direct',prompt:d==='application'?`盘子里有9颗葡萄，又放入${b}颗。现在一共有多少颗？`:`9 ＋ ${b} ＝ □。可以用十框图先凑十。`,answer:sum,explanation:`9＋${b}＝9＋1＋${left}＝${sum}。`,blocks:l===1?known:[],visual}));
 }
 return out;
}
function noncarry(topic,d,l){
 const out=[];
 for(let a=11;a<=18;a++)for(let b=1;b<=8;b++)if(a%10+b<10){
  const sum=a+b,visual={type:'arithmetic',a,b,result:sum,op:'＋'};
  if(d==='reasoning'){
   const truth=(a+b)%2===0,claim=a%10+b+(truth?0:-1);
   out.push(judgment(topic,d,l,{familyId:'noncarry-column-judgment',prompt:`计算${a}＋${b}时，小明在个位写${claim}，十位写1。他的写法正确吗？请写出正确得数并说明理由。`,truth,answer:sum,explanation:`个位${a%10}＋${b}＝${a%10+b}，小于10；十位仍是1，得数${sum}。小明的写法${truth?'正确':'不正确'}。`,blocks:[diagram('table',{headers:['加数','十位','个位'],rows:[[String(a),'1',String(a%10)],[String(b),'0',String(b)]]})],visual}));continue;
  }
  let prompt=`${a} ＋ ${b} ＝ □。`,answer=sum,familyId='noncarry-place-value',blocks=[diagram('table',{headers:['加数','十位','个位'],rows:[[String(a),'1',String(a%10)],[String(b),'0',String(b)]]})];
  if(d==='fill'){prompt=l===1?`${a} ＋ □ ＝ ${sum}`:`□ ＋ ${b} ＝ ${sum}`;answer=l===1?b:a;familyId=l===1?'noncarry-missing-addend':'noncarry-missing-first';blocks=[diagram('table',{headers:['已知加数','合计'],rows:[[String(l===1?a:b),String(sum)]]})];}
  if(d==='reverse'){prompt=`一个十几的数加${b}得到${sum}。原来的数是多少？`;answer=a;familyId='noncarry-recover-first';blocks=[];}
  if(d==='application'){prompt=l===3?`书架原有${a}本书，放入一些后共有${sum}本。放入多少本？`:`书架原有${a}本书，又放入${b}本。现在共有多少本？`;answer=l===3?b:sum;familyId=l===3?'noncarry-story-unknown-change':'noncarry-story-combine';blocks=[];}
  if(d==='basic'&&l===2){
   out.push(make(topic,d,l,{familyId:'noncarry-place-decomposition',prompt:`${a}＋${b}的个位和是几？十位是多少个十？最后得数是多少？`,answer:sum,explanation:`个位和${a%10+b}，十位1个十，得数${sum}。`,blocks,tasks:[numericTask('ones','个位和'),numericTask('tens','几个十'),numericTask('answer','得数')],answerSpec:{kind:'multipart',parts:[{id:'ones',spec:scalar(a%10+b)},{id:'tens',spec:scalar(1)},{id:'answer',spec:scalar(sum)}]},visual,difficultyDescriptor:{carry:'no-carry',numberRange:20}}));continue;
  }
  out.push(make(topic,d,l,{familyId,prompt,answer,explanation:`${a}＋${b}＝${sum}；个位相加不满10。把${answer}放回题目可检验数量关系。`,blocks,visual,difficultyDescriptor:{carry:'no-carry',numberRange:20}}));
 }
 return out;
}
function verification(topic,d,l){
 const out=[];
 for(let divisor=2;divisor<=9;divisor++)for(let quotient=2;quotient<=9;quotient++){
  const product=divisor*quotient,truth=(divisor+quotient)%2===0,claim=truth?quotient:quotient-1;
  const table=diagram('table',{headers:['被除数','除数','写出的商'],rows:[[String(product),String(divisor),String(claim)]]});
  if(d==='reasoning'){
   out.push(judgment(topic,d,l,{familyId:l===3?'division-compare-verifications':'division-judge-quotient',prompt:l===3?`小明用${claim}×${divisor}验算${product}÷${divisor}，认为商是${claim}。这个验算能通过吗？写出正确的商并说明判断依据。`:`小明写${product}÷${divisor}＝${claim}。请用乘法判断是否正确，再写出正确的商。`,truth,answer:quotient,explanation:`${quotient}×${divisor}＝${product}；${claim}×${divisor}＝${claim*divisor}。验算${truth?'通过':'不通过'}，正确商是${quotient}。`,blocks:[table]}));continue;
  }
  if(d==='basic'){
   out.push(judgment(topic,d,l,{familyId:'division-product-check',prompt:`有人写${product}÷${divisor}＝${claim}。先算${claim}×${divisor}的乘积，再判断这道除法是否验算通过。`,truth,answer:claim*divisor,answerLabel:'商与除数的乘积',explanation:`${claim}×${divisor}＝${claim*divisor}，${truth?'等于':'不等于'}被除数${product}，所以${truth?'通过':'未通过'}。`,blocks:l===1?[table,diagram('array',{rows:claim,columns:divisor})]:[table]}));continue;
  }
  if(d==='reverse'){
   out.push(make(topic,d,l,{familyId:'division-recover-divisor',prompt:`${product}÷□＝${quotient}。除数是多少？再填写“商×除数”的乘积，检查是否等于${product}。`,answer:divisor,explanation:`${quotient}×${divisor}＝${product}，所以除数是${divisor}。`,blocks:[diagram('table',{headers:['被除数','商'],rows:[[String(product),String(quotient)]]})],tasks:[numericTask('answer','除数'),numericTask('checkProduct','商×除数的乘积')],answerSpec:{kind:'multipart',parts:[{id:'answer',spec:scalar(divisor)},{id:'checkProduct',spec:scalar(product)}]}}));continue;
  }
  out.push(make(topic,d,l,{familyId:d==='application'?'division-distribution-verification':'division-fact-family',prompt:d==='application'?`把${product}张卡片平均分给${divisor}人。每人几张？填写每人张数，再用“每人张数×人数”的乘积检验总数。`:`${product}÷${divisor}＝□。求商，再填写“商×${divisor}”的乘积完成验算。`,answer:quotient,explanation:`商是${quotient}，${quotient}×${divisor}＝${product}，与被除数相等。`,blocks:[diagram('table',{headers:['总数','等分份数'],rows:[[String(product),String(divisor)]]})],tasks:[numericTask('answer','商／每份数量'),numericTask('checkProduct','验算乘积')],answerSpec:{kind:'multipart',parts:[{id:'answer',spec:scalar(quotient)},{id:'checkProduct',spec:scalar(product)}]}}));
 }
 return out;
}
function patterns(topic,d,l){
 const out=[];
 for(let start=1;start<=20;start++)for(let step=1;step<=4;step++)for(const kind of ['constant','alternating','growing']){
  const delta=step+2,terms=[start];for(let i=0;i<5;i++)terms.push(terms.at(-1)+(kind==='constant'?step:kind==='alternating'?(i%2===0?step:delta):step*(i+1)));
  const index=l===3?3:5,answer=terms[index],visible=terms.map((v,i)=>i===index?'□':String(v));
  const rule=kind==='constant'?(l===1?`每次加${step}`:'相邻两项增加同一个固定数'):kind==='alternating'?(l===1?`交替加${step}、加${delta}，从加${step}开始`:'两种固定步长交替增加，从第一步开始重复'):`相邻两项的差依次是${step}、${step*2}、${step*3}……`;
  const familyId=`pattern-${kind}-${index===3?'inside':'next'}`;
  const sequence=diagram('sequence',{items:visible});
  if(d==='reasoning'){
   const truth=(start+step)%2===0,claim=answer+(truth?0:1);
   out.push(judgment(topic,d,l,{familyId:`${familyId}-judge`,prompt:`规则类别：${rule}。数列${visible.join('、')}。有人认为方框应填${claim}，这个判断正确吗？填写实际应填的数并说明理由。`,truth,answer,explanation:`按给定规则逐项计算为${terms.join('、')}，方框是第${index+1}项${answer}，说法${truth?'正确':'不正确'}。`,blocks:[sequence]}));
  }else out.push(make(topic,d,l,{familyId,prompt:`规则类别：${rule}。请填空：${visible.join('、')}。`,answer,explanation:`依次得到${terms.join('、')}，方框应填${answer}。`,blocks:[sequence]}));
 }
 return out;
}
function weights(topic,d,l){
 const out=[];
 for(let ratio=2;ratio<=8;ratio++)for(let unit=2;unit<=12;unit++){
  const second=2+(unit%3),blue=l===2?second*unit:unit,red=ratio*blue,total=red+blue;
  const relation=`1袋红珠与${ratio}袋蓝珠一样重。`;
  const known=l===1?`1袋蓝珠重${blue}克。`:l===2?`1袋蓝珠与${second}袋绿珠一样重，1袋绿珠重${unit}克。`:`1袋红珠和1袋蓝珠一共重${total}克。`;
  const familyId=l===1?'weight-direct-substitution':l===2?'weight-chain-substitution':'weight-total-substitution';
  const blocks=[diagram('balance',{left:[{symbol:'红袋',count:1}],right:[{symbol:'蓝袋',count:ratio}]})];
  if(l===2)blocks.push(diagram('balance',{left:[{symbol:'蓝袋',count:1}],right:[{symbol:'绿袋',count:second}]}));
  if(l===3)blocks.push(diagram('table',{headers:['组合','总重量'],rows:[['红袋＋蓝袋',`${total}克`]]}));
  const explanation=l===1?`${ratio}×${blue}＝${red}克。`:l===2?`蓝袋重${second}×${unit}＝${blue}克，红袋重${ratio}×${blue}＝${red}克。`:`红袋换成${ratio}袋蓝袋，共${ratio+1}袋蓝袋重${total}克。蓝袋重${total}÷${ratio+1}＝${blue}克，红袋重${red}克。`;
  if(d==='reasoning'){
   const truth=(ratio+unit)%2===0,claim=red+(truth?0:1);
   out.push(judgment(topic,d,l,{familyId:`${familyId}-judge`,prompt:`${relation}${known}每种珠子每袋重量相同。有人说红袋重${claim}克，正确吗？填写红袋实际重量并说明代换过程。`,truth,answer:red,unit:'克',explanation:`${explanation}所以给出的说法${truth?'正确':'不正确'}。`,blocks}));
  }else out.push(make(topic,d,l,{familyId,prompt:`${relation}${known}每种珠子每袋重量相同。1袋红珠重多少克？`,answer:red,explanation,blocks,tasks:[numericTask('answer','红袋重量（克）')],answerSpec:{kind:'quantity',value:String(red),unit:'克',aliases:['g']},visual:{type:'equivalence',ratio,blue,green:unit,secondRatio:second,total}}));
 }
 return out;
}
function areas(topic,d,l){
 const out=[];
 for(let width=2;width<=9;width++)for(let length=width+1;length<=12;length++){
  const area=width*length,strip=1+(width%2),rectangle=(w,h,wl,hl,grid)=>diagram('rectangle',{widthUnits:w,heightUnits:h,widthLabel:wl,heightLabel:hl,showGrid:grid});
  if(d==='reasoning'){
   const truth=(width+length)%2===0,newLength=truth?width:length+1,newWidth=truth?length:width-1,newArea=newLength*newWidth,difference=Math.abs(area-newArea);
   out.push(judgment(topic,d,l,{familyId:'area-equal-perimeter-compare',prompt:`两个长方形边长分别为${length}厘米与${width}厘米、${newLength}厘米与${newWidth}厘米。它们的面积相等吗？写出面积相差多少平方厘米，并说明理由。`,truth,answer:difference,answerLabel:'面积相差（平方厘米）',unit:'平方厘米',explanation:`两者周长都为${2*(length+width)}厘米；面积分别为${area}和${newArea}平方厘米，相差${difference}平方厘米。面积${truth?'相等':'不相等'}。`,blocks:[rectangle(length,width,`${length}厘米`,`${width}厘米`,l===1),rectangle(newLength,newWidth,`${newLength}厘米`,`${newWidth}厘米`,l===1)],prerequisites:['cnm_p078']}));continue;
  }
  if(d==='reverse'){
   const perimeter=2*(length+width),remaining=(length-strip)*width;
   const prompt=l===1?`长方形面积为${area}平方厘米，宽${width}厘米，长是多少厘米？`:l===2?`长方形周长为${perimeter}厘米，宽${width}厘米，面积是多少平方厘米？`:`长方形宽${width}厘米，沿长切去${strip}厘米后剩下面积为${remaining}平方厘米。原来的长是多少厘米？`;
   const answer=l===2?area:length,unit=l===2?'平方厘米':'厘米';
   out.push(make(topic,d,l,{familyId:l===1?'area-recover-side':l===2?'area-from-perimeter':'area-restore-cut-side',prompt,answer,explanation:l===1?`${area}÷${width}＝${length}厘米。`:l===2?`长为${perimeter}÷2－${width}＝${length}厘米，面积${length}×${width}＝${area}平方厘米。`:`剩余长${remaining}÷${width}＝${length-strip}厘米，原长${length-strip}＋${strip}＝${length}厘米。`,blocks:[rectangle(null,width,'未知长',`宽${width}厘米`,false),text('示意图不按比例，不能通过数格得到未知边长。')],tasks:[numericTask('answer',`答案（${unit}）`)],answerSpec:{kind:'quantity',value:String(answer),unit,aliases:l===2?['cm²','cm2']:['cm']},prerequisites:l===2?['cnm_p078']:[]}));continue;
  }
  const cut=l===3?strip:0,answer=(length-cut)*width;
  out.push(make(topic,d,l,{familyId:l===1?'area-unit-grid':l===2?'area-independent-formula':'area-after-cut',prompt:l===3?`长方形长${length}厘米、宽${width}厘米。沿长切去${cut}厘米，剩余部分面积是多少平方厘米？`:l===2?`长方形长${length}厘米、宽${width}厘米。请用面积公式求出面积是多少平方厘米。`:`长方形长${length}厘米、宽${width}厘米。每格1平方厘米，面积是多少平方厘米？`,answer,explanation:l===3?`剩余长${length}－${cut}＝${length-cut}厘米，面积${length-cut}×${width}＝${answer}平方厘米。`:l===2?`长方形面积＝长×宽，${length}×${width}＝${area}平方厘米。`:`每行${length}格，共${width}行，${length}×${width}＝${area}平方厘米。`,blocks:[rectangle(length,width,`长${length}厘米`,`宽${width}厘米`,l===1)],tasks:[numericTask('answer','面积（平方厘米）')],answerSpec:{kind:'quantity',value:String(answer),unit:'平方厘米',aliases:['cm²','cm2']},layout:{workspaceKind:d==='application'?'application':'short',minWritingMm:l===3?24:8}}));
 }
 return out;
}
export function pilotCandidates(topic,dimension,level,rng=Math.random){
 if(!ALLOWED[topic?.id])return null;
 if(!ALLOWED[topic.id].includes(dimension)||![1,2,3].includes(level))return [];
 const expectedGrade=['cnm_p020','cnm_p018'].includes(topic.id)?1:['cnm_p047','cnm_p060'].includes(topic.id)?2:3;
 if(topic.grade!==expectedGrade)return [];
 return ({cnm_p020:nine,cnm_p018:noncarry,cnm_p047:verification,cnm_p060:patterns,cnm_p224:weights,cnm_p089:areas}[topic.id])(topic,dimension,level,rng);
}
