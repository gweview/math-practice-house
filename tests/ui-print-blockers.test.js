import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPrintQuestion,renderTeacherAnswer} from '../src/renderers.js';
test('student MCQ paper prints all given task options, not the answer',()=>{
 const html=renderPrintQuestion({id:'mcq',prompt:'选一选',answer:'SECRET',student:{blocks:[{type:'text',text:'选一选'}],tasks:[{id:'answer',label:'选择',kind:'choice',options:[{key:'A',text:'苹果'},{key:'B',text:'梨'}]}]}},0);
 assert.match(html,/A[^]*苹果/);assert.match(html,/B[^]*梨/);assert.doesNotMatch(html,/SECRET/);
});

test('teacher answer lists labeled typed parts, units, Chinese choices and pending rubric',()=>{
 const q={answer:'10',student:{tasks:[{id:'makeTen',label:'凑十',kind:'number'},{id:'leftover',label:'剩余',kind:'number',unit:'个'},{id:'judgment',label:'判断',kind:'choice',options:[{key:'yes',text:'对'},{key:'no',text:'不对'}]},{id:'checkProduct',label:'验算',kind:'number'},{id:'why',label:'理由',kind:'manual'}]},answerSpec:{kind:'multipart',parts:[{id:'makeTen',spec:{kind:'scalar',value:'10'}},{id:'leftover',spec:{kind:'quantity',value:'3',unit:'个'}},{id:'judgment',spec:{kind:'choice',value:'no'}},{id:'checkProduct',spec:{kind:'scalar',value:'24'}},{id:'why',spec:{kind:'rubric'}}]}};
 const html=renderTeacherAnswer(q,0);
 assert.match(html,/凑十：10/);assert.match(html,/剩余：3 个/);assert.match(html,/判断：不对/);assert.match(html,/验算：24/);assert.match(html,/理由：等待人工核阅/);
});
test('manual question reserves its writing space once, not a duplicate generic blank',()=>{
 const html=renderPrintQuestion({id:'why',prompt:'说明理由',answer:'2',layout:{minWritingMm:30},student:{tasks:[{id:'reason',kind:'manual',label:'理由'}]},answerSpec:{kind:'rubric',manual:true}},0);
 assert.match(html,/manual-space/);assert.doesNotMatch(html,/class="writing-room"/);
});
test('quantity task labels do not repeat an already stated unit on paper',()=>{
 const html=renderPrintQuestion({id:'area',answer:'12',prompt:'求面积',student:{tasks:[{id:'answer',kind:'number',label:'面积（平方厘米）'}]},answerSpec:{kind:'quantity',value:'12',unit:'平方厘米'}},0);
 assert.doesNotMatch(html,/（平方厘米）（平方厘米）/);
});
