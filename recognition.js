import {positionedText,groupWords} from './document-layout.js';
import {readExcel,readWord} from './office-import.js';

export class DocumentReader {
  constructor(options,onProgress=()=>{}){this.options=options;this.onProgress=onProgress;this.cancelled=false;this.worker=null;this.task=null;}
  check(){if(this.cancelled)throw Error('취소됨');}
  async close(){const worker=this.worker;this.worker=null;await worker?.terminate();}
  async cancel(){this.cancelled=true;const task=this.task;this.task=null;await Promise.allSettled([this.close(),task?.destroy()]);}
  async getWorker(){
    this.check();if(this.worker)return this.worker;
    if(!globalThis.Tesseract)throw Error('문자 인식 기능을 불러오지 못했습니다. 페이지를 새로고침해 주세요.');
    const worker=await Tesseract.createWorker('kor+eng',1,{
      workerPath:new URL('./vendor/worker.min.js',import.meta.url).href,
      corePath:new URL('./vendor/tesseract-core-lstm.wasm.js',import.meta.url).href,
      langPath:new URL('./vendor/',import.meta.url).href,
      logger:m=>{if(!this.cancelled)this.onProgress(m.status==='recognizing text'?'글자와 날짜 칸을 읽는 중…':'문자 인식 엔진 준비 중…',Math.round((m.progress||0)*100));}
    });
    if(this.cancelled){await worker.terminate();this.check();}
    this.worker=worker;return worker;
  }
  async ocr(canvas){
    const worker=await this.getWorker();this.check();
    await worker.setParameters({tessedit_pageseg_mode:this.options.mode==='list'?'3':'11',preserve_interword_spaces:'1'});
    let {data}=await worker.recognize(canvas);this.check();
    const words=(data.words||[]).filter(w=>w.text.trim()).map(w=>({text:w.text,...w.bbox}));
    let result=positionedText(words,{...this.options,width:canvas.width});
    if(!result.calendar&&!/\d{1,4}\s*[-./년월]\s*\d{1,2}/.test(result.text)&&this.options.mode!=='calendar'){
      // Sparse-text mode can lose punctuation in dense list documents. Retry as one text block.
      await worker.setParameters({tessedit_pageseg_mode:'6'});const retry=await worker.recognize(canvas);this.check();
      if(/\d{1,4}\s*[-./년월]\s*\d{1,2}/.test(retry.data.text)&&retry.data.confidence>=data.confidence-10)result={text:retry.data.text,raw:retry.data.text,warnings:[],calendar:false};
    }
    if(!words.length&&data.text.trim())result={text:data.text,raw:data.text,warnings:[],calendar:false};
    if(data.confidence<60)result.warnings.push('사진의 글자가 흐리거나 작습니다. 달력 부분을 크게 촬영하고 제목·시간을 확인해 주세요.');
    return result;
  }
  async image(file){
    const url=URL.createObjectURL(file);
    try{
      const img=new Image();img.src=url;await img.decode();this.check();
      if(img.naturalWidth*img.naturalHeight>50000000)throw Error('사진 해상도가 너무 큽니다. 필요한 달력 부분만 잘라 주세요.');
      const scale=Math.min(2,3500/Math.max(img.naturalWidth,img.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      return await this.ocr(canvas);
    }catch(e){if(e.name==='EncodingError')throw Error('사진을 열지 못했습니다. JPG·PNG·WEBP로 저장해 다시 넣어 주세요.');throw e;}
    finally{URL.revokeObjectURL(url);}
  }
  pdfWords(content,viewport,pdfjs){
    const tokens=[];
    for(const item of content.items){
      if(!('str'in item)||!item.str.trim())continue;
      const tr=pdfjs.Util.transform(viewport.transform,item.transform),height=Math.hypot(tr[2],tr[3])||10;
      const fullWidth=item.width*viewport.scale;
      for(const match of item.str.matchAll(/\S+/g)){
        tokens.push({text:match[0],x0:tr[4]+fullWidth*match.index/item.str.length,x1:tr[4]+fullWidth*(match.index+match[0].length)/item.str.length,y0:tr[5]-height,y1:tr[5]});
      }
    }
    // Embedded CJK fonts often emit one glyph at a time. Join adjacent glyphs without adding spaces.
    return groupWords(tokens).flatMap(row=>{const merged=[];for(const word of row.words){const last=merged.at(-1);if(last&&word.x0-last.x1<Math.min(word.y1-word.y0,last.y1-last.y0)*.12){last.text+=word.text;last.x1=word.x1;}else merged.push({...word});}return merged;});
  }
  async pdf(file){
    const pdfjs=await import('./vendor/pdf.mjs');this.check();pdfjs.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;
    const task=pdfjs.getDocument({data:await file.arrayBuffer(),isEvalSupported:false});this.task=task;
    try{
      const doc=await task.promise;this.check();if(doc.numPages>20)throw Error('PDF는 최대 20쪽까지 지원합니다. 필요한 페이지만 별도 저장해 주세요.');
      const results=[];
      for(let n=1;n<=doc.numPages;n++){
        this.check();this.onProgress(`PDF ${n}/${doc.numPages}쪽의 글자·표 읽는 중…`,n/doc.numPages*100);
        const page=await doc.getPage(n),viewport=page.getViewport({scale:1}),content=await page.getTextContent();this.check();
        const words=this.pdfWords(content,viewport,pdfjs);let result=positionedText(words,{...this.options,width:viewport.width});
        const hasDate=/\d{4}\s*(?:[-./]|년)\s*\d{1,2}\s*(?:[-./]|월)\s*\d{1,2}/.test(result.text);
        // Scanned pages can still have a selectable heading. Check images as well as text length.
        let scanned=result.raw.trim().length<10;
        if(!hasDate||result.raw.trim().length<80){const ops=await page.getOperatorList();scanned||=ops.fnArray.some(code=>[pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageMaskXObject].includes(code));}
        if(scanned){
          const renderViewport=page.getViewport({scale:Math.min(3,3500/Math.max(viewport.width,viewport.height))});
          const canvas=document.createElement('canvas');canvas.width=Math.ceil(renderViewport.width);canvas.height=Math.ceil(renderViewport.height);
          await page.render({canvasContext:canvas.getContext('2d'),viewport:renderViewport}).promise;this.check();
          const recognized=await this.ocr(canvas);if(recognized.raw.trim())result=recognized;
        }
        results.push({...result,name:`${n}쪽`});
      }
      return results;
    }catch(e){if(e.name==='PasswordException')throw Error('암호가 걸린 PDF입니다. 암호 없이 다시 저장해 주세요.');throw e;}
    finally{await task.destroy();if(this.task===task)this.task=null;}
  }
  async read(file){
    const ext=file.name.split('.').pop().toLowerCase();this.check();
    if(['jpg','jpeg','png','webp'].includes(ext))return [await this.image(file)];
    if(ext==='pdf')return this.pdf(file);
    if(ext==='xlsx')return readExcel(file,this.options);
    if(ext==='docx')return readWord(file,this.options);
    if(ext==='xls'||ext==='doc')throw Error('구형 .xls·.doc 파일은 Excel·Word에서 .xlsx·.docx로 다시 저장한 뒤 넣어 주세요.');
    throw Error('지원하지 않는 파일입니다. JPG·PNG·WEBP·PDF·XLSX·DOCX·TXT·CSV·ICS를 사용해 주세요.');
  }
}
