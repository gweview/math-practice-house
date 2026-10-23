import {renderPrintQuestion,renderTeacherAnswer} from './renderers.js';
const styles=new Set(['compact','mixed','thinking']);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MM=96/25.4,CONTENT_WIDTH=182,CAPACITY=230;
const sectionFor=(q,sections)=>sections.find(s=>(s.questionIds||[]).includes(q.id));
const sectionHTML=s=>`<h2 class="print-section-heading">${esc(s.title||s.name||'练习区')}</h2>`;
function pageMarkup({title,metadata,number,total,content,teacher=false}){
 return `<section class="print-page ${teacher?'answer-page':'student-page'}" data-page="${number}" aria-label="${teacher?'教师答案':'学生练习'}第${number}页"><header class="print-page-header"><h1>${esc(title||'数学练习屋')}</h1>${metadata?`<p>${esc(metadata)}</p>`:''}${!teacher&&number===1?'<p class="name-line">姓名：________________　日期：________________</p>':''}</header><div class="print-page-content">${content}</div><footer class="print-page-footer"><span>${teacher?'教师参考页':'来源 cn-math-taxonomy · CC BY-NC 4.0 · AI草稿请教师核对'}</span><span>${number} / ${total}</span></footer></section>`;
}
async function makePages({questions,sections,columns,style,title,metadata,teacher=false}){
 const colWidth=columns===2?(CONTENT_WIDTH-8)/2:CONTENT_WIDTH;
 const measure=document.createElement('div');measure.className=`print-measure style-${style} columns-${columns}`;
 measure.style.cssText=`position:absolute;left:-20000px;top:0;width:${CONTENT_WIDTH}mm;visibility:hidden;`;
 document.body.append(measure);
 try{
  await document.fonts?.ready;
  const height=(html,width)=>{const probe=document.createElement('div');probe.style.cssText=`width:${width}mm;display:flow-root;`;probe.innerHTML=html;measure.append(probe);const h=probe.getBoundingClientRect().height/MM;probe.remove();return h;};
  const items=questions.map((q,i)=>({q,ordinal:i+1,section:sectionFor(q,sections),span:Number(q.layout?.preferredSpan)===2||['reasoning','drawing','application'].includes(q.layout?.workspaceKind),html:teacher?renderTeacherAnswer(q,i,{detailed:true}):renderPrintQuestion(q,i,{ordinal:i+1,style})}));
  const pages=[];let page={rows:[],used:0,section:null};
  const flush=()=>{if(page.rows.length){pages.push(page);page={rows:[],used:0,section:null};}};
  const sectionHeights=new Map();
  for(let i=0;i<items.length;){
   const a=items[i],b=items[i+1];let pair=columns===2&&b&&!a.span&&!b.span&&a.section?.id===b.section?.id?b:null;
   // Measure the width actually rendered: an unpaired row spans the sheet.
   let rowItems=pair?[a,pair]:[a],rowHeight=Math.max(...rowItems.map(item=>height(item.html,pair?colWidth:CONTENT_WIDTH)));
   if(pair&&rowHeight>CAPACITY){pair=null;rowItems=[a];rowHeight=height(a.html,CONTENT_WIDTH);}
   if(rowHeight>CAPACITY)throw new RangeError(`第 ${a.ordinal} 题需要约 ${Math.ceil(rowHeight)} mm，超过单页可用高度 ${CAPACITY} mm；请调整书写区或拆分任务。`);
   if(a.section&&!sectionHeights.has(a.section.id))sectionHeights.set(a.section.id,height(sectionHTML(a.section),CONTENT_WIDTH));
   const sectionHeight=a.section?sectionHeights.get(a.section.id):0;
   let heading=a.section&&a.section.id!==page.section?a.section:null;
   if(page.rows.length&&page.used+(heading?sectionHeight:0)+rowHeight+2>CAPACITY){flush();heading=a.section||null;}
   if(rowHeight+(heading?sectionHeight:0)>CAPACITY)throw new RangeError(`第 ${a.ordinal} 题连同分区标题超出单页，请拆分任务。`);
   page.rows.push({section:heading,items:rowItems});page.used+=(heading?sectionHeight:0)+rowHeight+2;page.section=a.section?.id||page.section;i+=pair?2:1;
  }
  flush();
  return pages.map((p,pi)=>pageMarkup({title,metadata,number:pi+1,total:pages.length,teacher,content:`<div class="print-columns columns-${columns} style-${style}">${p.rows.map(row=>`${row.section?sectionHTML(row.section):''}<div class="print-row ${row.items.length===1?'one-item':''} ${row.items.some(x=>x.span)?'span-row':''}">${row.items.map(x=>x.html).join('')}</div>`).join('')}</div>`}));
 }finally{measure.remove();}
}
export async function paginatePrint({questions=[],sections=[],columns=2,style='mixed',includeAnswers=false,root,metadata='',title='数学练习单'}){
 if(![1,2].includes(Number(columns)))throw new RangeError('columns must be 1 or 2');
 if(!styles.has(style))throw new RangeError('style must be compact, mixed, or thinking');
 if(!root||typeof root.replaceChildren!=='function')throw new TypeError('root is required');
 const warnings=[];
 if(!questions.length){root.replaceChildren();return {pageCount:0,studentPageCount:0,answerPageCount:0,warnings:['没有题目可分页；学生预览为空。']};}
 const students=await makePages({questions,sections,columns:Number(columns),style,title,metadata});
 const answers=includeAnswers?await makePages({questions,sections:[],columns:1,style:'compact',title:`${title} · 教师答案`,metadata,teacher:true}):[];
 const container=document.createElement('div');container.className='print-document';container.innerHTML=[...students,...answers].join('');root.replaceChildren(container);
 return {pageCount:students.length+answers.length,studentPageCount:students.length,answerPageCount:answers.length,warnings};
}
