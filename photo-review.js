import {checkQuad,mapQuad,monthGrid,cellDraft,reviewedEvent} from './photo-grid.js?v=2.1';
import {DocumentReader} from './recognition.js?v=2.1';

export function setupPhotoReview(onAdd) {
 const $=s=>document.querySelector(s),preview=$('#photo-canvas');
 let imageCanvas=null,points=[],drafts=[],running=false,reader=null,epoch=0;
 const message=(text,error=false)=>{$('#photo-status').textContent=text;$('#photo-status').classList.toggle('error',error);};
 const busy=value=>{running=value;for(const selector of ['#photo-input','#photo-reset','#photo-month','#photo-rows','#photo-week','#photo-build','#photo-read','#photo-add'])$(selector).disabled=value;$('#photo-stop').hidden=!value;};
 function draw(){if(!imageCanvas)return;const ctx=preview.getContext('2d');ctx.drawImage(imageCanvas,0,0);ctx.lineWidth=Math.max(3,preview.width/350);ctx.strokeStyle='#e78b27';ctx.fillStyle='#d97716';ctx.font=`bold ${Math.max(20,preview.width/40)}px sans-serif`;if(points.length){ctx.beginPath();points.forEach((p,i)=>{if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});if(points.length===4)ctx.closePath();ctx.stroke();points.forEach((p,i)=>{ctx.beginPath();ctx.arc(p.x,p.y,Math.max(7,preview.width/150),0,Math.PI*2);ctx.fill();ctx.fillText(String(i+1),p.x+12,p.y-12);});}}
 function invalidate(){drafts=[];$('#photo-cells').replaceChildren();}
 function reset(){points=[];invalidate();draw();message('날짜 칸만 포함하도록 왼쪽 위 → 오른쪽 위 → 오른쪽 아래 → 왼쪽 아래를 눌러 주세요. 요일 제목은 제외합니다.');}
 $('#photo-input').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{
   if(file.size>15*1024*1024)throw Error('15MB 이하의 사진을 넣어 주세요.');
   const url=URL.createObjectURL(file);let img;
   try{img=new Image();img.src=url;await img.decode();}finally{URL.revokeObjectURL(url);}
   if(img.naturalWidth*img.naturalHeight>50000000)throw Error('사진이 너무 큽니다. 달력 부분만 잘라 주세요.');
   const scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));imageCanvas=document.createElement('canvas');imageCanvas.width=preview.width=Math.round(img.naturalWidth*scale);imageCanvas.height=preview.height=Math.round(img.naturalHeight*scale);
   const ctx=imageCanvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,imageCanvas.width,imageCanvas.height);ctx.drawImage(img,0,0,imageCanvas.width,imageCanvas.height);preview.hidden=false;reset();
  }catch(e){message(e.message||'사진을 열지 못했습니다.',true);}
 };
 preview.addEventListener('click',e=>{if(!imageCanvas||running)return;if(points.length===4){message('다시 지정하려면 “모서리 다시 지정”을 눌러 주세요.');return;}const rect=preview.getBoundingClientRect();points.push({x:(e.clientX-rect.left)*preview.width/rect.width,y:(e.clientY-rect.top)*preview.height/rect.height});draw();message(`${points.length}/4 모서리 지정${points.length===4?' 완료. 연월·줄 수를 확인하고 “날짜별 칸 펼치기”를 누르세요.':''}`);});
 $('#photo-reset').onclick=reset;
 function syncMonth(){try{const grid=monthGrid($('#photo-month').value,+$('#photo-week').value);$('#photo-rows').value=grid.rows;}catch{}invalidate();}
 $('#photo-month').onchange=syncMonth;$('#photo-week').onchange=syncMonth;$('#photo-rows').onchange=invalidate;
 function rectify(rows){
  checkQuad(points);const width=1400,height=rows*180,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const input=imageCanvas.getContext('2d').getImageData(0,0,imageCanvas.width,imageCanvas.height),ctx=canvas.getContext('2d'),output=ctx.createImageData(width,height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const p=mapQuad(points,x/(width-1),y/(height-1));const sx=Math.max(0,Math.min(input.width-1,Math.round(p.x))),sy=Math.max(0,Math.min(input.height-1,Math.round(p.y))),i=(sy*input.width+sx)*4,o=(y*width+x)*4;
   output.data[o]=input.data[i];output.data[o+1]=input.data[i+1];output.data[o+2]=input.data[i+2];output.data[o+3]=255;
  }
  ctx.putImageData(output,0,0);return canvas;
 }
 $('#photo-build').onclick=()=>{
  try{
   if(!imageCanvas)throw Error('먼저 사진을 선택해 주세요.');
   const grid=monthGrid($('#photo-month').value,+$('#photo-week').value),rows=+$('#photo-rows').value;if(rows<grid.rows)throw Error(`이 연월은 최소 ${grid.rows}줄이 필요합니다. 실제 달력의 줄 수를 확인해 주세요.`);
   const flat=rectify(rows);invalidate();
   for(const day of grid.dates){
    const card=document.createElement('article');card.className='photo-cell';
    const head=document.createElement('label'),selected=document.createElement('input');selected.type='checkbox';head.append(selected,document.createTextNode(day.date+' 확인 완료'));
    const crop=document.createElement('canvas');crop.width=390;crop.height=250;crop.setAttribute('aria-label',day.date+' 칸 사진');const ctx=crop.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,crop.width,crop.height);ctx.drawImage(flat,day.col*200+5,day.row*180+36,190,139,0,0,390,250);
    const titleLabel=document.createElement('label');titleLabel.textContent='제목';const title=document.createElement('input');title.type='text';title.maxLength=200;title.placeholder='사진을 보고 입력하거나 칸별 인식 후 수정';titleLabel.append(title);
    const timeLabel=document.createElement('label');timeLabel.textContent='시작 시간 (없으면 종일)';const time=document.createElement('input');time.type='time';timeLabel.append(time);
    const note=document.createElement('p');note.className='small-note';note.textContent='빈 칸은 선택하지 마세요. 손글씨 제목·시간 확인이 필요합니다.';
    card.append(head,crop,titleLabel,timeLabel,note);$('#photo-cells').append(card);drafts.push({day,selected,title,time,note,crop});
   }
   message(`${drafts.length}일의 칸을 펼쳤습니다. 날짜는 선택한 연월과 첫 요일로 계산했습니다. 사진의 날짜와 맞는지 먼저 확인하세요.`);
  }catch(e){message(e.message,true);}
 };
 $('#photo-read').onclick=async()=>{
  if(!drafts.length){message('먼저 “날짜별 칸 펼치기”를 눌러 주세요.',true);return;}
  if(drafts.some(d=>d.title.value||d.time.value)&&!confirm('칸별로 수정한 제목과 시간을 OCR 결과로 바꿀까요?'))return;
  const token=++epoch,current=new DocumentReader({mode:'list'},()=>{});reader=current;busy(true);
  try{
   const worker=await current.getWorker();await worker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});
   for(let i=0;i<drafts.length;i++){
    if(token!==epoch)break;message(`${i+1}/${drafts.length} 칸 읽는 중… 손글씨는 확인 후 선택해야 합니다.`);
    const item=drafts[i],{data}=await worker.recognize(item.crop);if(token!==epoch)break;
    const result=cellDraft(data.text,item.day.date);item.title.value=result.title;item.time.value=result.time;item.selected.checked=false;item.note.textContent=result.warning+(data.confidence<60?' 인식 신뢰도가 낮습니다.':'');
   }
   if(token===epoch)message('칸별 읽기가 끝났습니다. 사진과 제목·시간을 비교하고 필요한 날짜에만 “확인 완료”를 체크하세요. 자동 선택하지 않았습니다.');
  }catch(e){if(token===epoch)message('칸별 인식을 완료하지 못했습니다. 사진을 보고 제목·시간을 직접 입력할 수 있습니다.',true);}
  finally{await current.close();if(token===epoch){reader=null;busy(false);}}
 };
 $('#photo-stop').onclick=async()=>{epoch++;const current=reader;reader=null;await current?.cancel();busy(false);message('인식을 취소했습니다. 이미 읽은 칸은 남겨두었습니다.');};
 $('#photo-add').onclick=()=>{try{const selected=drafts.filter(d=>d.selected.checked);if(!selected.length)throw Error('사진과 내용을 확인한 날짜에 “확인 완료”를 체크해 주세요.');const result=selected.map(d=>reviewedEvent(d.day.date,d.title.value,d.time.value));const added=onAdd(result);selected.forEach(d=>d.selected.checked=false);message(`확인한 일정 ${added}개를 오른쪽 목록에 추가했습니다. 중복 일정은 제외했습니다.`);}catch(e){message(e.message,true);}};
}
