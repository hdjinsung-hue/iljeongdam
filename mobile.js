export function setupMobile(){
 const $=s=>document.querySelector(s);let supported=!!(window.SpeechRecognition||window.webkitSpeechRecognition),listening=false,installPrompt=null;
 const mic=$('#mobile-mic');function update(){mic.textContent=listening?'■ 말하기 완료':supported?'🎙 마이크로 일정 말하기':'키보드 마이크로 받아쓰기';mic.setAttribute('aria-label',mic.textContent);}
 mic.onclick=()=>{if(listening){$('#voice-stop').click();return;}$('#voice-title').scrollIntoView({behavior:'smooth',block:'center'});if(supported)$('#voice-start').click();else $('#voice-text').focus();};
 document.addEventListener('voice-state',e=>{supported=e.detail.supported;listening=e.detail.listening;update();});update();
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install-app').hidden=false;});
 $('#install-app').onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('#install-app').hidden=true;};
 window.addEventListener('appinstalled',()=>{$('#install-app').hidden=true;installPrompt=null;});
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{$('#install-note').textContent='앱 설치 준비를 완료하지 못했습니다. 브라우저로 계속 사용할 수 있습니다.';});
}
