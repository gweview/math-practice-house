import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptLegacyQuestion, renderStudentBlocks, renderAnswerControls } from '../src/renderers.js';

test('legacy tuple answers adapt to separate quotient/remainder controls and curated source keys',()=>{
 const tuple=adaptLegacyQuestion({id:'legacy',prompt:'17÷5，求商和余数',answer:'3,2'});
 assert.deepEqual(tuple.student.tasks.map(t=>t.id),['quotient','remainder']);
 const source=adaptLegacyQuestion({id:'cnm_p226_q2',prompt:'5/8的分母是几？',answer:'B',choices:[{key:'A',text:'3'},{key:'B',text:'5'},{key:'C',text:'8'}]});
 assert.equal(source.answer,'C');
});
test('unit-area grids draw the GIVEN number of rows and columns, not an arbitrary background',()=>{
 const html=renderStudentBlocks({student:{blocks:[{type:'diagram',kind:'rectangle',data:{widthUnits:7,heightUnits:3,widthLabel:'7厘米',heightLabel:'3厘米',showGrid:true}}]}});
 assert.match(html,/data-columns="7"/);assert.match(html,/data-rows="3"/);assert.match(html,/<svg/);
 const unknown=renderStudentBlocks({student:{blocks:[{type:'diagram',kind:'rectangle',data:{widthUnits:null,heightUnits:3,showGrid:true,widthLabel:'未知长'}}]}});
 assert.doesNotMatch(unknown,/data-columns=/);
});

test('student diagrams render only whitelisted given facts, never secret visual metadata', () => {
 const q={prompt:'算一算',visual:{answer:'SECRET',type:'array'},student:{blocks:[{type:'diagram',kind:'tenframe',data:{filled:8,added:1,totalSlots:10,answer:'SECRET'}}],tasks:[]}};
 const html=renderStudentBlocks(q);
 assert.match(html,/十格图/); assert.doesNotMatch(html,/SECRET|visual/);
});
test('unknown and malformed diagrams safely fall back to text', () => {
 const html=renderStudentBlocks({student:{blocks:[{type:'diagram',kind:'evil',data:{html:'<script>'}},{type:'text',text:'<img>'}]}});
 assert.doesNotMatch(html,/<script>|<img>/); assert.match(html,/未知图示/);
});
test('legacy question adapts without mutating stored input', () => {
 const q={id:'old',prompt:'1+1',answer:'2',visual:{type:'clock'}};
 const adapted=adaptLegacyQuestion(q);
 assert.equal(adapted.id,'old'); assert.equal(adapted.answerSpec.kind,'scalar'); assert.equal(q.student,undefined);
});
test('multipart controls preserve task ids and manual parts are explicitly pending review', () => {
 const html=renderAnswerControls({student:{tasks:[{id:'quotient',label:'商',kind:'number'},{id:'why',label:'说明理由',kind:'manual'}]}},2,{});
 assert.match(html,/data-task-id="quotient"/); assert.match(html,/data-task-id="why"/); assert.match(html,/等待人工核阅/);
});
test('quantity units and tuple separators are visible in typed answer controls',()=>{
 const quantity=renderAnswerControls({answerSpec:{kind:'quantity',unit:'厘米'},student:{tasks:[{id:'answer',kind:'number'}]}},0,{});
 const tuple=renderAnswerControls({answerSpec:{kind:'tuple'},student:{tasks:[{id:'answer',kind:'text'}]}},1,{});
 assert.match(quantity,/厘米/);assert.match(tuple,/逗号分隔/);
});
test('clock diagram uses an accessible face with hands computed from visible time only',()=>{
 const html=renderStudentBlocks({student:{blocks:[{type:'diagram',kind:'clock',data:{hour:3,minute:30}}],tasks:[]}});
 assert.match(html,/aria-label="钟面示意：3时30分"/);assert.match(html,/<svg/);assert.match(html,/rotate\(105 50 50\)/);
});
test('multipart response controls show per-part assessment without overriding whole-question status',()=>{
 const html=renderAnswerControls({student:{tasks:[{id:'n',label:'商',kind:'number'},{id:'why',label:'理由',kind:'manual'}]}},3,{}, {n:{status:'correct'},why:{status:'manual'}});
 assert.match(html,/data-part-status="correct"/);assert.match(html,/data-part-status="manual"/);assert.match(html,/等待人工核阅/);
});
