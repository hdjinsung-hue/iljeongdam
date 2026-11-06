import test from 'node:test';
import assert from 'node:assert/strict';
import {checkQuad,mapQuad,monthGrid,cellDraft,reviewedEvent} from '../photo-grid.js';
test('November 2026 geometry does not rely on OCR date digits',()=>{
 const grid=monthGrid('2026-11');assert.equal(grid.rows,5);assert.equal(grid.days,30);assert.deepEqual(grid.dates[0],{date:'2026-11-01',row:0,col:0});assert.deepEqual(grid.dates[19],{date:'2026-11-20',row:2,col:5});assert.deepEqual(grid.dates[29],{date:'2026-11-30',row:4,col:1});
});
test('Monday-first and six-week calendars are mapped safely',()=>{
 const grid=monthGrid('2026-11',1);assert.equal(grid.rows,6);assert.equal(grid.dates[0].col,6);assert.throws(()=>monthGrid(''));assert.throws(()=>monthGrid('2026-13'));
});
test('Perspective correction preserves four corners',()=>{
 const q=[{x:30,y:498},{x:1356,y:527},{x:1278,y:1295},{x:65,y:1255}];checkQuad(q);
 for(const [u,v,index] of [[0,0,0],[1,0,1],[1,1,2],[0,1,3]]){const p=mapQuad(q,u,v);assert.ok(Math.abs(p.x-q[index].x)<.001);assert.ok(Math.abs(p.y-q[index].y)<.001);}
 assert.throws(()=>checkQuad([q[0],q[2],q[1],q[3]]));assert.throws(()=>checkQuad(q.slice(0,3)));
});
test('Handwritten-cell OCR remains an editable suggestion',()=>{
 assert.deepEqual(cellDraft('검증회의\n10:20','2026-11-20').time,'10:20');assert.equal(cellDraft('대표님 정보미팅','2026-11-02').time,'');assert.equal(cellDraft('회의 25:90','2026-11-02').time,'');assert.equal(cellDraft('회의 9.30','2026-11-02').time,'09:30');
});
test('Only confirmed titled dates can be turned into calendar events',()=>{
 const event=reviewedEvent('2026-11-20','검증회의','10:20');assert.equal(event.start,'2026-11-20T10:20');assert.equal(event.allDay,false);assert.equal(reviewedEvent('2026-11-02','대표님 정보미팅','').allDay,true);assert.throws(()=>reviewedEvent('2026-11-20','','10:20'));assert.throws(()=>reviewedEvent('2026-11-31','회의',''));
});
