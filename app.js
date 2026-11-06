import {eventFingerprint} from './google-sync.js?v=4.0';
import {setupSync} from './sync-ui.js?v=4.0';
import {setupMobile} from './mobile.js?v=4.0';
import {setupVoiceInput} from './voice-input.js?v=4.0';
import {setupPhotoReview} from './photo-review.js?v=4.0';
import {DocumentReader} from './recognition.js?v=4.0';
import {id,localInput,validateEvent,parseText,parseCSV,parseICS,mergeEvents,makeICS,googleCalendarUrl} from './calendar.js?v=4.0';
const $=s=>document.querySelector(s), key='iljeongdam.events.v1';
let syncController=null;
let events=[],busy=false,generation=0,reader=null,lastFiles=[],lastGenerated='';
const status=(message,error=false)=>{$('#status').textContent=message;$('#status').classList.toggle('error',error);};
$('#base-year').value=new Date().getFullYear();
function save(){try{localStorage.setItem(key,JSON.stringify(events));$('#save-state').textContent='확인 중인 일정은 이 브라우저에 자동 저장됩니다.';}catch{$('#save-state').textContent='자동 저장을 사용할 수 없습니다. 창을 닫기 전에 일정 파일을 다운로드해 주세요.';}}
try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))events=saved.filter(e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&typeof e.start==='string'&&typeof e.end==='string'&&typeof e.allDay==='boolean').slice(0,300).map(e=>({...e,selected:e.selected!==false,location:typeof e.location==='string'?e.location:''}));}catch{status('저장된 일정을 읽지 못했습니다. 파일을 다시 가져와 주세요.',true);}
function update(){updateToday();const selected=events.filter(e=>e.selected);$('#count').textContent=`${events.length}개`;$('#selected-count').textContent=`선택한 일정 ${selected.length}개`;$('#empty').hidden=events.length>0;$('#export').disabled=busy||!selected.length||selected.some(validateEvent);$('#share').disabled=$('#export').disabled;$('#select-all').disabled=!events.length;$('#select-all').checked=events.length>0&&selected.length===events.length;$('#select-all').indeterminate=selected.length>0&&selected.length<events.length;}
function updateToday(){const today=localInput(new Date()).slice(0,10);$('#today-date').textContent=today;const list=$('#today-list');list.replaceChildren();const matches=events.filter(e=>e.start.slice(0,10)<=today&&e.end.slice(0,10)>=today).sort((a,b)=>a.start.localeCompare(b.start));$('#today-empty').hidden=matches.length>0;for(const e of matches){const item=document.createElement('li'),time=document.createElement('strong'),text=document.createElement('span'),state=document.createElement('small');time.textContent=e.allDay?'종일':e.start.slice(11);text.textContent=e.title||'제목 입력 필요';state.textContent=e.syncConflict?'충돌 확인':e.googleId?(e.googleFingerprint!==eventFingerprint(e)?'수정 대기':'Google 등록'):'기기 초안';item.append(time,text,state);list.append(item);}}
function render(){const container=$('#events');container.replaceChildren();for(const e of events){const card=$('#event-template').content.firstElementChild.cloneNode(true);card.dataset.id=e.id;const badge=document.createElement('p');badge.className='sync-badge';badge.textContent=e.syncConflict?'다른 기기와 내용이 다릅니다. Google 캘린더에서 확인해 주세요.':e.googleId?'Google 등록 일정 · 삭제 시 다른 기기에도 반영됩니다.':'이 기기의 초안';card.append(badge);const calendarLink=document.createElement('a');calendarLink.className='calendar-open';calendarLink.textContent=e.googleId?'Google 캘린더 열기 ↗':'Google 캘린더로 열기 ↗ (저장 확인 필요)';calendarLink.target='_blank';calendarLink.rel='noopener noreferrer';card.append(calendarLink);const refreshError=()=>{badge.textContent=e.syncConflict?'다른 기기와 내용이 다릅니다. Google 캘린더에서 확인해 주세요.':e.googleId?(e.googleFingerprint!==eventFingerprint(e)?'수정 대기 · Google 등록 버튼을 눌러 반영하세요.':'Google 등록 일정 · 삭제 시 다른 기기에도 반영됩니다.'):'이 기기의 초안';const error=validateEvent(e);card.querySelector('.event-error').textContent=error;calendarLink.hidden=!!error;if(!error)calendarLink.href=e.googleId?'https://calendar.google.com/':googleCalendarUrl(e);};
 for(const field of ['selected','title','allDay','start','end','location']){const input=card.querySelector(`[data-field="${field}"]`);if(field==='selected'||field==='allDay')input.checked=!!e[field];else input.value=e[field];if(field==='start'||field==='end'){input.type=e.allDay?'date':'datetime-local';input.value=e[field];}
 input.addEventListener('input',()=>{if(field==='allDay'){e.allDay=input.checked;if(e.allDay){e.start=e.start.slice(0,10);e.end=e.end.slice(0,10);}else{e.start=e.start.slice(0,10)+'T09:00';e.end=e.end.slice(0,10)+'T10:00';}save();render();return;}e[field]=field==='selected'?input.checked:input.value;refreshError();save();update();});}
 card.querySelector('.delete-event').onclick=async()=>{try{if(e.googleId&&!await syncController.remove(e))return;events=events.filter(x=>x.id!==e.id);save();render();}catch(error){status(error.message,true);}};refreshError();container.append(card);}update();}
