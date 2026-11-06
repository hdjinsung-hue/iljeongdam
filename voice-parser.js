import {id,localInput,validDate,validateEvent} from './calendar.js';

function koreanNumber(s){
 if(/^\d+$/.test(s))return +s;
 const native={한:1,하나:1,두:2,둘:2,세:3,셋:3,네:4,넷:4,다섯:5,여섯:6,일곱:7,여덟:8,아홉:9,열:10,열한:11,열하나:11,열두:12,열둘:12};if(s in native)return native[s];
 const digits={영:0,공:0,일:1,이:2,삼:3,사:4,오:5,육:6,칠:7,팔:8,구:9},units={십:10,백:100,천:1000};let sum=0,n=0;
 for(const c of s){if(c in digits)n=digits[c];else if(c in units){sum+=(n||1)*units[c];n=0;}else return NaN;}return sum+n;
}
export function normalizeSpeech(text){
 return String(text).replace(/([영공일이삼사오육칠팔구십백천한두세네다섯여섯일곱여덟아홉열하나둘셋넷]+)\s*(년|월|일|시|분)(?!요일)/g,(all,n,unit)=>{const value=koreanNumber(n);return Number.isFinite(value)?value+unit:all;}).replace(/(오전|오후)\s*/g,'$1 ').replace(/(\d)\s*[:：]\s*(\d{2})/g,'$1:$2');
}
const datePattern=/(?:\d{4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}[-./]\d{1,2}[-./]\d{1,2}|오늘|내일|모레|(?:(?:이번\s*주|다음\s*주|다다음\s*주)\s*)?[월화수목금토일]요일/g;
function dateFor(token,reference){
 const date=new Date(reference+'T12:00'),relative={오늘:0,내일:1,모레:2};
 if(token in relative){date.setDate(date.getDate()+relative[token]);return localInput(date).slice(0,10);}
 const numeric=token.match(/^(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일$/)||token.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
 if(numeric)return `${numeric[1]||date.getFullYear()}-${numeric[2].padStart(2,'0')}-${numeric[3].padStart(2,'0')}`;
 const week=token.match(/^(?:(이번\s*주|다음\s*주|다다음\s*주)\s*)?([월화수목금토일])요일$/);
 if(week){const day='일월화수목금토'.indexOf(week[2]);if(week[1]){const mondayOffset=(date.getDay()+6)%7,target=(day+6)%7,weeks=week[1].replace(/\s/g,'')==='다다음주'?2:week[1].replace(/\s/g,'')==='다음주'?1:0;date.setDate(date.getDate()-mondayOffset+target+weeks*7);}else date.setDate(date.getDate()+(day-date.getDay()+7)%7);return localInput(date).slice(0,10);}
 return null;
}
export function parseVoice(text,reference=localInput(new Date()).slice(0,10)){
 if(!validDate(reference)||reference.length!==10)throw Error('기준 날짜를 확인해 주세요.');
 const warnings=[],events=[];
 let normalized=normalizeSpeech(text).trim();
 normalized=normalized.replace(/((?:\d{4}\s*년\s*)?\d{1,2}\s*월\s*\d{1,2}\s*일|\d{4}[-./]\d{1,2}[-./]\d{1,2}|오늘|내일|모레)\s*\(?([월화수목금토일])요일\)?/g,(all,day,week)=>{const date=dateFor(day,reference);if(date&&validDate(date)&&new Date(date+'T12:00').getDay()!=='일월화수목금토'.indexOf(week)){warnings.push('날짜와 요일이 서로 맞지 않는 문장이 있습니다. 날짜를 확인해 다시 입력해 주세요.');return '__요일불일치__';}return day;});
 if(normalized.includes('__요일불일치__'))return {events:[],warnings};
 const dates=[...normalized.matchAll(datePattern)];
 if(!dates.length)return {events,warnings:['날짜를 찾지 못했습니다. “내일 오후 3시 병원 예약”처럼 날짜부터 말해 주세요.']};
 if(dates.length>50)throw Error('음성 일정은 한 번에 50개까지 처리할 수 있습니다.');
 for(let i=0;i<dates.length;i++){
  const match=dates[i],date=dateFor(match[0],reference);let body=normalized.slice(match.index+match[0].length,dates[i+1]?.index??normalized.length);
  if(i===0&&match.index>0)body=normalized.slice(0,match.index)+' '+body;
  const clock=/(오전|오후)?\s*(\d{1,2})(?::(\d{2})|시(?!간)\s*(?:(\d{1,2})\s*분|(반))?)(?:\s*(?:에|부터|까지))?/g;
  const times=[...body.matchAll(clock)];let invalid=false;
  const parsed=times.map(t=>{let h=+t[2],m=+(t[3]||t[4]||(t[5]?'30':'0'));if(h>23||m>59||(t[1]&&(h<1||h>12)))invalid=true;if(t[1])h=h%12+(t[1]==='오후'?12:0);return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;});
  if(!date||!validDate(date)||invalid||times.length>2){warnings.push(`${i+1}번째: 날짜 또는 시간을 올바르게 읽지 못했습니다.`);continue;}
  body=body.replace(clock,' ').replace(/(?:캘린더에|달력에|일정으로)\s*/g,'').replace(/(?:일정\s*)?(?:추가|등록|넣어|저장)(?:해\s*줘|해\s*주세요|해|줘|주세요)?[.!。]?\s*$/,'').replace(/(?:그리고|다음은|다음\s*일정은|이어서)\s*[,，.]?\s*$/,'').replace(/^[\s,，.;:~∼～–—]+|[\s,，.;:~∼～–—]+$/g,'').replace(/^에\s+/,'').replace(/\s+/g,' ').trim();
  if(!body){warnings.push(`${i+1}번째: 일정 제목을 말해 주세요.`);continue;}
  const allDay=!times.length,start=allDay?date:date+'T'+parsed[0],end=allDay?date:times.length===2?date+'T'+parsed[1]:localInput(new Date(+new Date(start)+3600000));
  const event={id:id(),title:body.slice(0,200),start,end,allDay,selected:true,location:''};const error=validateEvent(event);if(error){warnings.push(`${i+1}번째: ${error}`);continue;}
  events.push(event);
  if(!match[0].match(/\d{4}/)&&/월/.test(match[0])&&/일/.test(match[0]))warnings.push(`${i+1}번째: 연도는 기준 날짜의 ${reference.slice(0,4)}년을 적용했습니다.`);
  if(times.length===1)warnings.push(`${i+1}번째: 종료는 1시간 후로 제안했습니다.`);
  if(!times.length)warnings.push(`${i+1}번째: 시간이 없어 종일 일정으로 표시했습니다.`);
  if(times.some(t=>!t[1]&&+t[2]>=1&&+t[2]<=12))warnings.push(`${i+1}번째: 오전·오후를 말하지 않은 시간입니다. 확인해 주세요.`);
 }
 return {events,warnings};
}
