import {parseVoice} from './voice-parser.js?v=3.0';
import {localInput} from './calendar.js';
export function setupVoiceInput(onAdd){
 const $=s=>document.querySelector(s),Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
 let recognition=null,listening=false,cancelled=false,hadError=false,base='',finalText='';
 $('#voice-date').value=localInput(new Date()).slice(0,10);
 const status=(text,error=false)=>{$('#voice-status').textContent=text;$('#voice-status').classList.toggle('error',error);};
 const busy=value=>{listening=value;$('#voice-start').disabled=value||!Speech;$('#voice-stop').disabled=!value;$('#voice-cancel').disabled=!value;$('#voice-create').disabled=value;$('#voice-text').readOnly=value;$('#voice-sample').disabled=value;};
 function build(){try{const value=$('#voice-text').value.trim();if(!value)throw Error('일정 내용을 말하거나 입력해 주세요.');const result=parseVoice(value,$('#voice-date').value);if(!result.events.length){status(result.warnings.join(' / '),true);return;}const count=onAdd(result.events);status(`${count}개 일정 초안을 만들었습니다. 오른쪽 목록에서 날짜·시간·제목을 확인하세요.${result.events.length>count?' 중복은 제외했습니다.':''}${result.warnings.length?'\n'+result.warnings.slice(0,5).join(' / '):''}`);}catch(e){status(e.message,true);}}
 if(!Speech)status('이 브라우저는 웹 음성 인식을 지원하지 않습니다. 아래 입력칸을 누르고 휴대폰 키보드의 마이크로 받아쓰기한 후 “말한 내용으로 일정 만들기”를 누르세요.');
 $('#voice-start').onclick=()=>{
  if(listening||!Speech)return;
  if(!window.isSecureContext){status('음성 인식은 HTTPS에서 사용할 수 있습니다.',true);return;}
  cancelled=false;hadError=false;base=$('#voice-text').value.trim();finalText='';
  recognition=new Speech();recognition.lang='ko-KR';recognition.continuous=true;recognition.interimResults=true;recognition.maxAlternatives=1;
  recognition.onresult=e=>{let interim='';finalText='';for(let i=0;i<e.results.length;i++){if(e.results[i].isFinal)finalText+=e.results[i][0].transcript+' ';else interim+=e.results[i][0].transcript;}$('#voice-text').value=[base,finalText.trim(),interim.trim()].filter(Boolean).join('\n');};
  recognition.onerror=e=>{hadError=true;const errors={'not-allowed':'마이크 권한이 거부되었습니다. 브라우저 사이트 설정에서 마이크를 허용하거나 키보드 받아쓰기를 사용해 주세요.','service-not-allowed':'음성 인식 서비스를 사용할 수 없습니다. 키보드 받아쓰기를 사용해 주세요.','audio-capture':'마이크를 사용할 수 없습니다. 다른 앱이 마이크를 사용 중인지 확인해 주세요.','no-speech':'음성을 듣지 못했습니다. 다시 말하거나 키보드 받아쓰기를 사용해 주세요.','network':'음성 인식 서비스 연결에 실패했습니다. 인터넷 연결을 확인하거나 키보드 받아쓰기를 사용해 주세요.'};status(errors[e.error]||'음성 인식을 마치지 못했습니다. 입력된 내용을 확인하거나 다시 시도해 주세요.',true);};
  recognition.onend=()=>{busy(false);recognition=null;if(cancelled){status('음성 인식을 취소했습니다. 일정은 추가하지 않았습니다.');return;}$('#voice-text').value=[base,finalText.trim()].filter(Boolean).join('\n');if(!hadError&&finalText.trim())build();else if(!hadError)status('인식된 문장이 없습니다. 다시 말하거나 키보드 받아쓰기를 사용해 주세요.',true);};
  try{recognition.start();busy(true);status('듣고 있습니다. 날짜·오전/오후·시간·제목 순서로 말하고 “말하기 완료”를 누르세요.');}catch{recognition=null;busy(false);status('음성 인식을 시작하지 못했습니다. 키보드 받아쓰기를 사용해 주세요.',true);}
 };
 $('#voice-stop').onclick=()=>recognition?.stop();
 $('#voice-cancel').onclick=()=>{cancelled=true;recognition?.abort();};
 $('#voice-create').onclick=build;
 $('#voice-sample').onclick=()=>{$('#voice-text').value='내일 오후 3시 병원 예약\n다음 주 월요일 오전 10시 팀 회의';status('예시를 넣었습니다. “말한 내용으로 일정 만들기”를 눌러보세요.');};
 busy(false);
}
