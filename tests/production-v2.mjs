import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const port=4192,base=`http://127.0.0.1:${port}`,dir='artifacts/v2';
await mkdir(dir,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'inherit'});
let browser;
try{
 let ready=false;
 for(let i=0;i<100;i++){try{ready=(await fetch(base)).ok;}catch{}if(ready)break;if(server.exitCode!==null)throw Error('Preview server exited');await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready,'built preview must start');
 browser=await chromium.launch({args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
 const errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
 const cases=[];
 const defaultTopics={1:'cnm_p020',2:'cnm_p047',3:'cnm_p224'};
 const dims={1:['basic','fill','reasoning'],2:['basic','fill','reasoning'],3:['basic','equivalence']};
 for(const grade of [1,2,3])for(const count of [6,12,18])for(const columns of [1,2])for(const answers of [false,true])cases.push({grade,topic:defaultTopics[grade],count,columns,answers,level:2,dimensions:dims[grade],mode:'custom',style:'mixed'});
 for(const [grade,topic,dimensions] of [[1,'cnm_p020',['basic','fill','reasoning']],[1,'cnm_p018',['basic','fill','reasoning']],[2,'cnm_p047',['basic','fill','reasoning']],[2,'cnm_p060',['pattern']],[3,'cnm_p224',['equivalence']],[3,'cnm_p089',['basic','reverse','reasoning']]])cases.push({grade,topic,dimensions,count:12,columns:2,answers:true,level:3,mode:'thinking',style:'thinking'});
 for(const [grade,topic] of [[1,'cnm_p010'],[2,'cnm_p039'],[3,'cnm_p074']])cases.push({grade,topic,dimensions:['fill'],count:18,columns:2,answers:false,level:1,mode:'custom',style:'compact'});
 const report=[];
 await writeFile(`${dir}/production-matrix.json`,JSON.stringify({complete:false,cases:[],pageErrors:errors,failedRequests:failed},null,2));
 for(const [index,spec] of cases.entries()){
  await page.emulateMedia({media:'screen'});await page.goto(base);await page.locator('.generate').waitFor();
  await page.locator('#grade').selectOption(String(spec.grade));
  await page.locator(`[data-topic="${spec.topic}"]`).click();
  const mode=page.locator('#mode,select[name="mode"]').first();assert.equal(await mode.count(),1,'mode selector required');await mode.selectOption(spec.mode);
  for(const input of await page.locator('[name=dimensions]').all()){const val=await input.inputValue();if(await input.isChecked()!==spec.dimensions.includes(val))await input.locator('..').click();}
  await page.locator(`label:has([name=level][value="${spec.level}"])`).click();await page.locator(`label:has([name=count][value="${spec.count}"])`).click();await page.locator('#seed').fill('v2-production-acceptance');
  await page.locator('.generate').click();await page.locator('.question-card').first().waitFor();
  const actual=await page.locator('.question-card').count();assert.equal(actual,spec.count,'these acceptance combinations have sufficient verified capacity');
  await page.locator('#columns').selectOption(String(spec.columns));
  const style=page.locator('#print-style,select[name="printStyle"],select[name="print-style"]').first();assert.equal(await style.count(),1,'print preset selector required');await style.selectOption(spec.style);
  await page.locator('#print-answers').setChecked(spec.answers);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.querySelectorAll('#print-root .student-page').length>0);
  // Two frames plus a short settling check allow the async measurement/pack pass to finish.
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const downloadWait=page.waitForEvent('download');await page.locator('[data-action=export]').click();const download=await downloadWait;
  const payload=JSON.parse(await readFile(await download.path(),'utf8'));const worksheet=payload.worksheet;
  assert.ok(worksheet?.questions?.length===actual,'export and online cards must agree');
  await page.emulateMedia({media:'print'});
  const geometry=await page.evaluate(()=>{
   const pages=[...document.querySelectorAll('#print-root .print-page')];
   const student=pages.filter(p=>p.classList.contains('student-page')),teacher=pages.filter(p=>p.classList.contains('answer-page'));
   const qblocks=student.flatMap(p=>[...p.querySelectorAll('.print-question')]);
   const defects=[];
   for(const p of pages){const r=p.getBoundingClientRect();if(Math.abs(r.width-210*96/25.4)>3||Math.abs(r.height-297*96/25.4)>3)defects.push('A4 container size');
    const qs=[...p.querySelectorAll('.print-question')];if(p.classList.contains('student-page')&&!qs.length)defects.push('empty student page');
    const f=p.querySelector('footer');const fr=f?.getBoundingClientRect();
    for(const q of qs){const b=q.getBoundingClientRect();if(b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1)defects.push('question outside A4');if(fr&&b.bottom>fr.top+1)defects.push('question overlaps footer');if(q.scrollWidth>q.clientWidth+2)defects.push('question horizontal overflow');}
   }
   return {pages:pages.length,students:student.length,answers:teacher.length,questionCount:qblocks.length,questionIds:qblocks.map(q=>q.dataset.questionId),defects,studentText:student.map(p=>p.textContent)};
  });
  assert.deepEqual(geometry.defects,[],JSON.stringify({spec,geometry}));assert.equal(geometry.questionCount,actual,'every question exactly once in student pages');
  const ids=worksheet.questions.map(q=>q.id);assert.equal(new Set(geometry.questionIds).size,actual,'printed question identities unique');assert.deepEqual([...geometry.questionIds].sort(),[...ids].sort());
  assert.equal(geometry.answers>0,spec.answers,'teacher pages obey explicit checkbox');
  const stem=`${String(index+1).padStart(2,'0')}-g${spec.grade}-${spec.topic}-l${spec.level}-${spec.mode}-${spec.style}-n${spec.count}-c${spec.columns}-${spec.answers?'answers':'student'}`;
  await page.pdf({path:`${dir}/${stem}.pdf`,format:'A4',printBackground:true,preferCSSPageSize:true});
  report.push({...spec,includeAnswers:spec.answers,stem,actual,...geometry,studentText:undefined,questions:worksheet.questions.map(q=>({id:q.id,ordinal:worksheet.questions.indexOf(q)+1,prompt:q.prompt,explanation:q.explanation,answer:q.answer,schemaVersion:q.schemaVersion}))});
  await writeFile(`${dir}/production-matrix.json`,JSON.stringify({complete:false,cases:report,pageErrors:errors,failedRequests:failed},null,2));
  await page.emulateMedia({media:'screen'});
  if(index===0||index===36||index===39||index===40)await page.screenshot({path:`${dir}/${stem}.png`,fullPage:true});
  console.log(`PRINT ${index+1}/${cases.length}: ${stem} ${actual} questions ${geometry.pages} pages`);
 }
 await page.goto(base);await page.locator('.generate').waitFor();await page.screenshot({path:`${dir}/home-desktop.png`,fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${dir}/home-mobile.png`,fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 await writeFile(`${dir}/production-matrix.json`,JSON.stringify({complete:true,cases:report,pageErrors:errors,failedRequests:failed,mobileOverflow:false},null,2));
 console.log(`PASS: ${report.length} production configurations, no page errors/resource failures/overflow`);
}finally{if(browser)await browser.close();server.kill('SIGTERM');}
