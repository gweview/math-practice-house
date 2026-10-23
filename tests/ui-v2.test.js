import test from 'node:test';
import assert from 'node:assert/strict';
import { modeDescription, renderQuestion } from '../src/main.js';

test('mode descriptions make exact and mixed-tier policies explicit',()=>{
 assert.match(modeDescription('custom',2),/严格使用进阶/);
 assert.match(modeDescription('daily',2),/混合起步至进阶/);
 assert.match(modeDescription('thinking',3),/混合起步至挑战/);
 assert.match(modeDescription('remediation'),/单次错误不用于诊断/);
});
test('student renderer shows safe given blocks and pending manual review, never visual answer metadata',()=>{
 const html=renderQuestion({id:'q',prompt:'旧题',answer:'9',visual:{answer:'LEAK'},student:{blocks:[{type:'text',text:'请观察图示'},{type:'diagram',kind:'tenframe',data:{filled:8,answer:'LEAK'}}],tasks:[{id:'n',label:'结果',kind:'number'},{id:'why',label:'说明理由',kind:'manual'}]},answerSpec:{kind:'multipart',parts:[],manual:true}},0);
 assert.match(html,/十格图/);assert.match(html,/等待人工核阅/);assert.match(html,/不会把整题标为完全正确/);assert.doesNotMatch(html,/LEAK|>9</);
});
