import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from '@playwright/test';
const port=4194,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(base);await page.evaluate(()=>document.fonts.ready);
 const result=await page.evaluate(async()=>{
  const {paginatePrint}=await import('/src/print-layout.js');const root=document.createElement('div');document.body.append(root);
  const q={id:'edge',grade:1,topicName:'书写区检查',prompt:'画图并说明你的思路。',answer:'3',explanation:'正确的思路需要教师核阅。',layout:{workspaceKind:'application',preferredSpan:2,minWritingMm:35},student:{blocks:[{type:'text',text:'画图并说明你的思路。'}],tasks:[{id:'answer',label:'结果',kind:'number'}]},answerSpec:{kind:'scalar',value:'3'}};
  await paginatePrint({questions:[q],columns:1,style:'compact',metadata:'一年级全学年 · 不进位两位数与一位数加法 · '+('中文种子'.repeat(30))+' · 来源 cn-math-taxonomy / CC BY-NC 4.0 · AI草稿，未经教师审核，请核对题目与答案',root});
  const header=root.querySelector('.print-page-header').getBoundingClientRect(),content=root.querySelector('.print-page-content').getBoundingClientRect(),writing=root.querySelector('.writing-room').getBoundingClientRect();
  const out={headerBottom:Math.max(header.bottom,...[...root.querySelector('.print-page-header').children].map(n=>n.getBoundingClientRect().bottom)),contentTop:content.top,writingMm:writing.height/(96/25.4)};
  await paginatePrint({questions:Array.from({length:18},(_,i)=>({...q,id:`edge-${i}`,layout:{minWritingMm:8},explanation:'请先用所学方法计算各个数量，明确已知条件和所求目标，再按照题目中的数量关系，检查各个中间结果和最后答案是否符合要求。'})),columns:2,style:'mixed',includeAnswers:true,root});
  out.overflows=[...root.querySelectorAll('.print-page')].flatMap(p=>{const c=p.querySelector('.print-page-content').getBoundingClientRect();return [...p.querySelectorAll('.print-question')].filter(x=>x.getBoundingClientRect().bottom>c.bottom+1).map(x=>x.dataset.ordinal);});
  const engine=await import('/src/engine.js'),planner=await import('/src/planner.js'),catalog=await engine.loadCatalog();
  const plan=await planner.planWorksheet(catalog,{grade:1,semester:'all',topicId:'cnm_p020',dimensions:['basic','fill','reasoning'],level:2,count:6,seed:'v2-production-acceptance',mode:'custom'},engine);
  out.mixedPages=(await paginatePrint({questions:plan.questions,sections:plan.sections,columns:2,style:'mixed',root})).studentPageCount;
  out.mixedGeometry=[...root.querySelectorAll('.student-page')].map(p=>[...p.querySelectorAll('.print-question')].map(q=>({n:q.dataset.ordinal,h:q.getBoundingClientRect().height/(96/25.4),w:q.getBoundingClientRect().width/(96/25.4),children:[...q.children].map(x=>({c:x.className,h:x.getBoundingClientRect().height/(96/25.4)}))})));
  const oral=await planner.planWorksheet(catalog,{grade:1,semester:'all',topicId:'cnm_p010',dimensions:['fill'],level:1,count:18,seed:'v2-production-acceptance',mode:'custom'},engine);
  out.oralPages=(await paginatePrint({questions:oral.questions,sections:oral.sections,columns:2,style:'compact',root})).studentPageCount;
  root.remove();return out;
 });
 assert.ok(result.headerBottom<=result.contentTop-3,`long metadata header overlaps question area: ${JSON.stringify(result)}`);
 assert.ok(result.writingMm>=34.9,`compact preset must not shrink required application space: ${JSON.stringify(result)}`);
 assert.deepEqual(result.overflows,[],'actual teacher and student cards must stay inside measured content budget');console.log('PASS print edges: dynamic metadata, required writing space, teacher packing',result);
 assert.ok(result.mixedPages<=2,`six mixed questions should not waste three pages through half-width measurement of full-width rows: ${JSON.stringify(result)}`);
 assert.equal(result.oralPages,1,'18 short calculations should fit one compact two-column A4 without shrinking type');
}finally{if(browser)await browser.close();server.kill('SIGTERM');}
