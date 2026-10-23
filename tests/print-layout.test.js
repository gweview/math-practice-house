import test from 'node:test';
import assert from 'node:assert/strict';
import { paginatePrint } from '../src/print-layout.js';
class FakeNode { constructor(){this.children=[];this.className='';this.dataset={};this.style={};this.classList={add:(x)=>this.className+=' '+x};this.innerHTML='';} append(...nodes){this.children.push(...nodes);} replaceChildren(...nodes){this.children=[...nodes];} setAttribute(){} querySelectorAll(){return [];} }
globalThis.document ||= {createElement:()=>new FakeNode(),fonts:{ready:Promise.resolve()},body:new FakeNode()};
globalThis.getComputedStyle ||= ()=>({});
test('pagination produces A4 page model and truthful empty state', async()=>{
 const root=new FakeNode(); const result=await paginatePrint({questions:[],sections:[],root,columns:2,style:'mixed'});
 assert.equal(result.pageCount,0); assert.equal(result.studentPageCount,0); assert.ok(result.warnings.some(x=>/没有题目/.test(x)));
});
test('layout validates requested column/style choices instead of silently changing them',async()=>{
 await assert.rejects(()=>paginatePrint({questions:[],root:new FakeNode(),columns:3,style:'mixed'}),/columns/);
 await assert.rejects(()=>paginatePrint({questions:[],root:new FakeNode(),columns:2,style:'tiny'}),/style/);
});
