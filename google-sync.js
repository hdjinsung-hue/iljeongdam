import {localInput,validateEvent,id} from './calendar.js';

export const GOOGLE_SCOPE='openid email https://www.googleapis.com/auth/calendar.events';
export function eventFingerprint(event){return JSON.stringify([event.title.trim(),event.start,event.end,event.allDay,event.location||'']);}
export function toGoogleEvent(event,remind=true){
 const error=validateEvent(event);if(error)throw Error(error);
 let start,end;if(event.allDay){const next=new Date(event.end+'T00:00');next.setDate(next.getDate()+1);start={date:event.start};end={date:localInput(next).slice(0,10)};}
 else{start={dateTime:new Date(event.start).toISOString()};end={dateTime:new Date(event.end).toISOString()};}
 return {summary:event.title.trim(),location:event.location||'',start,end,extendedProperties:{private:{iljeongdam:'1',localId:event.id}},reminders:event.allDay||!remind?{useDefault:true}:{useDefault:false,overrides:[{method:'popup',minutes:10}]}};
}
export function fromGoogleEvent(remote,account){
 if(remote.status==='cancelled'||remote.recurringEventId)return null;
 const allDay=!!remote.start?.date;let start,end;
 if(allDay){start=remote.start.date;const next=new Date(remote.end?.date+'T00:00');if(!Number.isFinite(+next))return null;next.setDate(next.getDate()-1);end=localInput(next).slice(0,10);}
 else{const a=new Date(remote.start?.dateTime),b=new Date(remote.end?.dateTime);if(!Number.isFinite(+a)||!Number.isFinite(+b))return null;start=localInput(a);end=localInput(b);}
 const event={id:id(),title:remote.summary||'제목 없는 일정',start,end,allDay,location:remote.location||'',selected:false,googleId:remote.id,googleEtag:remote.etag,googleAccount:account};
 if(validateEvent(event))return null;event.googleFingerprint=eventFingerprint(event);return event;
}
export class GoogleCalendarSync{
 constructor(fetcher=globalThis.fetch.bind(globalThis)){this.fetcher=fetcher;this.token='';this.expires=0;this.account=null;this.generation=0;}
 get connected(){return !!this.account&&!!this.token&&Date.now()<this.expires;}
 disconnect(){this.generation++;this.token='';this.expires=0;this.account=null;}
 async authenticate(token,seconds=3600){this.disconnect();const generation=this.generation;this.token=token;this.expires=Date.now()+Math.max(0,seconds-60)*1000;
  try{const response=await this.fetcher('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(!response.ok)throw Error('Google 계정을 확인하지 못했습니다. 다시 연결해 주세요.');const profile=await response.json();if(!profile.sub||!profile.email||!profile.email_verified)throw Error('확인된 Google 계정 정보가 없습니다.');if(generation!==this.generation)throw Error('연결이 취소되었습니다.');this.account={id:profile.sub,email:profile.email};return this.account;}catch(e){if(generation===this.generation)this.disconnect();throw e;}}
 async request(path,options={}){
  if(!this.connected){this.disconnect();throw Error('Google 연결이 만료되었습니다. 다시 연결해 주세요.');}
  const generation=this.generation,token=this.token;
  let response;try{response=await this.fetcher('https://www.googleapis.com/calendar/v3/calendars/primary/events'+path,{...options,cache:'no-store',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...options.headers}});}catch{throw Error('인터넷 연결을 확인해 주세요. 일정 초안은 유지됩니다.');}
  if(generation!==this.generation)throw Error('Google 연결이 변경되어 작업을 멈췄습니다.');
  if(response.status===401){this.disconnect();throw Error('Google 연결이 만료되었습니다. 다시 연결해 주세요.');}
  if(!response.ok){const error=Error(response.status===412?'다른 기기에서 이 일정을 수정했습니다. Google 캘린더와 내용을 비교한 후 다시 저장해 주세요.':response.status===403?'Google 캘린더 권한이 없습니다. 연결 설정과 테스트 사용자 등록을 확인해 주세요.':response.status===404?'Google 캘린더에서 이 일정이 삭제되었습니다. 목록을 새로고침해 주세요.':`Google 캘린더 요청에 실패했습니다 (${response.status}).`);error.status=response.status;throw error;}
  return response.status===204?null:response.json();
 }
 async save(event,remind=true){
  const payload=toGoogleEvent(event,remind),generation=this.generation;
  if(event.googleAccount&&event.googleAccount!==this.account?.id)throw Error('다른 Google 계정의 일정은 저장하지 않았습니다. 해당 계정으로 연결해 주세요.');
  let resource;
  if(event.googleId){if(!event.googleEtag)throw Error('이 일정의 최신 정보를 먼저 불러와 주세요.');resource=await this.request('/'+encodeURIComponent(event.googleId),{method:'PATCH',headers:{'If-Match':event.googleEtag},body:JSON.stringify(payload)});}
  else{
   const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(event.id));if(generation!==this.generation)throw Error('Google 연결이 변경되었습니다.');
   const remoteId='ild'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
   try{resource=await this.request('',{method:'POST',body:JSON.stringify({...payload,id:remoteId})});}
   catch(e){if(e.status!==409)throw e;const existing=await this.request('/'+remoteId);const recovered=fromGoogleEvent(existing,this.account.id);if(existing.extendedProperties?.private?.localId!==event.id||!recovered||eventFingerprint(recovered)!==eventFingerprint(event))throw Error('이미 등록된 일정의 내용이 다릅니다. 목록을 새로고침해 확인해 주세요.');resource=existing;}
  }
  if(!resource?.id||!resource.etag)throw Error('저장 결과를 확인하지 못했습니다. 다시 동기화하면 중복 없이 확인합니다.');
  return {...event,googleId:resource.id,googleEtag:resource.etag,googleAccount:this.account.id,googleFingerprint:eventFingerprint(event),syncConflict:false};
 }
 async list(){
  const resources=[];let pageToken='';
  do{const query=new URLSearchParams({maxResults:'250',privateExtendedProperty:'iljeongdam=1',showDeleted:'false'});if(pageToken)query.set('pageToken',pageToken);const result=await this.request('?'+query);resources.push(...(result.items||[]));if(resources.length>3000)throw Error('연동 일정이 너무 많습니다. Google 캘린더에서 오래된 일정을 정리해 주세요.');pageToken=result.nextPageToken||'';}while(pageToken);
  return resources;
 }
 async remove(event){if(event.googleAccount!==this.account?.id)throw Error('이 일정의 Google 계정으로 연결해 주세요.');if(!event.googleEtag)throw Error('최신 일정 정보를 먼저 불러와 주세요.');return this.request('/'+encodeURIComponent(event.googleId),{method:'DELETE',headers:{'If-Match':event.googleEtag}});}
}
export function reconcileGoogle(local,resources,account){
 const byId=new Map(resources.filter(r=>r.status!=='cancelled').map(r=>[r.id,r])),result=[],conflicts=[];let skipped=0;
 for(const event of local){
  if(!event.googleId){const recovered=[...byId.values()].find(r=>r.extendedProperties?.private?.localId===event.id);const converted=recovered&&fromGoogleEvent(recovered,account);if(converted&&eventFingerprint(converted)===eventFingerprint(event)){result.push({...converted,id:event.id,selected:event.selected});byId.delete(recovered.id);}else result.push(event);continue;}
  if(event.googleAccount!==account){result.push(event);continue;}
  const remote=byId.get(event.googleId);byId.delete(event.googleId);
  const dirty=event.googleFingerprint!==eventFingerprint(event);
  if(!remote){if(dirty){result.push({...event,syncConflict:true});conflicts.push(event.title);}continue;}
  const converted=fromGoogleEvent(remote,account);if(!converted){result.push(event);skipped++;continue;}
  if(dirty){const conflict=remote.etag!==event.googleEtag;result.push({...event,syncConflict:conflict});if(conflict)conflicts.push(event.title);}
  else result.push({...converted,id:event.id,selected:event.selected});
 }
 for(const remote of byId.values()){const event=fromGoogleEvent(remote,account);if(event)result.push(event);else skipped++;}
 if(result.length>300)throw Error('일정 목록이 300개를 넘습니다. 이 기기의 초안을 정리한 후 다시 불러와 주세요.');
 return {events:result,conflicts,skipped};
}
