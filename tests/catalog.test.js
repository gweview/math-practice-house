import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync(new URL(`../data/${n}.json`,import.meta.url),'utf8'));
const topics=read('topics'), edges=read('dependencies'), questions=read('questions');
test('catalog contains only the 108 mathematics grade 1–3 nodes',()=>{
 assert.equal(topics.length,108); assert.deepEqual([1,2,3].map(g=>topics.filter(t=>t.grade===g).length),[38,31,39]);
 assert.equal(new Set(topics.map(t=>t.id)).size,topics.length);
 assert.ok(topics.every(t=>t.id.startsWith('cnm_')&&[1,2,3].includes(t.grade)));
});
test('all 153 prerequisite edges and 432 question references are internal',()=>{
 const ids=new Set(topics.map(t=>t.id));assert.equal(edges.length,153);assert.equal(questions.length,432);
 assert.ok(edges.every(e=>ids.has(e.topicId)&&ids.has(e.prerequisiteId)));
 assert.ok(questions.every(q=>ids.has(q.topicId)&&typeof q.answer==='string'&&q.prompt&&q.explanation));
 assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
 for(const t of topics)assert.equal(questions.filter(q=>q.topicId===t.id).length,4);
});
test('data source records exact upstream revision and noncommercial attribution',()=>{
 const provenance=read('provenance');
 assert.equal(provenance.revision,'1e9f3d278b90e5a5c36e832c340e262feff0ca78');
 assert.equal(provenance.license,'CC-BY-NC-4.0');assert.equal(provenance.teacherReviewed,false);
});
