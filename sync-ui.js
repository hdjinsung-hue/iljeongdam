import {validateEvent} from './calendar.js';
import {GOOGLE_CLIENT_ID} from './google-config.js?v=4.0';
import {GoogleCalendarSync,reconcileGoogle,eventFingerprint} from './google-sync.js?v=4.0';

export function setupSync({getEvents,setEvents}){
 const $=s=>document.querySelector(s),client=new GoogleCalendarSync();let working=false,loading=null,lastRefresh=0,gisReady=!!window.google?.accounts?.oauth2;
 let clientId=GOOGLE_CLIENT_ID;try{clientId||=localStorage.getItem('iljeongdam.googleClientId')||'';}catch{}
 const status=(text,error=false)=>{$('#sync-status').textContent=text;$('#sync-status').classList.toggle('error',error);};
 function controls(){const connected=client.connected;$('#google-connect').disabled=working||!clientId||!gisReady;$('#google-connect').textContent=!clientId?'Google 연동 설정 필요':gisReady?'Google 연결':'Google 로그인 준비 중…';$('#google-pull').disabled=working||!connected;$('#google-save').disabled=working||!connected;$('#google-disconnect').disabled=working||!client.account;$('#google-config-save').disabled=working||!!client.account;$('#google-client-id').disabled=working||!!client.account;$('#sync-account').textContent=connected?`${client.account.email} · 기본 캘린더`:client.account?'연결 만료 · 다시 연결 필요':clientId?'연결 전':'Google 연동 설정 필요';document.dispatchEvent(new CustomEvent('sync-state',{detail:{connected}}));}
 $('#google-client-id').value=clientId;
 $('#google-config-save').onclick=()=>{const value=$('#google-client-id').value.trim();if(!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(value)){status('Google Cloud에서 발급한 웹 OAuth 클라이언트 ID를 확인해 주세요.',true);return;}try{localStorage.setItem('iljeongdam.googleClientId',value);clientId=value;status('이 브라우저에 연결 설정을 저장했습니다. Google 연결을 눌러 주세요.');controls();prepare();}catch{status('이 브라우저에 연결 설정을 저장하지 못했습니다.',true);}};
 function gis(){if(window.google?.accounts?.oauth2)return Promise.resolve();if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.onload=()=>window.google?.accounts?.oauth2?resolve():reject(Error('Google 로그인 기능을 초기화하지 못했습니다.'));script.onerror=()=>{loading=null;script.remove();reject(Error('Google 로그인에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'));};document.head.append(script);});return loading;}
 async function pull(show=true){const remote=await client.list();const merged=reconcileGoogle(getEvents(),remote,client.account.id);setEvents(merged.events);lastRefresh=Date.now();if(show)status(merged.conflicts.length?`다른 기기와 내용이 다른 일정 ${merged.conflicts.length}개가 있습니다. 해당 일정은 덮어쓰지 않았습니다. Google 캘린더에서 내용을 확인해 주세요.`:`Google에 등록된 일정담 일정을 불러왔습니다.${merged.skipped?' 지원하지 않는 반복 일정 등 '+merged.skipped+'개는 가져오지 않았습니다.':''}`,!!merged.conflicts.length);}
 async function withWork(action){if(working)return;working=true;controls();try{await action();}catch(e){status(e.message,true);}finally{working=false;controls();}}
 async function prepare(){if(!clientId||gisReady)return;try{await gis();gisReady=true;controls();status('Google 연결을 눌러 사용할 계정을 선택해 주세요.');}catch(e){status(e.message+' 연결 설정 저장을 다시 눌러 재시도할 수 있습니다.',true);controls();}}
 $('#google-connect').onclick=async()=>{
  if(working||!clientId)return;working=true;controls();status('Google 로그인 화면을 준비합니다…');
  try{if(!gisReady)throw Error('Google 로그인 준비가 필요합니다.');const tokenClient=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'openid email https://www.googleapis.com/auth/calendar.events',include_granted_scopes:true,callback:async response=>{
   try{if(response.error||!response.access_token)throw Error('Google 캘린더 연결이 완료되지 않았습니다. 권한과 계정 설정을 확인해 주세요.');await client.authenticate(response.access_token,+response.expires_in||3600);await pull();}catch(e){status(e.message,true);}finally{working=false;controls();}
  },error_callback:()=>{working=false;controls();status('Google 로그인 창이 닫혔거나 차단되었습니다. 다시 연결해 주세요.',true);}});tokenClient.requestAccessToken({prompt:'select_account'});}catch(e){status(e.message,true);working=false;controls();}
 };
 $('#google-pull').onclick=()=>withWork(()=>pull());
 $('#google-save').onclick=()=>withWork(async()=>{
  const account=client.account?.id;const selected=getEvents().filter(e=>e.selected&&(!e.googleAccount||e.googleAccount===account));
  if(!selected.length)throw Error('현재 Google 계정에 등록할 일정을 선택해 주세요.');
  const invalid=selected.map(validateEvent).find(Boolean);if(invalid)throw Error(invalid);
  if(selected.some(e=>e.syncConflict))throw Error('충돌 표시가 있는 일정은 저장하지 않았습니다. Google 캘린더와 내용을 먼저 확인해 주세요.');
  let count=0;for(const snapshot of selected){const event=getEvents().find(e=>e.id===snapshot.id);if(!event)continue;if(event.googleId&&event.googleFingerprint===eventFingerprint(event))continue;
   status(`${count+1}/${selected.length} Google에 저장하는 중…`);const fingerprint=eventFingerprint(event),saved=await client.save({...event},$('#google-reminder').checked);
   const current=getEvents();setEvents(current.map(e=>e.id===saved.id?{...saved,...(eventFingerprint(e)!==fingerprint?{title:e.title,start:e.start,end:e.end,allDay:e.allDay,location:e.location}:{}),selected:e.selected}:e));count++;
  }
  await pull(false);status(`${count}개 일정을 Google 캘린더에 저장했습니다. 같은 계정의 휴대폰 캘린더에서 확인하세요. 잠금화면 표시에는 휴대폰 알림·위젯 설정이 필요합니다.`);
 });
 $('#google-disconnect').onclick=()=>{client.disconnect();controls();status('이 기기의 Google 연결을 해제했습니다. 캘린더에 등록된 일정은 유지됩니다.');};
 async function remove(event){if(!event.googleId)return true;if(working)throw Error('동기화가 끝난 후 삭제해 주세요.');if(!client.connected)throw Error('등록된 일정을 삭제하려면 해당 Google 계정으로 먼저 연결해 주세요.');if(!confirm('Google 캘린더에서도 이 일정을 삭제할까요? 다른 기기에도 반영됩니다.'))return false;working=true;controls();try{await client.remove(event);status('Google 캘린더에서 일정을 삭제했습니다.');return true;}finally{working=false;controls();}}
 function foreground(){if(document.visibilityState==='visible'&&client.connected&&!working&&Date.now()-lastRefresh>60000)withWork(()=>pull(false));else controls();}
 document.addEventListener('visibilitychange',foreground);window.addEventListener('online',foreground);setInterval(foreground,60000);
 controls();if(!clientId)status('Google 연동은 앱 소유자의 로그인 설정이 필요합니다. 설정 전에는 음성 일정 초안과 파일 내보내기를 사용할 수 있습니다.');
 prepare();return {remove,refreshControls:controls};
}
