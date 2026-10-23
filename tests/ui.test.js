import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as ui from '../src/main.js';
test('browser smoke creates a portable screenshot artifact directory', async () => {
 const smoke=await readFile(new URL('./ui.browser.mjs',import.meta.url),'utf8');
 assert.match(smoke,/await mkdir\('artifacts',\{recursive:true\}\)/);
 assert.match(smoke,/page\.screenshot\(\{path:'artifacts\/mobile-ui\.png',fullPage:true\}\)/);
 assert.doesNotMatch(smoke,/\/home\/ubuntu\//);
});

test('topic filters combine grade, semester, domain and search without mutation', () => {
 const topics = [{id:'a',grade:2,semester:'上',domain:'数与代数',name:'乘法口诀',chapter:'第二单元'}, {id:'b',grade:1,semester:'上',domain:'数与代数',name:'乘法'}];
 assert.deepEqual(ui.filterTopics(topics,{grade:2,semester:'上',domain:'数与代数',search:'口诀'}).map(x=>x.id), ['a']);
 assert.equal(topics.length,2);
});
test('invalid settings are rejected rather than silently changed', () => {
 assert.match(ui.validateSettings({grade:4,semester:'all',dimensions:['basic'],level:1,count:6,seed:'a'}), /年级/);
 assert.match(ui.validateSettings({grade:2,semester:'all',dimensions:[],level:1,count:6,seed:'a'}), /维度/);
 assert.match(ui.validateSettings({grade:2,semester:'all',dimensions:['basic'],level:1,count:6,seed:' '}), /种子/);
 assert.equal(ui.validateSettings({grade:2,semester:'all',dimensions:['basic'],level:1,count:6,seed:'a'}), '');
});
test('scoped catalog keeps only internal prerequisite edges and question references', () => {
 const c={topics:[{id:'a'},{id:'b'}],questions:[{topicId:'a'},{topicId:'b'}],dependencies:[{topicId:'a',prerequisiteId:'b'},{topicId:'a',prerequisiteId:'a'}]};
 const scoped=ui.scopeCatalog(c,[c.topics[0]]);
 assert.deepEqual(scoped.questions,[{topicId:'a'}]);
 assert.deepEqual(scoped.dependencies,[{topicId:'a',prerequisiteId:'a'}]);
 assert.equal(c.dependencies.length,2);
});
test('escaping protects HTML attributes and text', () => {
 assert.equal(ui.escapeHTML('<img src=x onerror="x"> &'), '&lt;img src=x onerror=&quot;x&quot;&gt; &amp;');
});
test('history counts real submissions, deduplicates wrong questions, and removes corrected errors', () => {
 const q={id:'x',fingerprint:'same',prompt:'1+1',answer:'2'};
 let h=ui.recordAttempt({attempted:0,correct:0,wrong:[]},q,'3',false);
 h=ui.recordAttempt(h,q,'4',false);
 assert.equal(h.attempted,2); assert.equal(h.wrong.length,1);
 h=ui.recordAttempt(h,q,'2',true);
 assert.equal(h.correct,1); assert.equal(h.wrong.length,0);
 assert.deepEqual(ui.parseHistory('{bad'),{attempted:0,correct:0,wrong:[]});
 assert.deepEqual(ui.parseHistory('{"attempted":-2,"correct":5,"wrong":[{}]}'),{attempted:0,correct:0,wrong:[]});
});
test('question renderer uses labeled answer controls, escapes input and hides answers by default', () => {
 const html=ui.renderQuestion({id:'x',topicName:'<script>',prompt:'2+3?',answer:'SECRET',dimension:'basic',level:1},0,{});
 assert.match(html,/&lt;script&gt;/); assert.match(html,/label/); assert.match(html,/answer-0/);
 assert.ok(!html.includes('SECRET'));
 assert.match(ui.renderQuestion({id:'y',prompt:'choose',answer:'A',choices:[{key:'A',text:'<b>'}]},1,{}),/type="radio"/);
});
test('prerequisite trace returns real edges and terminates on cycles', () => {
 const topics=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}];
 const edges=[{topicId:'a',prerequisiteId:'b'},{topicId:'b',prerequisiteId:'c'},{topicId:'c',prerequisiteId:'a'}];
 assert.deepEqual(ui.prerequisiteTrace('a',topics,edges).map(x=>x.id),['b','c']);
});
