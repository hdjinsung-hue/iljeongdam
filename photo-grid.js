import {id,validDate,localInput} from './calendar.js';

export function checkQuad(points) {
 if(points.length!==4||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('달력 표의 네 모서리를 순서대로 지정해 주세요.');
 const turns=points.map((p,i)=>{const q=points[(i+1)%4],r=points[(i+2)%4];return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x);});
 if(turns.some(t=>t<=0))throw Error('왼쪽 위 → 오른쪽 위 → 오른쪽 아래 → 왼쪽 아래 순서로 지정해 주세요.');
 const area=Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%4];return s+p.x*q.y-q.x*p.y;},0))/2;
 if(area<400)throw Error('선택한 달력 영역이 너무 작습니다.');
}
export function mapQuad(points,u,v) {
 const [a,b,c,d]=points;
 const dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x;
 const dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y;
 const det=dx1*dy2-dx2*dy1;
 const g=det?(dx3*dy2-dx2*dy3)/det:0,h=det?(dx1*dy3-dx3*dy1)/det:0;
 const denom=g*u+h*v+1;
 return {x:((b.x-a.x+g*b.x)*u+(d.x-a.x+h*d.x)*v+a.x)/denom,y:((b.y-a.y+g*b.y)*u+(d.y-a.y+h*d.y)*v+a.y)/denom};
}
export function monthGrid(month,weekStart=0) {
 if(!/^(19\d{2}|20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month))throw Error('사진에 해당하는 연월을 선택해 주세요.');
 const [year,m]=month.split('-').map(Number),first=new Date(year,m-1,1,12);
 const offset=(first.getDay()-weekStart+7)%7,days=new Date(year,m,0,12).getDate();
 return {offset,days,rows:Math.ceil((offset+days)/7),dates:Array.from({length:days},(_,i)=>({date:`${month}-${String(i+1).padStart(2,'0')}`,row:Math.floor((offset+i)/7),col:(offset+i)%7}))};
}
export function cellDraft(text,date) {
 const normalized=text.replace(/(\d)\s*[:.：]\s*(\d{2})/g,'$1:$2');
 const times=[...normalized.matchAll(/(?:오전|오후)?\s*\d{1,2}:\d{2}/g)];
 let title=normalized;for(const t of times)title=title.replace(t[0],' ');
 title=title.replace(/[~∼～|]+/g,' ').replace(/\s+/g,' ').trim().slice(0,200);
 let time='';if(times[0]){const m=times[0][0].match(/(오전|오후)?\s*(\d{1,2}):(\d{2})/);let h=+m[2],min=+m[3];if(m[1]){if(h<1||h>12)return {title,time:'',warning:'시간을 직접 확인해 주세요.'};h=h%12+(m[1]==='오후'?12:0);}if(h<=23&&min<=59)time=`${String(h).padStart(2,'0')}:${m[3]}`;}
 return {title,time,warning:times.length>1?'한 칸에 시간 후보가 여러 개입니다. 별도 일정은 직접 추가해 주세요.':'손글씨 제목과 시간을 확인한 뒤 선택해 주세요.'};
}
export function reviewedEvent(date,title,time) {
 if(!validDate(date)||date.length!==10)throw Error('올바른 날짜를 선택해 주세요.');
 if(!title.trim())throw Error(`${date}: 제목을 입력해 주세요.`);
 if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error(`${date}: 올바른 시간을 입력해 주세요.`);
 const start=time?date+'T'+time:date;
 return {id:id(),title:title.trim().slice(0,200),start,end:time?localInput(new Date(+new Date(start)+3600000)):date,allDay:!time,location:'',selected:true};
}
