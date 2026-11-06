export function id() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export function localInput(d) { const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
export function validDate(s) { if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s)) return false; const d=new Date(s.length===10?s+'T00:00':s); return Number.isFinite(+d) && localInput(d).slice(0,s.length)===s; }
export function validateEvent(e) {
 if (!e.title?.trim()) return '일정 제목을 입력해 주세요.';
 if (!validDate(e.start) || !validDate(e.end)) return '올바른 시작·종료 날짜와 시간을 입력해 주세요.';
 if (e.start.slice(0,4)<'1900' || e.end.slice(0,4)>'2100') return '날짜는 1900~2100년으로 입력해 주세요.';
 if (e.allDay ? e.end < e.start : e.end <= e.start) return e.allDay?'종료일은 시작일 이후여야 합니다.':'종료 시간은 시작 시간보다 늦어야 합니다.';
 return '';
}
function day(y,m,d) { const s=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; return validDate(s)?s:null; }
function signature(e) { return [e.title.trim(),e.start,e.end,e.allDay,e.location||''].join('|'); }
export function mergeEvents(existing,incoming) { const seen=new Set(existing.map(signature)); const fresh=incoming.filter(e=>{const s=signature(e);if(seen.has(s))return false;seen.add(s);return true;});return {events:[...existing,...fresh],added:fresh.length}; }
export function parseText(text,year=new Date().getFullYear(),month='') {
 const events=[],warnings=[];let currentDate=null;
 if(!Number.isInteger(+year)||year<1900||year>2100)throw Error('기준 연도는 1900~2100년으로 입력해 주세요.');
 const full=/(\d{4})\s*(?:[-./]|년)\s*(\d{1,2})\s*(?:[-./]|월)\s*(\d{1,2})\s*일?/;
 const short=/(\d{1,2})\s*(?:[-./]|월)\s*(\d{1,2})\s*일?/;
 for(const [index,raw] of text.split(/\r?\n/).entries()) {
  let line=raw.trim().replace(/(\d)\s*[:：]\s*(\d{2})/g,'$1:$2').replace(/(\d)[‐‑–](?=\d)/g,'$1-');if(!line)continue;const heading=line.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*$/);if(heading){month=heading[1]+'-'+heading[2].padStart(2,'0');currentDate=null;continue;}let matched=line.match(full),assumed=false;
  if(!matched){matched=line.match(short);assumed=!!matched;}
  if(matched){const parsed=assumed?day(+year,+matched[1],+matched[2]):day(+matched[1],+matched[2],+matched[3]);
   if(!parsed){warnings.push(`${index+1}행: 존재하지 않는 날짜입니다.`);currentDate=null;continue;}currentDate=parsed;line=line.replace(matched[0],'').replace(/\([월화수목금토일](?:요일)?\)/g,'').trim();
   if(assumed)warnings.push(`${index+1}행: ${year}년을 적용했습니다.`);
  }
  if(!line)continue;
  if(!matched&&/^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month)){const dm=line.match(/^(\d{1,2})\s*일(?:\s|$)/);if(dm){const value=month+'-'+dm[1].padStart(2,'0');if(!validDate(value)){warnings.push(`${index+1}행: 존재하지 않는 날짜입니다.`);currentDate=null;continue;}currentDate=value;line=line.slice(dm[0].length).trim();warnings.push(`${index+1}행: ${month} 연월을 적용했습니다.`);if(!line)continue;}}
  if(!currentDate){warnings.push(`${index+1}행: 날짜를 찾지 못했습니다.`);continue;}
  const timeRE=/(오전|오후|AM|PM)?\s*(\d{1,2})(?::(\d{2})|시(?:\s*(\d{1,2})분?)?)(?:\s*(AM|PM))?/gi;
  const times=[...line.matchAll(timeRE)];let start=currentDate,end=currentDate,allDay=times.length===0;
  if(times.length>2){warnings.push(`${index+1}행: 시간 후보가 너무 많아 직접 확인이 필요합니다.`);continue;}
  if(times.length){let invalid=false;const parsed=times.map(t=>{let h=+t[2],m=+(t[3]||t[4]||0),ap=(t[1]||t[5]||'').trim().toUpperCase();if(m>59||h>23||(ap&&(h<1||h>12)))invalid=true;if(ap){h=h%12;if(ap==='오후'||ap==='PM')h+=12;}return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;});
   if(invalid){warnings.push(`${index+1}행: 올바르지 않은 시간입니다.`);continue;}
   start=currentDate+'T'+parsed[0];end=times.length===2?currentDate+'T'+parsed[1]:localInput(new Date(+new Date(start)+3600000));
   if(end<=start){warnings.push(`${index+1}행: 종료가 시작보다 빠릅니다. 직접 추가해 주세요.`);continue;}
   if(times.length===1)warnings.push(`${index+1}행: 종료 시간을 1시간 후로 설정했습니다.`);
   line=line.replace(timeRE,' ');
  }
  let title=line.replace(/^[\s,;|~∼～–—:\-]+|[\s,;|~∼～–—:\-]+$/g,'').replace(/\s*[~∼～–—]\s*/g,' ').replace(/\s+/g,' ').trim();
  if(!title){warnings.push(`${index+1}행: 제목이 없어 건너뛰었습니다.`);continue;}
  if(/^(제목|일정|날짜|시간)(\s|,|$)/.test(title)&&!matched&&!times.length)continue;
  events.push({id:id(),title:title.slice(0,200),start,end,allDay,selected:true,location:''});
 }
 return {events:mergeEvents([],events).events,warnings};
}
export function parseCSV(text) {
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('CSV의 따옴표가 닫히지 않았습니다.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 if(!rows.length)return {events:[],warnings:[]};
 const headers=rows[0].map(x=>x.replace(/^\uFEFF/,'').trim().toLowerCase());
 const col=(...names)=>headers.findIndex(h=>names.includes(h));
 const ti=col('제목','일정','title','subject'),di=col('날짜','date','시작일','start date');
 if(ti<0||di<0)throw Error('CSV 첫 행에 날짜,제목 열이 필요합니다. 선택 열: 시작,종료,장소');
 const si=col('시작','시작시간','start','start time'),ei=col('종료','종료시간','end','end time'),li=col('장소','location');
 const events=[],warnings=[];
 rows.slice(1).forEach((r,i)=>{const date=(r[di]||'').trim().replace(/[./]/g,'-');const st=(r[si]||'').trim(),en=(r[ei]||'').trim();const result=parseText(`${date} ${st}${en?'~'+en:''} ${(r[ti]||'').trim()}`);if(result.events.length){result.events[0].location=(r[li]||'').trim().slice(0,300);events.push(result.events[0]);}warnings.push(...result.warnings.map(w=>`CSV ${i+2}행: ${w}`));});
 return {events,warnings};
}
function escapeICS(s){return String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
function unescapeICS(s){return s.replace(/\\([nN,;\\])/g,(_,c)=>/[nN]/.test(c)?'\n':c);}
function stamp(d){return d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
function fold(line){let result='',part='',bytes=0;for(const ch of line){const size=new TextEncoder().encode(ch).length;if(bytes+size>75){result+=part+'\r\n';part=' ';bytes=1;}part+=ch;bytes+=size;}return result+part;}
export function makeICS(events) {
 if(!events.length)throw Error('내보낼 일정을 선택해 주세요.');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Iljeongdam//Calendar Import//KO','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(const e of events){const error=validateEvent(e);if(error)throw Error(error);lines.push('BEGIN:VEVENT',`UID:${e.id}@iljeongdam`,`DTSTAMP:${stamp(new Date())}`);
 if(e.allDay){const next=new Date(e.end.slice(0,10)+'T00:00');next.setDate(next.getDate()+1);lines.push('DTSTART;VALUE=DATE:'+e.start.slice(0,10).replaceAll('-',''),'DTEND;VALUE=DATE:'+localInput(next).slice(0,10).replaceAll('-',''));}
 else lines.push('DTSTART:'+stamp(new Date(e.start)),'DTEND:'+stamp(new Date(e.end)));
 lines.push('SUMMARY:'+escapeICS(e.title.trim()),'LOCATION:'+escapeICS(e.location||''),'END:VEVENT');}
 lines.push('END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
}
export function parseICS(text) {
 if(!/^BEGIN:VCALENDAR\s*$/m.test(text))throw Error('올바른 ICS 캘린더 파일이 아닙니다.');
 const unfolded=text.replace(/\r?\n[ \t]/g,'');const blocks=[...unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)];const events=[],warnings=[];
 for(const [i,block] of blocks.entries()){const fields={};for(const line of block[1].split(/\r?\n/)){const colon=line.indexOf(':');if(colon<0)continue;const head=line.slice(0,colon),name=head.split(';')[0];fields[name]={head,value:line.slice(colon+1)};}
 if(fields.RRULE||fields['RECURRENCE-ID']||fields.RDATE||fields.EXDATE){warnings.push(`${i+1}번째: 반복 일정은 지원하지 않아 건너뛰었습니다.`);continue;}
 const convert=f=>{if(!f)return null;const v=f.value;let m=v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);if(!m)return null;const date=day(+m[1],+m[2],+m[3]);if(!date)return null;if(!m[4])return date;let local=`${date}T${m[4]}:${m[5]}`;if(!validDate(local))return null;if(m[7])return localInput(new Date(local+':'+(m[6]||'00')+'Z'));if(/TZID=/.test(f.head)){const zone=f.head.match(/TZID=([^;:]+)/)?.[1].replaceAll('"','');if(zone!==Intl.DateTimeFormat().resolvedOptions().timeZone)throw Error(`시간대 ${zone} 일정은 변환하지 않았습니다. 원본 캘린더에서 UTC 형식으로 내보내 주세요.`);}return local;};
 try{const start=convert(fields.DTSTART);let end=convert(fields.DTEND);if(!start)throw Error('시작 날짜를 읽지 못했습니다.');const allDay=start.length===10;if(!end){if(fields.DURATION)throw Error('DURATION 형식의 종료 시간은 지원하지 않습니다.');end=allDay?start:localInput(new Date(+new Date(start)+3600000));}else if(allDay){const d=new Date(end+'T00:00');d.setDate(d.getDate()-1);end=localInput(d).slice(0,10);}
 const e={id:id(),title:unescapeICS(fields.SUMMARY?.value||'제목 없는 일정').slice(0,200),start,end,allDay,location:unescapeICS(fields.LOCATION?.value||'').slice(0,300),selected:true};const error=validateEvent(e);if(error)throw Error(error);events.push(e);
 }catch(e){warnings.push(`${i+1}번째: ${e.message}`);}}
 return {events,warnings};
}

export function googleCalendarUrl(event){
 const error=validateEvent(event);if(error)throw Error(error);
 let dates;
 if(event.allDay){const end=new Date(event.end+'T00:00');end.setDate(end.getDate()+1);dates=event.start.replaceAll('-','')+'/'+localInput(end).slice(0,10).replaceAll('-','');}
 else dates=stamp(new Date(event.start))+'/'+stamp(new Date(event.end));
 const url=new URL('https://calendar.google.com/calendar/render');url.searchParams.set('action','TEMPLATE');url.searchParams.set('text',event.title.trim());url.searchParams.set('dates',dates);if(event.location)url.searchParams.set('location',event.location);return url.href;
}