function append(result){const merged=mergeEvents(events,result.events);if(merged.events.length>300)throw Error('한 번에 최대 300개 일정까지 관리할 수 있습니다.');events=merged.events;save();render();return merged.added;}
function report(result,added){if(!result.events.length){status('일정의 날짜와 제목을 연결하지 못했습니다. 달력 사진은 위에서 연월과 “달력 표”를 선택해 다시 읽어 주세요. 원본 Excel·Word 파일을 넣으면 더 정확하게 읽을 수 있습니다.'+(result.warnings.length?'\n확인 사항: '+[...new Set(result.warnings.map(w=>w.replace(/^\d+행: /,'')))].slice(0,4).join(' / '):''),true);return;}status(`${added}개 일정을 추가했습니다.${result.events.length>added?' 중복 일정은 제외했습니다.':''}${result.warnings.length?'\n확인 사항: '+result.warnings.slice(0,8).join(' / ')+(result.warnings.length>8?' 외 '+(result.warnings.length-8)+'건':''):''}`,!added);}
$('#parse').onclick=()=>{try{if(!$('#source-text').value.trim())throw Error('사진·파일을 넣거나 일정 내용을 입력해 주세요.');const result=parseText($('#source-text').value,+$('#base-year').value,$('#calendar-month').value);report(result,append(result));}catch(e){status(e.message,true);}};
$('#sample').onclick=()=>{$('#source-text').value=`${$('#base-year').value}-11-12 10:00~11:00 팀 주간회의\n${$('#base-year').value}-11-13 오후 2시 건강검진\n${$('#base-year').value}-11-15 가족 모임`;status('예시를 넣었습니다. “내용에서 일정 찾기”를 눌러보세요.');};
$('#add').onclick=()=>{if(events.length>=300){status('일정은 최대 300개까지 추가할 수 있습니다.',true);return;}const d=new Date();d.setHours(9,0,0,0);const end=new Date(+d+3600000);events.push({id:id(),title:'',start:localInput(d),end:localInput(end),allDay:false,location:'',selected:true});save();render();$('#events').lastElementChild.querySelector('[data-field=title]').focus();};
$('#select-all').onchange=()=>{events.forEach(e=>e.selected=$('#select-all').checked);save();render();};
$('#clear').onclick=()=>{if((events.length||$('#source-text').value)&&confirm('이 기기의 목록과 인식한 내용을 비울까요? Google에 저장된 일정은 삭제되지 않으며 다시 연결하면 불러옵니다.')){events=[];lastFiles=[];lastGenerated='';$('#retry').disabled=true;$('#source-text').value='';$('#file-list').replaceChildren();save();render();status('모든 일정을 지웠습니다.');}};
function exportFile(){return new File([makeICS(events.filter(e=>e.selected))],'일정담-'+localInput(new Date()).slice(0,10)+'.ics',{type:'text/calendar;charset=utf-8'});}
$('#export').onclick=()=>{try{const file=exportFile(),url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('일정 파일을 다운로드했습니다. 캘린더 앱에서 열어 추가를 완료해 주세요.');}catch(e){status(e.message,true);}};
try{$('#share').hidden=!navigator.canShare?.({files:[new File(['BEGIN:VCALENDAR\r\nEND:VCALENDAR'],'schedule.ics',{type:'text/calendar'})]});}catch{}
$('#share').onclick=async()=>{try{await navigator.share({files:[exportFile()],title:'일정담 일정'});status('공유 화면을 닫았습니다. 캘린더 앱에서 추가 여부를 확인해 주세요.');}catch(e){if(e.name!=='AbortError')status('이 브라우저에서는 일정 공유를 지원하지 않습니다. 다운로드 버튼을 사용해 주세요.',true);}};
function setBusy(value){
 busy=value;for(const name of ['files','camera','parse','sample','clear','recognition-mode','calendar-month','week-start'])$('#'+name).disabled=value;
 $('#retry').disabled=value||!lastFiles.length;$('#progress-box').hidden=!value;update();
}
function progress(message,value){$('#progress-label').textContent=message;$('#progress').value=value;}
function options(){return {month:$('#calendar-month').value,mode:$('#recognition-mode').value,weekStart:+$('#week-start').value};}
async function processFiles(files){
 if(busy||!files.length)return;
 const token=++generation;lastFiles=files;setBusy(true);$('#file-list').replaceChildren();
 const currentReader=new DocumentReader(options(),(message,value)=>{if(token===generation)progress(message,value);});reader=currentReader;
 let errors=0,warnings=0,readCount=0,waitingForMonth=false;
 const existing=$('#source-text').value===lastGenerated?'':$('#source-text').value;
 const collected=[];
 try{
  if(files.length>10)throw Error('한 번에 파일을 10개까지 선택해 주세요.');
  for(const file of files){
   if(token!==generation)break;
   const row=document.createElement('div');row.textContent=`${file.name} · 읽는 중`;
   $('#file-list').append(row);
   try{
    if(file.size>15*1024*1024)throw Error('15MB를 넘는 파일입니다.');if(!file.size)throw Error('빈 파일입니다.');
    const ext=file.name.split('.').pop().toLowerCase();
    if(['txt','csv','ics'].includes(ext)){
     const text=await file.text();if(token!==generation)break;
     if(text.includes('\uFFFD'))throw Error('문자 인코딩을 읽지 못했습니다. UTF-8 형식으로 저장해 주세요.');
     if(text.length>200000)throw Error('텍스트가 너무 많습니다. 20만 자 이내로 나눠 주세요.');
     if(ext==='csv'||ext==='ics'){
      const result=ext==='csv'?parseCSV(text):parseICS(text),added=append(result);
      row.textContent=`${file.name} · ${added}개 추가${result.warnings.length?' · '+result.warnings.slice(0,5).join(' / '):''}`;warnings+=result.warnings.length;
     }else{collected.push(text.trim());row.textContent=`${file.name} · 텍스트 읽기 완료`;}
    }else{
     const results=await currentReader.read(file);if(token!==generation)break;
     const pieces=results.map(r=>r.text||r.raw).filter(Boolean);
     if(!pieces.join('').trim())throw Error(results.flatMap(r=>r.warnings).join(' / ')||'읽을 수 있는 글자를 찾지 못했습니다. 원본 문서 또는 선명한 사진을 넣어 주세요.');
     if(pieces.join('').length>200000)throw Error('추출한 내용이 너무 많습니다. 파일을 나눠 주세요.');
     collected.push(...pieces);
     const notices=results.flatMap(r=>r.warnings||[]);warnings+=notices.length;waitingForMonth||=results.some(r=>r.needsMonth);
     row.textContent=`${file.name} · ${results.some(r=>r.calendar)?'달력 칸 분석':'내용 읽기'} 완료${notices.length?' · '+notices.slice(0,5).join(' / '):''}`;
    }
    readCount++;
    if(collected.length){lastGenerated=[existing,...collected].filter(Boolean).join('\n');$('#source-text').value=lastGenerated;}
   }catch(e){if(token!==generation)break;errors++;row.textContent=`${file.name} · ${e.message}`;}
  }
  if(token===generation){
   if(waitingForMonth)status('달력의 연월이 필요합니다. 위에서 연월을 선택하고 “선택한 파일 다시 읽기”를 눌러 주세요. 날짜를 임의로 정하지 않았습니다.',true);
   else if(errors)status(`${errors}개 파일을 읽지 못했습니다. 파일 이름 아래의 안내를 확인해 주세요.${readCount?' 읽힌 내용은 “내용에서 일정 찾기”로 확인할 수 있습니다.':''}`,true);
   else status(`파일 읽기가 끝났습니다. 아래 내용을 확인한 뒤 “내용에서 일정 찾기”를 눌러 주세요.${warnings?' 파일별 확인 사항도 살펴봐 주세요.':''} CSV·ICS는 일정 목록에 바로 추가했습니다.`);
  }
 }catch(e){if(token===generation)status(e.message,true);}
 finally{await currentReader.close();if(token===generation){reader=null;setBusy(false);}}
}
$('#files').onchange=e=>{processFiles([...e.target.files]);e.target.value='';};
$('#camera').onchange=e=>{processFiles([...e.target.files]);e.target.value='';};
$('#retry').onclick=()=>processFiles(lastFiles);
$('#cancel').onclick=async()=>{generation++;const previous=reader;reader=null;await previous?.cancel();status('인식을 취소했습니다. 이미 읽은 내용과 일정은 유지됩니다.');setBusy(false);};
const zone=$('#dropzone');
for(const type of ['dragenter','dragover'])zone.addEventListener(type,e=>{e.preventDefault();zone.classList.add('dragging');});
zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));
zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragging');processFiles([...e.dataTransfer.files]);});
render();

setupPhotoReview(incoming=>append({events:incoming,warnings:[]}));

setupVoiceInput(incoming=>append({events:incoming,warnings:[]}));

syncController=setupSync({getEvents:()=>events,setEvents:incoming=>{events=incoming;save();render();}});
setupMobile();
