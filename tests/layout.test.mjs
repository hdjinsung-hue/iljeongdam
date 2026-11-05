import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTable,positionedText,monthContext} from '../document-layout.js';
import {parseText} from '../calendar.js';
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
test('Spreadsheet row table keeps date, title and times together',()=>{
 const r=normalizeTable([['11월 업무'],['날짜','제목','시작','종료'],['2026-11-12','팀회의','10:00','11:00'],['','검진','14:00','15:00']]);
 const e=parseText(r.text).events;assert.equal(e.length,2);assert.equal(e[1].start,'2026-11-12T14:00');assert.equal(e[0].title,'팀회의');
});
test('Calendar grid reads multiline cells and separate day/event rows',()=>{
 const r=normalizeTable([['2026년 11월'],weekdays,['1\n10:00 팀회의','2','3','4','5','6','7'],['','14:00 검진','','','','',''],['8','9','10','11','12','13','14'],['','09:00 업무','','','','','']]);
 const e=parseText(r.text).events;assert.equal(e.length,3);assert.equal(e[0].start,'2026-11-01T10:00');assert.equal(e[1].start,'2026-11-02T14:00');assert.equal(e[2].start,'2026-11-09T09:00');
});
test('Never guesses missing calendar month or mismatched weekday',()=>{
 const t=[weekdays,['1\n10:00 회의','2','3','4','5','6','7']];
 assert.equal(normalizeTable(t).needsMonth,true);
 const r=normalizeTable(t,{month:'2026-12'});assert.equal(r.text,'');assert.ok(r.warnings.some(s=>s.includes('맞지')));
});
test('Calendar words use bounding boxes across columns and weeks',()=>{
 const words=[];function word(text,x,y,width=100){words.push({text,x0:x,x1:x+width,y0:y,y1:y+20});}
 weekdays.forEach((s,c)=>word(s,c*160+35,50,90));
 for(let c=0;c<7;c++){word(String(c+1),c*160+12,100,15);word(String(c+8),c*160+12,250,18);}
 word('10:00',12,140,58);word('회의',78,140,55);word('14:00',172,140,58);word('검진',238,140,55);word('가족모임',12,290,100);
 const r=positionedText(words,{month:'2026-11',width:1120});const events=parseText(r.text).events;
 assert.equal(r.calendar,true);assert.equal(events.length,3);assert.equal(events[0].start,'2026-11-01T10:00');assert.equal(events[1].start,'2026-11-02T14:00');assert.equal(events[2].start,'2026-11-08');
});
test('Date-only Korean headings and spaced OCR clock punctuation',()=>{
 const r=parseText('2026년 11월\n12일 10 : 00 회의\n13일 검진');assert.equal(r.events.length,2);assert.equal(r.events[0].start,'2026-11-12T10:00');assert.equal(r.events[1].start,'2026-11-13');
});
test('Month extraction handles document heading and explicit fallback',()=>{
 assert.equal(monthContext('2026년 11월 일정표'),'2026-11');assert.equal(monthContext('연월 없음','2026-12'),'2026-12');assert.equal(monthContext('연월 없음'),null);
});
test('Ordinary list layout stays a list without a weekday header',()=>{
 const words=[{text:'2026-11-12',x0:10,x1:100,y0:10,y1:30},{text:'회의',x0:120,x1:160,y0:10,y1:30}];const r=positionedText(words);assert.equal(r.calendar,false);assert.equal(parseText(r.text).events.length,1);
});
test('Spreadsheet date-time plus separate clock column does not duplicate times',()=>{
 const r=normalizeTable([['날짜','제목','시작','종료'],['2026-11-12 00:00','회의','10:00','11:00']]);const e=parseText(r.text).events;assert.equal(e.length,1);assert.equal(e[0].start,'2026-11-12T10:00');
});
