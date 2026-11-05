import {validDate} from './calendar.js';

const weekNames = [
  ['sun','sunday','일','일요일'], ['mon','monday','월','월요일'],
  ['tue','tues','tuesday','화','화요일'], ['wed','wednesday','수','수요일'],
  ['thu','thur','thurs','thursday','목','목요일'], ['fri','friday','금','금요일'],
  ['sat','saturday','토','토요일']
];
export const weekday = value => weekNames.findIndex(names => names.includes(String(value).toLowerCase().replace(/[\s.()]/g,'')));
export function monthContext(text, selected='') {
  const values = [...String(text).matchAll(/(20\d{2}|19\d{2})\s*(?:년|[-./])\s*(1[0-2]|0?[1-9])\s*(?:월|(?=[\s./-]|$))/g)];
  const months = [...new Set(values.map(m=>`${m[1]}-${m[2].padStart(2,'0')}`))];
  if (months.length === 1) return months[0];
  if (/^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(selected)) return selected;
  return null;
}
function isoDay(month,d) { const value=`${month}-${String(d).padStart(2,'0')}`;return validDate(value)?value:null; }
const dayCell = value => String(value).trim().match(/^(\d{1,2})\s*(?:일|\([월화수목금토일]\))?(?:\n([\s\S]*))?$/);
const clock = /(?:\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*시)/;
export function cellLines(date, contents) {
  const lines=contents.flatMap(s=>String(s).split(/\r?\n/)).map(s=>s.trim()).filter(Boolean);
  // Keep a time and its wrapped title together. Separate timed entries remain separate.
  const entries=[];let pending=[];
  for(const line of lines) {
    if(clock.test(line) && pending.some(x=>clock.test(x))) { entries.push(pending.join(' '));pending=[]; }
    pending.push(line.replace(/(\d)\s*：\s*(\d)/g,'$1:$2'));
  }
  if(pending.length)entries.push(pending.join(' '));
  return entries.map(s=>`${date} ${s}`);
}
function dateHeader(value) { return /^(날짜|일자|일시|시작일|시작일시|date|start date|datetime)$/i.test(value.trim()); }
function titleHeader(value) { return /^(일정|일정명|제목|내용|업무|행사|title|subject|event)$/i.test(value.trim()); }
const rawTable = table => table.map(row=>row.map(String).join('\t')).join('\n');
export function normalizeTable(table, options={}) {
  table=table.map(row=>row.map(v=>String(v??'').trim()));
  const raw=rawTable(table), warnings=[];
  // Row-oriented schedules: preserve columns instead of flattening their reading order.
  const headerIndex=table.findIndex(row=>row.some(dateHeader)&&row.some(titleHeader));
  if(headerIndex>=0) {
    const headers=table[headerIndex],di=headers.findIndex(dateHeader),ti=headers.findIndex(titleHeader);
    const si=headers.findIndex(x=>/^(시작|시작시간|시간|start|start time)$/i.test(x));
    const ei=headers.findIndex(x=>/^(종료|종료시간|end|end time)$/i.test(x));
    const li=headers.findIndex(x=>/^(장소|location)$/i.test(x));
    let lastDate='';const lines=[];
    for(const [offset,row] of table.slice(headerIndex+1).entries()) {
      if(row.every(x=>!x))continue;
      let date=row[di]||lastDate;if(row[di])lastDate=row[di];
      if(si>=0&&row[si])date=date.replace(/\s+\d{2}:\d{2}$/,'');
      const title=row[ti]||'';if(!date||!title){warnings.push(`${headerIndex+offset+2}행: 날짜나 제목이 비어 있습니다.`);continue;}
      let time=row[si]||'';if(ei>=0&&row[ei])time+=`~${row[ei]}`;
      const extra=li>=0&&row[li]?` (장소: ${row[li]})`:'';
      lines.push(`${date} ${time} ${title}${extra}`);
    }
    return {text:lines.join('\n'),raw,warnings,calendar:false};
  }
  const weekIndex=table.findIndex(row=>new Set(row.map(weekday).filter(d=>d>=0)).size>=5);
  if(weekIndex<0)return {text:table.map(r=>r.filter(Boolean).join(' ')).join('\n'),raw,warnings,calendar:false};
  const month=monthContext(raw,options.month);
  if(!month)return {text:'',raw,warnings:['달력 표를 찾았습니다. “달력의 연월”을 선택한 후 “선택한 파일 다시 읽기”를 눌러 주세요.'],calendar:true,needsMonth:true};
  const columns=table[weekIndex].map((s,index)=>({index,day:weekday(s)})).filter(c=>c.day>=0);
  const active=new Map(),lines=[];let accepted=0;
  for(const row of table.slice(weekIndex+1)) {
    // A new week clears previous dates, including empty leading/trailing cells.
    const markers=columns.map(c=>({c,m:dayCell(row[c.index]||'')})).filter(x=>x.m);
    if(markers.length>=2){active.clear();}
    for(const c of columns) {
      const value=row[c.index]||'';if(!value)continue;const marker=dayCell(value);
      if(marker) {
        const d=isoDay(month,+marker[1]);
        if(!d||new Date(d+'T12:00').getDay()!==c.day){active.delete(c.index);warnings.push(`${month}-${marker[1]}: 요일 칸과 날짜가 맞지 않아 제외했습니다.`);continue;}
        active.set(c.index,d);accepted++;
        if(marker[2])lines.push(...cellLines(d,[marker[2]]));
      }else if(active.has(c.index))lines.push(...cellLines(active.get(c.index),[value]));
    }
  }
  if(!accepted)warnings.push('달력의 연월 또는 요일 배열을 확인해 주세요.');
  warnings.push(`${month} 달력의 날짜·요일을 대조했습니다. 칸 안의 여러 일정은 인식 결과를 확인해 주세요.`);
  return {text:lines.join('\n'),raw,warnings,calendar:true};
}
function median(values) { const s=values.slice().sort((a,b)=>a-b);return s[Math.floor(s.length/2)]||12; }
export function groupWords(words) {
  const h=median(words.map(w=>w.y1-w.y0)), rows=[];
  for(const w of [...words].sort((a,b)=>a.y0-b.y0||a.x0-b.x0)) {
    let row=rows.find(r=>Math.abs(r.y-(w.y0+w.y1)/2)<h*.65);
    if(!row){row={y:(w.y0+w.y1)/2,words:[]};rows.push(row);}row.words.push(w);
  }
  return rows.sort((a,b)=>a.y-b.y).map(r=>({...r,words:r.words.sort((a,b)=>a.x0-b.x0)}));
}
function joinWords(words) { let text='',previous=null;for(const w of words){if(previous){const gap=w.x0-previous.x1;text+=gap<Math.min(w.y1-w.y0,previous.y1-previous.y0)*.15?'':' ';}text+=w.text;previous=w;}return text; }
export function positionedText(words, options={}) {
  const rows=groupWords(words),raw=rows.map(r=>joinWords(r.words)).join('\n');
  const header=rows.find(r=>new Set(r.words.map(w=>weekday(w.text)).filter(d=>d>=0)).size>=4);
  const force=options.mode==='calendar';
  if(!header&&!force)return {text:raw,raw,warnings:[],calendar:false};
  if(options.mode==='list')return {text:raw,raw,warnings:[],calendar:false};
  const month=monthContext(raw,options.month);
  if(!month)return {text:'',raw,warnings:['달력 형태입니다. “달력의 연월”을 선택하고 파일을 다시 읽어 주세요.'],calendar:true,needsMonth:true};
  let startDay=+options.weekStart||0,centers=[],left,width;
  if(header) {
    const known=header.words.map(w=>({day:weekday(w.text),x:(w.x0+w.x1)/2})).filter(w=>w.day>=0);
    if(known.some(w=>w.day===0)&&known.find(w=>w.day===0).x<known.find(w=>w.day===1)?.x)startDay=0;
    else if(known.some(w=>w.day===1)&&known.find(w=>w.day===1).x<known.find(w=>w.day===0)?.x)startDay=1;
    const points=known.map(w=>({col:(w.day-startDay+7)%7,x:w.x})).sort((a,b)=>a.col-b.col);
    width=median(points.slice(1).map((p,i)=>(p.x-points[i].x)/(p.col-points[i].col)).filter(x=>x>0));
    const origin=median(points.map(p=>p.x-p.col*width));centers=Array.from({length:7},(_,i)=>origin+i*width);left=origin-width/2;
  }else{
    width=options.width/7;left=0;centers=Array.from({length:7},(_,i)=>(i+.5)*width);
  }
  if(!Number.isFinite(width)||width<=0) return {text:'',raw,calendar:true,warnings:['요일 칸의 위치를 읽지 못했습니다. 달력 부분만 잘라서 다시 시도해 주세요.']};
  const colFor=w=>Math.floor(((w.x0+w.x1)/2-left)/width);
  const below=words.filter(w=>!header||w.y0>header.y);
  const candidates=below.filter(w=>/^\d{1,2}일?$/.test(w.text.trim())).map(w=>({w,col:colFor(w),day:parseInt(w.text)})).filter(p=>p.col>=0&&p.col<7&&p.day>=1&&p.day<=31);
  const candidateRows=groupWords(candidates.map(p=>p.w));
  const dateRows=candidateRows.filter(r=>r.words.filter(w=>{const c=candidates.find(p=>p.w===w),d=isoDay(month,c.day);return d&&new Date(d+'T12:00').getDay()===(startDay+c.col)%7;}).length>=2);
  if(!dateRows.length)return {text:'',raw,calendar:true,warnings:['달력의 날짜 행을 확실하게 읽지 못했습니다. 달력의 연월·요일 시작을 확인하고, 날짜와 글자가 선명한 사진을 사용해 주세요.']};
  const lines=[],warnings=[];let cells=0;
  for(let r=0;r<dateRows.length;r++) {
    const row=dateRows[r],bottom=dateRows[r+1]?.y??Infinity;
    for(let col=0;col<7;col++) {
      const markers=candidates.filter(p=>row.words.includes(p.w)&&p.col===col);
      if(markers.length!==1)continue;const marker=markers[0],date=isoDay(month,marker.day);
      if(!date||new Date(date+'T12:00').getDay()!==(startDay+col)%7)continue;
      const content=below.filter(w=>colFor(w)===col&&w!==marker.w&&(w.y0+w.y1)/2>=row.y-3&&(w.y0+w.y1)/2<bottom-3);
      if(!content.length)continue;
      const cell=groupWords(content).map(line=>joinWords(line.words));lines.push(...cellLines(date,cell));cells++;
    }
  }
  warnings.push(`${month} 달력 ${cells}개 칸을 위치로 연결했습니다. OCR로 읽은 제목과 시간을 반드시 확인해 주세요.`);
  return {text:lines.join('\n'),raw,warnings,calendar:true};
}
