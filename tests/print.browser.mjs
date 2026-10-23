import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const base=process.env.UI_BASE_URL||'http://localhost:4191';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto(base);await page.locator('#availability-panel').waitFor();await page.waitForFunction(()=>document.querySelector('#availability-panel')?.textContent.includes('生成前容量核对'));
 assert.equal(await page.locator('#grade').inputValue(),'2');assert.equal(await page.locator('[data-topic="cnm_p047"]').getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('#availability-panel').innerText(),/实际可用/);
 await page.locator('.generate').click();await page.locator('.question-card').first().waitFor({timeout:30000});
 const count=await page.locator('.question-card').count();assert.ok(count>0&&count<=6);
 assert.ok(await page.locator('.worksheet-sections').count());
 await page.locator('#print-answers').check();
 await page.locator('[data-action=preview]').click();
 await page.locator('#print-root .student-page').first().waitFor();
 const model=await page.evaluate(()=>({pages:document.querySelectorAll('#print-root .print-page').length,students:document.querySelectorAll('#print-root .student-page').length,answers:document.querySelectorAll('#print-root .answer-page').length,questions:[...document.querySelectorAll('#print-root .student-page .print-question')].map(q=>({id:q.dataset.questionId,ordinal:q.dataset.ordinal,box:q.getBoundingClientRect().toJSON(),page:q.closest('.print-page').getBoundingClientRect().toJSON(),content:q.closest('.print-page').querySelector('.print-page-content').getBoundingClientRect().toJSON()})),overflow:document.querySelector('#print-root').scrollWidth>innerWidth}));
 assert.ok(model.students>0&&model.answers>0);assert.equal(model.pages,model.students+model.answers);assert.equal(new Set(model.questions.map(q=>q.id)).size,model.questions.length);
 for(const q of model.questions){assert.ok(q.box.top>=q.content.top-1,`question ${q.ordinal} begins before content`);assert.ok(q.box.bottom<=q.content.bottom+1,`question ${q.ordinal} exceeds footer budget`);}
 await page.locator('#preview-audience').selectOption('teacher');await page.waitForTimeout(100);
 assert.equal(await page.locator('#print-root .student-page:visible').count(),0);assert.ok(await page.locator('#print-root .answer-page:visible').count()>0);
 await page.locator('#preview-audience').selectOption('student');
 await page.emulateMedia({media:'print'});await mkdir('artifacts',{recursive:true});await page.pdf({path:'artifacts/ui-print-smoke.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({count,...model,pdf:'artifacts/ui-print-smoke.pdf'}));
} finally {await browser.close();}
